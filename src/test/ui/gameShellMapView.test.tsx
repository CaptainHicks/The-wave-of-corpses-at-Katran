import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, legalInitialCampVertices } from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { GameShell } from "../../ui/GameShell";

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function renderGameShell(options: { state?: GameState; submit?: ReturnType<typeof vi.fn> } = {}) {
  const state = options.state ?? applyCommand(undefined, { type: "createGame", players: players(), seed: "map-view-zoom" });
  const setSelection = vi.fn();
  const submit = options.submit ?? vi.fn();

  const view = render(
    <GameShell
      state={state}
      privacy={false}
      seatPlayerName="A"
      viewerPlayerId="p1"
      interactionMode="hot-seat"
      tool="none"
      animationEvents={[]}
      animationBusy={false}
      onClosePrivacy={vi.fn()}
      onDismissError={vi.fn()}
      onClear={vi.fn()}
      submit={submit}
      setTool={vi.fn()}
      setSelection={setSelection}
    />
  );
  return { ...view, state, submit };
}

function renderGameShellWithSiegeAlert() {
  const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "siege-alert" });

  return render(
    <GameShell
      state={state}
      privacy={false}
      seatPlayerName="A"
      viewerPlayerId="p1"
      interactionMode="hot-seat"
      tool="none"
      animationEvents={[
        {
          id: "siege-alert",
          kind: "zombieSiege" as never,
          turn: 1,
          createdAt: Date.now(),
          durationMs: 2400
        }
      ]}
      animationBusy={true}
      onClosePrivacy={vi.fn()}
      onDismissError={vi.fn()}
      onClear={vi.fn()}
      submit={vi.fn()}
      setTool={vi.fn()}
      setSelection={vi.fn()}
    />
  );
}

function readMapPanTransform(element: HTMLElement) {
  const match = element.style.transform.match(
    /^translate3d\(calc\(-50% \+ (-?\d+(?:\.\d+)?)px\), calc\(-50% \+ (-?\d+(?:\.\d+)?)px\), 0\)$/
  );
  if (!match) throw new Error(`Unexpected map transform: ${element.style.transform}`);
  return {
    x: Number.parseFloat(match[1]),
    y: Number.parseFloat(match[2])
  };
}

function readMapScaleTransform(element: HTMLElement) {
  const match = element.style.transform.match(/^scale\((-?\d+(?:\.\d+)?)\)$/);
  if (!match) throw new Error(`Unexpected map scale transform: ${element.style.transform}`);
  return Number.parseFloat(match[1]);
}

function dispatchPointerEvent(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { pointerId: number; button?: number; buttons?: number; clientX: number; clientY: number; pointerType?: string }
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? 0 },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerType: { value: init.pointerType ?? "mouse" }
  });
  fireEvent(target, event);
}

describe("GameShell map view", () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1672 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 941 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.classList.contains("map-layer") ? 1000 : 0;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.classList.contains("map-layer") ? 600 : 0;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return this.classList.contains("map-world") ? 2200 : 0;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.classList.contains("map-world") ? 1400 : 0;
      }
    });
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(pointer: fine)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    if (originalInnerWidth) Object.defineProperty(window, "innerWidth", originalInnerWidth);
    if (originalInnerHeight) Object.defineProperty(window, "innerHeight", originalInnerHeight);
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("keeps the same map and button proportions on coarse pointers", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: "(pointer: coarse)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })) as typeof window.matchMedia;

    const { container } = renderGameShell();
    const shell = container.querySelector(".game-shell") as HTMLElement;
    const scaleWorld = container.querySelector(".map-scale-world") as HTMLElement;

    expect(readMapScaleTransform(scaleWorld)).toBe(0.7);
    expect(shell.style.getPropertyValue("--touch-target-min")).toBe("");
  });

  it("keeps the panned viewport center anchored when zooming", async () => {
    const { container } = renderGameShell();
    const layer = container.querySelector(".map-layer") as HTMLElement;
    const world = container.querySelector(".map-world") as HTMLElement;
    const scaleWorld = container.querySelector(".map-scale-world") as HTMLElement;

    dispatchPointerEvent(layer, "pointerdown", { pointerId: 1, button: 0, clientX: 500, clientY: 300 });
    dispatchPointerEvent(layer, "pointermove", { pointerId: 1, buttons: 1, clientX: 640, clientY: 380 });

    await waitFor(() => expect(readMapPanTransform(world).x).toBeCloseTo(140));
    expect(readMapPanTransform(world).y).toBeCloseTo(80);

    fireEvent.wheel(layer, { deltaY: -100 });

    const zoomRatio = 0.88 / 0.7;
    await waitFor(() => expect(readMapScaleTransform(scaleWorld)).toBe(0.88));
    expect(readMapPanTransform(world).x).toBeCloseTo(140 * zoomRatio);
    expect(readMapPanTransform(world).y).toBeCloseTo(80 * zoomRatio);
  });

  it("coalesces small wheel deltas into one proportional zoom update", async () => {
    const { container } = renderGameShell();
    const layer = container.querySelector(".map-layer") as HTMLElement;
    const scaleWorld = container.querySelector(".map-scale-world") as HTMLElement;

    fireEvent.wheel(layer, { deltaY: -10 });
    fireEvent.wheel(layer, { deltaY: -10 });
    fireEvent.wheel(layer, { deltaY: -10 });
    fireEvent.wheel(layer, { deltaY: -10 });

    await waitFor(() => expect(readMapScaleTransform(scaleWorld)).toBe(0.77));
  });

  it("converts pointer movement back into fixed stage coordinates after scaling", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 836 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 470.5 });

    const { container } = renderGameShell();
    const layer = container.querySelector(".map-layer") as HTMLElement;
    const world = container.querySelector(".map-world") as HTMLElement;
    const shell = container.querySelector(".game-shell") as HTMLElement;

    expect(shell.style.getPropertyValue("--game-stage-scale")).toBe("0.5");

    dispatchPointerEvent(layer, "pointerdown", { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    dispatchPointerEvent(layer, "pointermove", { pointerId: 1, buttons: 1, clientX: 170, clientY: 140 });

    await waitFor(() => expect(readMapPanTransform(world).x).toBeCloseTo(140));
    expect(readMapPanTransform(world).y).toBeCloseTo(80);
  });

  it("does not turn tiny tap jitter into a map pan after stage scaling", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 836 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 470.5 });

    const { container } = renderGameShell();
    const layer = container.querySelector(".map-layer") as HTMLElement;
    const world = container.querySelector(".map-world") as HTMLElement;

    dispatchPointerEvent(layer, "pointerdown", { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    dispatchPointerEvent(layer, "pointermove", { pointerId: 1, buttons: 1, clientX: 104, clientY: 100 });

    expect(readMapPanTransform(world).x).toBeCloseTo(0);
    expect(readMapPanTransform(world).y).toBeCloseTo(0);
  });

  it("leaves single touch taps on board targets for the board click handler", () => {
    const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "touch-tap-board-target" });
    const submit = vi.fn();
    const { container } = renderGameShell({ state, submit });
    const vertexId = legalInitialCampVertices(state)[0];
    const target = container.querySelector(`[data-vertex-id="${vertexId}"]`)!;

    dispatchPointerEvent(target, "pointerdown", {
      pointerId: 1,
      clientX: 420,
      clientY: 320,
      pointerType: "touch"
    });
    dispatchPointerEvent(target, "pointerup", {
      pointerId: 1,
      clientX: 420,
      clientY: 320,
      pointerType: "touch"
    });
    fireEvent.click(target);

    expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith({ type: "placeInitialCamp", vertexId });
  });

  it("leaves single touch taps on zombie move tiles for the tile click handler", () => {
    const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "touch-tap-zombie-tile" });
    const tileId = Object.values(state.board.tiles).find((tile) => tile.revealed && tile.id !== state.zombieTileId)!.id;
    const pendingState: GameState = {
      ...state,
      phase: "zombie",
      pending: {
        kind: "moveZombie",
        playerId: state.currentPlayerId,
        stealAfterMove: true
      }
    };
    const submit = vi.fn();
    const { container } = renderGameShell({ state: pendingState, submit });
    const target = container.querySelector(`[data-tile-id="${tileId}"]`)!;

    dispatchPointerEvent(target, "pointerdown", {
      pointerId: 1,
      clientX: 420,
      clientY: 320,
      pointerType: "touch"
    });
    dispatchPointerEvent(target, "pointerup", {
      pointerId: 1,
      clientX: 420,
      clientY: 320,
      pointerType: "touch"
    });
    fireEvent.click(target);

    expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith({ type: "moveZombie", tileId });
  });

  it("captures board-target touch gestures once they become a map pan", async () => {
    const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "touch-pan-from-board-target" });
    const { container } = renderGameShell({ state });
    const layer = container.querySelector(".map-layer") as HTMLElement;
    const world = container.querySelector(".map-world") as HTMLElement;
    const vertexId = legalInitialCampVertices(state)[0];
    const target = container.querySelector(`[data-vertex-id="${vertexId}"]`)!;

    dispatchPointerEvent(target, "pointerdown", {
      pointerId: 1,
      clientX: 420,
      clientY: 320,
      pointerType: "touch"
    });
    dispatchPointerEvent(layer, "pointermove", {
      pointerId: 1,
      buttons: 1,
      clientX: 452,
      clientY: 348,
      pointerType: "touch"
    });

    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(1);
    await waitFor(() => expect(readMapPanTransform(world).x).toBeCloseTo(32));
    expect(readMapPanTransform(world).y).toBeCloseTo(28);
  });

  it("supports pinch zoom and two-finger panning on touch devices", async () => {
    const { container } = renderGameShell();
    const layer = container.querySelector(".map-layer") as HTMLElement;
    const world = container.querySelector(".map-world") as HTMLElement;
    const scaleWorld = container.querySelector(".map-scale-world") as HTMLElement;

    dispatchPointerEvent(layer, "pointerdown", { pointerId: 1, clientX: 400, clientY: 300, pointerType: "touch" });
    dispatchPointerEvent(layer, "pointerdown", { pointerId: 2, clientX: 600, clientY: 300, pointerType: "touch" });
    dispatchPointerEvent(layer, "pointermove", { pointerId: 1, clientX: 450, clientY: 300, pointerType: "touch" });
    dispatchPointerEvent(layer, "pointermove", { pointerId: 2, clientX: 750, clientY: 380, pointerType: "touch" });

    await waitFor(() => expect(readMapScaleTransform(scaleWorld)).toBeCloseTo(1.09, 2));
    expect(readMapPanTransform(world).x).toBeCloseTo(100, 0);
    expect(readMapPanTransform(world).y).toBeCloseTo(40, 0);
  });

  it("shows a temporary centered zombie siege alert", () => {
    const { container, getByText } = renderGameShellWithSiegeAlert();

    expect(getByText("尸潮围城")).toBeInTheDocument();
    expect(getByText("所有防线接受尸潮冲击")).toBeInTheDocument();
    expect(container.querySelector(".zombie-siege-alert")).toHaveStyle({ "--siege-alert-duration": "2400ms" });
  });
});
