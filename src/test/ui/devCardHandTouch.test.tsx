import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, PlayerState } from "../../domain/types";
import { DevCardHand } from "../../ui/Cards/DevCardHand";

function createPlayer(devCards: PlayerState["devCards"] = [{ id: "dev-1", type: "airdrop", purchasedTurn: 1 }]): PlayerState {
  return {
    id: "p1",
    name: "A",
    color: "#d84f3f",
    resources: { food: 0, wood: 0, metal: 0, fuel: 0, ammo: 0 },
    devCards,
    militia: [],
    defenderTokens: 0,
    movedConvoyThisTurn: false,
    pieces: {
      camps: 0,
      fortresses: 0,
      transports: 0,
      convoys: 0,
      militia: 0,
      watchtowers: 0
    },
    usedDevCardThisTurn: false
  };
}

function createState(player: PlayerState): GameState {
  return {
    players: [player],
    currentPlayerId: player.id,
    phase: "action",
    board: { tiles: {}, edges: {}, vertices: {}, rows: [] },
    zombieTrack: 0,
    zombieTileId: "t1",
    merchant: { tileId: "t1" },
    devDeck: [],
    log: [],
    rng: { seed: "touch-dev-card", counter: 0 },
    turn: 3,
    setup: { order: [player.id], placementIndex: 0, round: 1 },
    awards: {}
  };
}

function firePointer(
  target: Document | Node | Element | Window,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { pointerId: number; pointerType: "touch"; clientX: number; clientY: number }
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    pointerType: { value: init.pointerType },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    button: { value: 0 },
    buttons: { value: type === "pointerup" ? 0 : 1 }
  });
  fireEvent(target, event);
}

function mockCoarsePointer(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    media: "(pointer: coarse)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as typeof window.matchMedia;
}

describe("DevCardHand touch interactions", () => {
  const originalMatchMedia = window.matchMedia;
  const originalElementFromPoint = document.elementFromPoint;
  const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
  const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
  const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
  let elementFromPointMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    elementFromPointMock = vi.fn(() => document.body);
    mockCoarsePointer(true);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPointMock });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => true)
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: originalElementFromPoint });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: originalSetPointerCapture
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: originalReleasePointerCapture
    });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: originalHasPointerCapture
    });
    vi.restoreAllMocks();
  });

  it("selects the card under the touch point and retracts when the finger leaves", () => {
    const player = createPlayer([
      { id: "dev-1", type: "airdrop", purchasedTurn: 1 },
      { id: "dev-2", type: "requisition", purchasedTurn: 1 }
    ]);
    const submit = vi.fn();
    const { container } = render(
      <DevCardHand
        state={createState(player)}
        player={player}
        submit={submit}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    const cards = Array.from(container.querySelectorAll(".dev-hand-card")) as HTMLElement[];
    elementFromPointMock.mockImplementation((x: number) => {
      if (x < 100) return cards[0];
      if (x < 200) return cards[1];
      return document.body;
    });

    firePointer(cards[0], "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 300 });
    expect(cards[0]).toHaveClass("selected");
    expect(submit).not.toHaveBeenCalled();

    firePointer(window, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 150, clientY: 300 });
    expect(cards[0]).not.toHaveClass("selected");
    expect(cards[1]).toHaveClass("selected");

    firePointer(window, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 300 });
    expect(cards[1]).not.toHaveClass("selected");
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps sliding between cards fluid when the finger drifts slightly upward", () => {
    const player = createPlayer([
      { id: "dev-1", type: "airdrop", purchasedTurn: 1 },
      { id: "dev-2", type: "requisition", purchasedTurn: 1 }
    ]);
    const submit = vi.fn();
    const { container } = render(
      <DevCardHand
        state={createState(player)}
        player={player}
        submit={submit}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    const cards = Array.from(container.querySelectorAll(".dev-hand-card")) as HTMLElement[];
    elementFromPointMock.mockImplementation((x: number) => {
      if (x < 100) return cards[0];
      if (x < 200) return cards[1];
      return document.body;
    });

    firePointer(cards[0], "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 300 });
    firePointer(window, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 150, clientY: 280 });

    expect(cards[0]).not.toHaveClass("selected");
    expect(cards[0]).not.toHaveClass("touch-dragging");
    expect(cards[1]).toHaveClass("selected");
    expect(cards[1]).not.toHaveClass("touch-dragging");
    expect(submit).not.toHaveBeenCalled();
  });

  it("plays a touched card only after pulling it out of the hand", () => {
    const player = createPlayer();
    const submit = vi.fn();
    const { container } = render(
      <DevCardHand
        state={createState(player)}
        player={player}
        submit={submit}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    const card = container.querySelector(".dev-hand-card") as HTMLElement;
    elementFromPointMock.mockReturnValue(card);

    firePointer(card, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 300 });
    firePointer(window, "pointerup", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 300 });
    expect(submit).not.toHaveBeenCalled();
    expect(card).not.toHaveClass("selected");

    firePointer(card, "pointerdown", { pointerId: 2, pointerType: "touch", clientX: 50, clientY: 300 });
    firePointer(window, "pointermove", { pointerId: 2, pointerType: "touch", clientX: 50, clientY: 205 });
    expect(card).toHaveClass("selected");
    expect(card).toHaveClass("touch-dragging");
    expect(card).toHaveClass("touch-play-ready");

    firePointer(window, "pointerup", { pointerId: 2, pointerType: "touch", clientX: 50, clientY: 205 });
    expect(submit).toHaveBeenCalledWith({ type: "playDevelopmentCard", cardId: "dev-1" });
  });

  it("uses the pull-out threshold for touch even on devices that also report a fine pointer", () => {
    mockCoarsePointer(false);
    const player = createPlayer();
    const submit = vi.fn();
    const { container } = render(
      <DevCardHand
        state={createState(player)}
        player={player}
        submit={submit}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    const card = container.querySelector(".dev-hand-card") as HTMLElement;
    elementFromPointMock.mockReturnValue(card);

    firePointer(card, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 300 });
    firePointer(window, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 255 });
    expect(card).toHaveClass("touch-dragging");

    firePointer(window, "pointerup", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 255 });
    expect(submit).not.toHaveBeenCalled();
    expect(card).not.toHaveClass("selected");

    firePointer(card, "pointerdown", { pointerId: 2, pointerType: "touch", clientX: 50, clientY: 300 });
    firePointer(window, "pointermove", { pointerId: 2, pointerType: "touch", clientX: 50, clientY: 205 });
    firePointer(window, "pointerup", { pointerId: 2, pointerType: "touch", clientX: 50, clientY: 205 });

    expect(submit).toHaveBeenCalledWith({ type: "playDevelopmentCard", cardId: "dev-1" });
  });

  it("clears the selected card when tapping outside the hand", () => {
    const player = createPlayer();
    const { container } = render(
      <DevCardHand
        state={createState(player)}
        player={player}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    const card = container.querySelector(".dev-hand-card") as HTMLElement;

    fireEvent.click(card);
    expect(card).toHaveClass("selected");

    firePointer(document.body, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 500, clientY: 500 });
    expect(card).not.toHaveClass("selected");
  });
});
