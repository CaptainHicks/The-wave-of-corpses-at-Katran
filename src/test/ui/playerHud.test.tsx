import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createResources } from "../../domain/constants";
import type { GameState, PlayerState } from "../../domain/types";
import { PlayerHud } from "../../ui/Hud/PlayerHud";

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "p1",
    name: "A",
    color: "#d84f3f",
    resources: createResources(),
    devCards: [{ id: "secret-1", type: "secretBase", purchasedTurn: 1, revealed: true }],
    militia: [
      { id: "m1", ownerId: "p1", vertexId: "v1", status: "active" },
      { id: "m2", ownerId: "p1", vertexId: "v2", status: "active" },
      { id: "m3", ownerId: "p1", vertexId: "v3", status: "active" }
    ],
    defenderTokens: 1,
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

function scoringState(): GameState {
  const p1 = player();
  return {
    players: [p1],
    currentPlayerId: p1.id,
    phase: "action",
    board: {
      tiles: {},
      edges: {},
      vertices: {
        v1: { id: "v1", x: 0, y: 0, tileIds: [], edgeIds: [], building: { ownerId: p1.id, type: "camp" } },
        v2: { id: "v2", x: 0, y: 0, tileIds: [], edgeIds: [], building: { ownerId: p1.id, type: "fortress" } },
        v3: { id: "v3", x: 0, y: 0, tileIds: [], edgeIds: [] }
      },
      rows: []
    },
    zombieTrack: 0,
    zombieTileId: "t1",
    merchant: { tileId: "t1", controllerId: p1.id },
    devDeck: [],
    log: [],
    rng: { seed: "score", counter: 0 },
    turn: 1,
    setup: { order: [p1.id], placementIndex: 0, round: 1 },
    awards: {
      longestSupply: { playerId: p1.id, length: 5 },
      strongestMilitia: { playerId: p1.id, count: 3 }
    }
  };
}

describe("PlayerHud", () => {
  it("marks only the current player's card as active", () => {
    const state = scoringState();
    const p2 = player({
      id: "p2",
      name: "B",
      color: "#2b78d4",
      devCards: [],
      militia: [],
      defenderTokens: 0
    });
    state.players = [state.players[0], p2];
    state.currentPlayerId = p2.id;

    const { container } = render(<PlayerHud state={state} />);
    const cards = container.querySelectorAll(".player-hud-card");

    expect(cards[0]).not.toHaveClass("current-turn");
    expect(cards[0]?.querySelector(".faction-portrait")).not.toHaveClass("turn-glow");
    expect(cards[0]?.querySelector(".current-player-signal")).toBeNull();
    expect(cards[1]).toHaveClass("current-turn");
    expect(cards[1]?.querySelector(".faction-portrait")).not.toHaveClass("turn-glow");
    expect(cards[1]?.querySelector(".current-player-signal")).toBeInTheDocument();
  });

  it("shows militia as the deployed count without a piece-pool fraction", () => {
    const { container } = render(<PlayerHud state={scoringState()} />);
    const statusText = container.querySelector(".public-stat-grid")?.textContent ?? "";

    expect(statusText).toContain("民兵3");
    expect(statusText).not.toMatch(/民兵\d+\/\d+/);
  });

  it("opens a score breakdown dialog from the score badge", () => {
    render(<PlayerHud state={scoringState()} />);

    fireEvent.click(screen.getByRole("button", { name: "A当前得分：10，查看得分明细" }));

    const dialog = screen.getByRole("dialog", { name: "A 得分明细" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("总分 10")).toBeInTheDocument();
    expect(within(dialog).getByText("营地")).toBeInTheDocument();
    expect(within(dialog).getByText("1 座 × 1 分")).toBeInTheDocument();
    expect(within(dialog).getByText("堡垒")).toBeInTheDocument();
    expect(within(dialog).getByText("1 座 × 2 分")).toBeInTheDocument();
    expect(within(dialog).getByText("最长补给线")).toBeInTheDocument();
    expect(within(dialog).getByText("拥有最长补给线")).toBeInTheDocument();
    expect(within(dialog).getByText("最强民兵")).toBeInTheDocument();
    expect(within(dialog).getByText("拥有最大民兵规模")).toBeInTheDocument();
    expect(within(dialog).getByText("秘密据点")).toBeInTheDocument();
    expect(within(dialog).getByText("1 张已公开")).toBeInTheDocument();
    expect(within(dialog).getByText("卡坦保卫者")).toBeInTheDocument();
    expect(within(dialog).getByText("1 枚得分牌")).toBeInTheDocument();
    expect(within(dialog).getByText("商人")).toBeInTheDocument();
    expect(within(dialog).getByText("当前控制商人")).toBeInTheDocument();
  });
});
