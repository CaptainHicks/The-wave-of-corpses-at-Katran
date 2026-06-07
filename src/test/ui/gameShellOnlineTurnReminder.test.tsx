import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, legalInitialCampVertices } from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { GameShell } from "../../ui/GameShell";

function players() {
  return [
    { name: "赤锈营地", color: "#d84f3f" },
    { name: "蓝钢哨站", color: "#2b78d4" },
    { name: "绿洲车队", color: "#209468" }
  ];
}

function createState() {
  return applyCommand(undefined, { type: "createGame", players: players(), seed: "online-turn-reminder" });
}

function renderGameShell({
  state = createState(),
  viewerPlayerId = "p1",
  interactionMode = "online"
}: {
  state?: GameState;
  viewerPlayerId?: string;
  interactionMode?: "hot-seat" | "online";
} = {}) {
  return render(
    <GameShell
      state={state}
      privacy={false}
      seatPlayerName="赤锈营地"
      viewerPlayerId={viewerPlayerId}
      interactionMode={interactionMode}
      tool="none"
      animationEvents={[]}
      animationBusy={false}
      onClosePrivacy={vi.fn()}
      onDismissError={vi.fn()}
      onClear={vi.fn()}
      submit={vi.fn()}
      setTool={vi.fn()}
      setSelection={vi.fn()}
    />
  );
}

describe("GameShell online turn reminder", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.clearAllTimers();
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("shows and auto-hides a centered reminder when an online viewer becomes active", () => {
    renderGameShell({ viewerPlayerId: "p1", interactionMode: "online" });

    expect(screen.getByText("轮到你了")).toBeInTheDocument();
    expect(screen.getByText("赤锈营地，开始你的行动。")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();
  });

  it("does not show the reminder in hot-seat mode or while waiting for another online player", () => {
    const { rerender } = renderGameShell({ viewerPlayerId: "p1", interactionMode: "hot-seat" });

    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();

    const state = createState();
    rerender(
      <GameShell
        state={state}
        privacy={false}
        seatPlayerName="蓝钢哨站"
        viewerPlayerId="p2"
        interactionMode="online"
        tool="none"
        animationEvents={[]}
        animationBusy={false}
        onClosePrivacy={vi.fn()}
        onDismissError={vi.fn()}
        onClear={vi.fn()}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();
  });

  it("shows again when the online active player changes to this viewer on a later turn", () => {
    const state = createState();
    const { rerender } = renderGameShell({ state, viewerPlayerId: "p2", interactionMode: "online" });

    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();

    rerender(
      <GameShell
        state={{ ...state, currentPlayerId: "p2", turn: state.turn + 1 }}
        privacy={false}
        seatPlayerName="蓝钢哨站"
        viewerPlayerId="p2"
        interactionMode="online"
        tool="none"
        animationEvents={[]}
        animationBusy={false}
        onClosePrivacy={vi.fn()}
        onDismissError={vi.fn()}
        onClear={vi.fn()}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    expect(screen.getByText("轮到你了")).toBeInTheDocument();
    expect(screen.getByText("蓝钢哨站，开始你的行动。")).toBeInTheDocument();
  });

  it("does not remind the same online viewer again for the setup route after placing a camp", () => {
    const state = createState();
    const { rerender } = renderGameShell({ state, viewerPlayerId: "p1", interactionMode: "online" });

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();

    const nextState = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    rerender(
      <GameShell
        state={nextState}
        privacy={false}
        seatPlayerName="赤锈营地"
        viewerPlayerId="p1"
        interactionMode="online"
        tool="none"
        animationEvents={[]}
        animationBusy={false}
        onClosePrivacy={vi.fn()}
        onDismissError={vi.fn()}
        onClear={vi.fn()}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();
  });

  it("does not remind the same online viewer again when rolling seven creates zombie movement", () => {
    const state = { ...createState(), phase: "prepare" as const, turn: 2 };
    const { rerender } = renderGameShell({ state, viewerPlayerId: "p1", interactionMode: "online" });

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();

    const nextState = applyCommand(state, { type: "rollDice", forced: [3, 4] });
    expect(nextState.pending?.kind).toBe("moveZombie");
    rerender(
      <GameShell
        state={nextState}
        privacy={false}
        seatPlayerName="赤锈营地"
        viewerPlayerId="p1"
        interactionMode="online"
        tool="none"
        animationEvents={[]}
        animationBusy={false}
        onClosePrivacy={vi.fn()}
        onDismissError={vi.fn()}
        onClear={vi.fn()}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();
  });

  it("does not remind the same online viewer again after another player briefly becomes active in the same turn", () => {
    const state = { ...createState(), phase: "zombie" as const, turn: 2 };
    const { rerender } = renderGameShell({ state, viewerPlayerId: "p1", interactionMode: "online" });

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();

    rerender(
      <GameShell
        state={{ ...state, pending: { kind: "discard", playerId: "p2", amount: 1 } }}
        privacy={false}
        seatPlayerName="赤锈营地"
        viewerPlayerId="p1"
        interactionMode="online"
        tool="none"
        animationEvents={[]}
        animationBusy={false}
        onClosePrivacy={vi.fn()}
        onDismissError={vi.fn()}
        onClear={vi.fn()}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );
    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();

    rerender(
      <GameShell
        state={{ ...state, pending: { kind: "moveZombie", playerId: "p1", stealAfterMove: true } }}
        privacy={false}
        seatPlayerName="赤锈营地"
        viewerPlayerId="p1"
        interactionMode="online"
        tool="none"
        animationEvents={[]}
        animationBusy={false}
        onClosePrivacy={vi.fn()}
        onDismissError={vi.fn()}
        onClear={vi.fn()}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    expect(screen.queryByText("轮到你了")).not.toBeInTheDocument();
  });
});
