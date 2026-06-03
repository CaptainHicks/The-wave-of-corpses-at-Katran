import { describe, expect, it } from "vitest";
import { createResources } from "../../domain/constants";
import { applyCommand } from "../../domain/rules";
import type { Command, GameState } from "../../domain/types";
import { buildOnlineGameView, buildOnlineGameViews } from "../../online/protocol";

function players(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Player ${index + 1}`,
    color: ["#d84f3f", "#2b78d4", "#209468"][index] ?? "#777777",
    factionId: ["red-rust", "blue-steel", "green-oasis"][index]
  }));
}

function createPendingTradeState(): GameState {
  let state = applyCommand(undefined, {
    type: "createGame",
    players: players(),
    seed: "online-view"
  });
  state = applyCommand(state, { type: "debugJumpPhase", phase: "action" });
  state = applyCommand(state, {
    type: "debugSetResources",
    playerId: "p1",
    resources: createResources({ food: 4, wood: 1, metal: 2 })
  });
  state = applyCommand(state, {
    type: "debugSetResources",
    playerId: "p2",
    resources: createResources({ wood: 3, ammo: 2 })
  });
  state = applyCommand(state, {
    type: "debugSetResources",
    playerId: "p3",
    resources: createResources({ fuel: 5 })
  });
  state.players[0].devCards = [
    { id: "viewer-hidden", type: "merchant", purchasedTurn: 1 },
    { id: "viewer-revealed", type: "secretBase", purchasedTurn: 1, revealed: true }
  ];
  state.players[1].devCards = [
    { id: "target-hidden", type: "roadCrew", purchasedTurn: 1 },
    { id: "target-revealed", type: "secretBase", purchasedTurn: 1, revealed: true }
  ];
  return applyCommand(state, {
    type: "playerTrade",
    targetPlayerId: "p2",
    offer: { food: 2 },
    request: { wood: 1 }
  });
}

describe("buildOnlineGameView", () => {
  it("includes only the viewer's hidden hand details and keeps public summaries for everyone", () => {
    const state = createPendingTradeState();
    const lastCommand: Command = { type: "confirmPlayerTrade", accept: true };

    const view = buildOnlineGameView(
      {
        roomCode: "ROOM42",
        hostPlayerId: "p1",
        status: "active",
        connectedPlayerIds: ["p1", "p2"]
      },
      state,
      "p2",
      lastCommand
    );

    expect(view.kind).toBe("game");
    expect(view.viewerPlayerId).toBe("p2");
    expect(view.roomMeta.roomCode).toBe("ROOM42");
    expect(view.lastCommand).toEqual(lastCommand);
    expect(view.viewerPrivate.resources).toEqual(state.players[1].resources);
    expect(view.viewerPrivate.devCards).toEqual(state.players[1].devCards);
    expect(view.viewerPrivate.pending).toMatchObject({
      kind: "confirmTrade",
      playerId: "p2",
      actorId: "p1",
      targetPlayerId: "p2"
    });
    expect(view.publicState.players.find((player) => player.id === "p1")).toMatchObject({
      id: "p1",
      resourceCount: 7,
      devCardCount: 2
    });
    expect(view.publicState.players.find((player) => player.id === "p2")).toMatchObject({
      id: "p2",
      resourceCount: 5,
      devCardCount: 2
    });
    expect(view.publicState.devDeckCount).toBe(state.devDeck.length);
  });

  it("sanitizes pending details and hidden cards for spectators", () => {
    const state = createPendingTradeState();

    const view = buildOnlineGameView(
      {
        roomCode: "ROOM99",
        hostPlayerId: "p1",
        status: "active",
        connectedPlayerIds: ["p1", "p2", "p3"]
      },
      state,
      "p3"
    );

    expect(view.viewerPrivate.pending).toBeUndefined();
    expect(view.publicState.pending).toMatchObject({
      kind: "confirmTrade",
      playerId: "p2"
    });
    expect(view.publicState.pending).not.toHaveProperty("offer");
    expect(view.publicState.pending).not.toHaveProperty("request");
    expect(view.publicState.players.find((player) => player.id === "p1")?.revealedDevCards).toEqual([
      { id: "viewer-revealed", type: "secretBase", purchasedTurn: 1, revealed: true }
    ]);
    expect(view.publicState.players.find((player) => player.id === "p2")?.revealedDevCards).toEqual([
      { id: "target-revealed", type: "secretBase", purchasedTurn: 1, revealed: true }
    ]);
  });

  it("batch-builds per-viewer game views without changing private state visibility", () => {
    const state = createPendingTradeState();
    const roomMeta = {
      roomCode: "ROOM-BATCH",
      hostPlayerId: "p1",
      status: "active",
      connectedPlayerIds: ["p1", "p2", "p3"]
    } as const;
    const lastCommand: Command = { type: "endTurn" };

    const views = buildOnlineGameViews(roomMeta, state, ["p1", "p2", "p3"], lastCommand);
    const p1View = views.find((view) => view.viewerPlayerId === "p1")!;
    const p2View = views.find((view) => view.viewerPlayerId === "p2")!;
    const singleP2View = buildOnlineGameView(roomMeta, state, "p2", lastCommand);

    expect(views).toHaveLength(3);
    expect(p2View).toEqual(singleP2View);
    expect(p1View.viewerPrivate.resources).toEqual(state.players[0].resources);
    expect(p2View.viewerPrivate.resources).toEqual(state.players[1].resources);
    expect(p1View.publicState.players).toEqual(p2View.publicState.players);
    expect(p1View.lastCommand).toEqual(lastCommand);
  });
});
