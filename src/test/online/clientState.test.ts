import { describe, expect, it } from "vitest";
import { createResources } from "../../domain/constants";
import { applyCommand, serializeStateForText } from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { materializeOnlineGameState } from "../../online/clientState";
import { buildOnlineGameView } from "../../online/protocol";

function players() {
  return [
    { name: "Player 1", color: "#d84f3f", factionId: "red-rust" },
    { name: "Player 2", color: "#2b78d4", factionId: "blue-steel" },
    { name: "Player 3", color: "#209468", factionId: "green-oasis" }
  ];
}

function createPendingTradeState(): GameState {
  let state = applyCommand(undefined, {
    type: "createGame",
    players: players(),
    seed: "online-client-state"
  });
  state = applyCommand(state, { type: "debugJumpPhase", phase: "action" });
  state.currentPlayerId = "p1";
  state = applyCommand(state, {
    type: "debugSetResources",
    playerId: "p1",
    resources: createResources({ food: 3, metal: 2 })
  });
  state = applyCommand(state, {
    type: "debugSetResources",
    playerId: "p2",
    resources: createResources({ wood: 2, ammo: 1 })
  });
  state.players[0].devCards = [
    { id: "p1-hidden", type: "merchant", purchasedTurn: 1 },
    { id: "p1-open", type: "secretBase", purchasedTurn: 1, revealed: true }
  ];
  state.players[1].devCards = [{ id: "p2-hidden", type: "roadCrew", purchasedTurn: 1 }];
  return applyCommand(state, {
    type: "playerTrade",
    targetPlayerId: "p2",
    offer: { food: 1 },
    request: { wood: 1 }
  });
}

describe("materializeOnlineGameState", () => {
  it("restores the viewer's private hand while keeping other players redacted", () => {
    const state = createPendingTradeState();
    const view = buildOnlineGameView(
      {
        roomCode: "ROOM12",
        hostPlayerId: "p1",
        status: "active",
        connectedPlayerIds: ["p1", "p2", "p3"]
      },
      state,
      "p2"
    );

    const materialized = materializeOnlineGameState(view);

    expect(materialized.players.find((player) => player.id === "p2")?.resources).toEqual(
      state.players[1].resources
    );
    expect(materialized.players.find((player) => player.id === "p2")?.devCards).toEqual(
      state.players[1].devCards
    );
    expect(materialized.players.find((player) => player.id === "p1")?.resources).toEqual(
      createResources()
    );
    expect(materialized.players.find((player) => player.id === "p1")?.devCards).toEqual([
      { id: "p1-open", type: "secretBase", purchasedTurn: 1, revealed: true }
    ]);
    expect(materialized.devDeck).toHaveLength(state.devDeck.length);
    expect(materialized.pending).toMatchObject({
      kind: "confirmTrade",
      playerId: "p2",
      actorId: "p1"
    });
  });

  it("emits online-aware text state with viewer resources and public counts for everyone else", () => {
    const state = createPendingTradeState();
    const view = buildOnlineGameView(
      {
        roomCode: "ROOM34",
        hostPlayerId: "p1",
        status: "active",
        connectedPlayerIds: ["p1", "p2", "p3"]
      },
      state,
      "p2"
    );
    const materialized = materializeOnlineGameState(view);
    const payload = JSON.parse(
      serializeStateForText(materialized, {
        mode: "online",
        viewerPlayerId: "p2",
        pendingPlayerId: view.publicState.pending?.playerId,
        playerSummaries: view.publicState.players
      })
    );

    expect(payload.mode).toBe("online");
    expect(payload.viewerPlayer).toBe("Player 2");
    expect(payload.pendingPlayerId).toBe("p2");
    expect(payload.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "p2", resources: state.players[1].resources }),
        expect.objectContaining({ id: "p1", resources: 5 }),
        expect.objectContaining({ id: "p3", resources: 0 })
      ])
    );
  });
});
