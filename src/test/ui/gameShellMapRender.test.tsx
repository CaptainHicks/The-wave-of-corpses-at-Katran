import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand } from "../../domain/rules";

const { renderCounts } = vi.hoisted(() => ({
  renderCounts: {
    playerHud: 0
  }
}));

vi.mock("../../ui/Hud/PlayerHud", () => ({
  PlayerHud: () => {
    renderCounts.playerHud += 1;
    return <div data-testid="player-hud" />;
  }
}));

import { GameShell } from "../../ui/GameShell";

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function renderGameShell() {
  const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "map-view-render" });

  return render(
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
      onImportState={vi.fn()}
      submit={vi.fn()}
      setTool={vi.fn()}
      setSelection={vi.fn()}
    />
  );
}

function dispatchPointerEvent(
  target: HTMLElement,
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

describe("GameShell map rendering", () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

  beforeEach(() => {
    renderCounts.playerHud = 0;
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
  });

  afterEach(() => {
    if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    if (originalInnerWidth) Object.defineProperty(window, "innerWidth", originalInnerWidth);
    if (originalInnerHeight) Object.defineProperty(window, "innerHeight", originalInnerHeight);
    vi.restoreAllMocks();
  });

  it("keeps HUD renders stable during incremental pan and zoom updates", () => {
    const { container } = renderGameShell();
    const layer = container.querySelector(".map-layer") as HTMLElement;

    expect(renderCounts.playerHud).toBe(1);

    dispatchPointerEvent(layer, "pointerdown", { pointerId: 1, button: 0, clientX: 500, clientY: 300 });
    dispatchPointerEvent(layer, "pointermove", { pointerId: 1, buttons: 1, clientX: 640, clientY: 380 });

    const renderCountAfterPanStart = renderCounts.playerHud;
    expect(renderCountAfterPanStart).toBe(2);

    dispatchPointerEvent(layer, "pointermove", { pointerId: 1, buttons: 1, clientX: 700, clientY: 420 });
    fireEvent.wheel(layer, { deltaY: -1 });

    expect(renderCounts.playerHud).toBe(renderCountAfterPanStart);
  });
});
