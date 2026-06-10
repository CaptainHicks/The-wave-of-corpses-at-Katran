import { describe, expect, it } from "vitest";
import { activeDecisionPlayer, chooseAiCommand, isAiPlayer, refreshActiveAiStrategy } from "../../domain/ai";
import { adjacentPlayersToTile } from "../../domain/board";
import { COSTS, createResources } from "../../domain/constants";
import { applyCommand, calculateScore, legalInitialCampVertices, legalInitialRouteEdges } from "../../domain/rules";
import type { GameState } from "../../domain/types";

function createSoloGame(): GameState {
  return applyCommand(undefined, {
    type: "createGame",
    players: [
      { name: "Human", color: "#d84f3f", controller: "human" },
      { name: "AI One", color: "#2b78d4", controller: "ai" },
      { name: "AI Two", color: "#209468", controller: "ai" }
    ],
    seed: "solo-ai-1",
    fogEnabled: false
  });
}

function applyAiUntilHuman(state: GameState, limit = 120): GameState {
  let next = state;
  for (let step = 0; step < limit && isAiPlayer(activeDecisionPlayer(next)); step += 1) {
    const command = chooseAiCommand(next);
    expect(command).toBeTruthy();
    next = applyCommand(next, command!);
  }
  expect(isAiPlayer(activeDecisionPlayer(next))).toBe(false);
  return next;
}

function placeHumanSetupPair(state: GameState): GameState {
  let next = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
  next = applyCommand(next, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(next)[0] });
  return next;
}

function createAiActionGame(): GameState {
  let state = applyCommand(undefined, {
    type: "createGame",
    players: [
      { name: "AI One", color: "#d84f3f", controller: "ai" },
      { name: "AI Two", color: "#2b78d4", controller: "ai" },
      { name: "AI Three", color: "#209468", controller: "ai" }
    ],
    seed: "ai-strategy-game",
    fogEnabled: false
  });
  while (state.phase === "setup") {
    const command = chooseAiCommand(state);
    expect(command).toBeTruthy();
    state = applyCommand(state, command!);
  }
  state.currentPlayerId = "p1";
  return applyCommand(state, { type: "rollDice", forced: [1, 1] });
}

describe("local AI player", () => {
  it("preserves controller ownership in the created game", () => {
    const state = createSoloGame();

    expect(state.players.map((player) => player.controller)).toEqual(["human", "ai", "ai"]);
    expect(chooseAiCommand(state)).toBeUndefined();
  });

  it("completes AI setup placements and returns control to the human", () => {
    let state = placeHumanSetupPair(createSoloGame());
    state = applyAiUntilHuman(state);

    expect(state.phase).toBe("setup");
    expect(state.currentPlayerId).toBe("p1");
    expect(Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === "p2")).toHaveLength(2);
    expect(Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === "p3")).toHaveLength(2);
    expect(Object.values(state.board.edges).filter((edge) => edge.route?.ownerId === "p2")).toHaveLength(2);
    expect(Object.values(state.board.edges).filter((edge) => edge.route?.ownerId === "p3")).toHaveLength(2);
  });

  it("plays full AI turns and hands the next turn back to the human", () => {
    let state = placeHumanSetupPair(createSoloGame());
    state = applyAiUntilHuman(state);
    state = placeHumanSetupPair(state);
    expect(state.phase).toBe("prepare");

    state = applyCommand(state, { type: "rollDice", forced: [3, 3] });
    state = applyCommand(state, { type: "endTurn" });
    state = applyAiUntilHuman(state);

    expect(state.currentPlayerId).toBe("p1");
    expect(state.phase).toBe("prepare");
    expect(state.turn).toBeGreaterThan(3);
  });

  it("takes a winning fortress upgrade instead of following a fixed action order", () => {
    const state = createAiActionGame();
    const player = state.players[0];
    player.defenderTokens = 9;
    player.resources = createResources(COSTS.fortress);

    expect(calculateScore(state, player.id).total).toBe(11);
    const command = chooseAiCommand(state);

    expect(command?.type).toBe("upgradeFortress");
    const next = applyCommand(state, command!);
    expect(next.winnerId).toBe(player.id);
  });

  it("uses a bank trade to complete a high-value fortress plan", () => {
    const state = createAiActionGame();
    state.players[0].resources = createResources({ food: 2, metal: 2, ammo: 4 });

    const command = chooseAiCommand(state);

    expect(command).toMatchObject({ type: "bankTrade", give: "ammo", receive: "metal" });
  });

  it("targets the leading opponent with the zombie horde", () => {
    const state = createAiActionGame();
    state.players[1].defenderTokens = 8;
    state.pending = { kind: "moveZombie", playerId: state.players[0].id, stealAfterMove: true };
    state.phase = "zombie";

    const command = chooseAiCommand(state);

    expect(command?.type).toBe("moveZombie");
    if (command?.type !== "moveZombie") return;
    expect(adjacentPlayersToTile(state.board, command.tileId)).toContain(state.players[1].id);
  });

  it("plays requisition for the resource opponents hold most", () => {
    const state = createAiActionGame();
    state.players[0].resources = createResources();
    state.players[0].devCards.push({ id: "requisition", type: "requisition", purchasedTurn: 0 });
    state.players[1].resources = createResources({ ammo: 5, food: 1 });
    state.players[2].resources = createResources({ ammo: 4, metal: 1 });

    const command = chooseAiCommand(state);

    expect(command).toMatchObject({
      type: "playDevelopmentCard",
      cardId: "requisition",
      payload: { resource: "ammo" }
    });
  });

  it("keeps a productive strategy across the next turn instead of forgetting it", () => {
    let state = refreshActiveAiStrategy(createAiActionGame());
    const firstPlan = state.players[0].aiStrategy;
    expect(firstPlan).toBeTruthy();

    state.turn += state.players.length;
    state.players[0].aiStrategy = { ...firstPlan!, reviewedTurn: state.turn - 1 };
    state = refreshActiveAiStrategy(state);

    expect(state.players[0].aiStrategy?.kind).toBe(firstPlan?.kind);
    expect(state.players[0].aiStrategy?.chosenTurn).toBe(firstPlan?.chosenTurn);
    expect(state.players[0].aiStrategy?.reviewedTurn).toBe(state.turn);
  });

  it("changes strategy when the committed plan becomes impossible", () => {
    let state = createAiActionGame();
    state.players[0].pieces.camps = 0;
    state.players[0].aiStrategy = {
      kind: "expansion",
      chosenTurn: state.turn - 1,
      reviewedTurn: state.turn - 1,
      commitmentUntilTurn: state.turn + 20,
      progress: 0,
      lastProgressTurn: state.turn - 1
    };

    state = refreshActiveAiStrategy(state);

    expect(state.players[0].aiStrategy?.kind).not.toBe("expansion");
    expect(state.players[0].aiStrategy?.chosenTurn).toBe(state.turn);
  });
});
