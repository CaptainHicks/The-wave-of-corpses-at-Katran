import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createResources } from "../../domain/constants";
import type { GameState, PlayerState } from "../../domain/types";
import { GameShell } from "../../ui/GameShell";

function player(overrides: Partial<PlayerState>): PlayerState {
  return {
    id: "p1",
    name: "A",
    color: "#d84f3f",
    resources: createResources(),
    devCards: [],
    militia: [],
    defenderTokens: 0,
    movedConvoyThisTurn: false,
    pieces: {
      camps: 4,
      fortresses: 4,
      transports: 15,
      convoys: 8,
      militia: 12,
      watchtowers: 4
    },
    usedDevCardThisTurn: false,
    ...overrides
  };
}

function victoryState(): GameState {
  const p1 = player({ id: "p1", name: "A", color: "#d84f3f", defenderTokens: 1 });
  const p2 = player({ id: "p2", name: "B", color: "#2b78d4" });
  return {
    players: [p1, p2],
    currentPlayerId: p1.id,
    phase: "victory",
    board: {
      tiles: {},
      edges: {},
      vertices: {
        v1: { id: "v1", x: 0, y: 0, tileIds: [], edgeIds: [], building: { ownerId: p1.id, type: "camp" } },
        v2: { id: "v2", x: 72, y: 0, tileIds: [], edgeIds: [], building: { ownerId: p1.id, type: "fortress" } },
        v3: { id: "v3", x: 144, y: 0, tileIds: [], edgeIds: [], building: { ownerId: p2.id, type: "camp" } }
      },
      rows: []
    },
    zombieTrack: 0,
    zombieTileId: "t1",
    merchant: { tileId: "t1" },
    devDeck: [],
    log: [],
    rng: { seed: "victory", counter: 0 },
    turn: 12,
    setup: { order: [p1.id, p2.id], placementIndex: 0, round: 1 },
    awards: {
      longestSupply: { playerId: p1.id, length: 5 }
    },
    winnerId: p1.id
  };
}

describe("Victory settlement", () => {
  it("shows a central settlement dialog with standings and a return action", () => {
    const onClear = vi.fn();
    render(
      <GameShell
        state={victoryState()}
        privacy={false}
        seatPlayerName="A"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        tool="none"
        animationEvents={[]}
        animationBusy={false}
        onClosePrivacy={vi.fn()}
        onDismissError={vi.fn()}
        onClear={onClear}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "胜利结算" });

    expect(within(dialog).getByText("冠军")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "A" })).toBeInTheDocument();
    expect(within(dialog).getByText("总分 6")).toBeInTheDocument();
    expect(within(dialog).getByText("B")).toBeInTheDocument();
    expect(within(dialog).getByText("总分 1")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "返回主页面" }));

    expect(onClear).toHaveBeenCalledOnce();
  });
});
