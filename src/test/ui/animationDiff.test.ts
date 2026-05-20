import { describe, expect, it } from "vitest";
import { createResources } from "../../domain/constants";
import { applyCommand, legalBuildEdges, legalInitialCampVertices, legalInitialRouteEdges } from "../../domain/rules";
import type { Command, GameState, Resources } from "../../domain/types";
import { diffGameStates } from "../../ui/animation/diffGameStates";

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function setupGame(): GameState {
  let state = applyCommand(undefined, { type: "createGame", players: players(), seed: "animation-diff" });
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  return state;
}

describe("diffGameStates", () => {
  it("emits dice roll events without writing animation state into GameState", () => {
    const previous = setupGame();
    const command: Command = { type: "rollDice", forced: [1, 1] };
    const next = applyCommand(previous, command);

    const events = diffGameStates(previous, next, command, next.currentPlayerId);

    expect(events.some((event) => event.kind === "diceRoll" && event.amount === 2)).toBe(true);
    expect(JSON.stringify(next)).not.toContain("diceRoll");
  });

  it("hides non-seat resource details while keeping own hand feedback specific", () => {
    const previous = setupGame();
    const targetResources = previous.players[1].resources;
    const command: Command = {
      type: "debugSetResources",
      playerId: "p2",
      resources: createResources({ ...targetResources, food: targetResources.food + 2, ammo: targetResources.ammo + 1 })
    };
    const next = applyCommand(previous, command);

    const hidden = diffGameStates(previous, next, command, "p1").filter((event) => event.kind === "resourceGain");
    expect(hidden).toHaveLength(1);
    expect(hidden[0].playerId).toBe("p2");
    expect(hidden[0].privateResource).toBe(true);
    expect(hidden[0].resource).toBeUndefined();

    const visible = diffGameStates(previous, next, command, "p2").filter((event) => event.kind === "resourceGain");
    expect(visible.map((event) => event.resource).sort()).toEqual(["ammo", "food"]);
  });

  it("does not emit construction success animations", () => {
    const previous = enterActionWithResources(setupGame());
    const vertex = Object.values(previous.board.vertices).find(
      (item) => item.building?.ownerId === previous.currentPlayerId && item.building.type === "camp"
    )!;
    const command: Command = { type: "upgradeFortress", vertexId: vertex.id, free: true };
    const next = applyCommand(previous, command);

    const events = diffGameStates(previous, next, command, next.currentPlayerId);

    expect(events.map((event) => event.kind as string)).not.toContain("buildPiece");
  });

  it("does not emit route build or fog reveal animations when a route reveals tiles", () => {
    const previous = enterActionWithResources(setupGame());
    const edgeId = legalBuildEdges(previous, "transport")[0];
    const command: Command = { type: "buildRoute", edgeId, routeType: "transport", free: true };
    const next = applyCommand(previous, command);

    const events = diffGameStates(previous, next, command, next.currentPlayerId);

    expect(events.map((event) => event.kind as string)).not.toContain("routeBuild");
    expect(events.map((event) => event.kind as string)).not.toContain("fogReveal");
  });

  it("emits a siege alert event when the zombie track erupts and resets", () => {
    const previous = enterActionWithResources(setupGame());
    const fortress = Object.values(previous.board.vertices).find(
      (item) => item.building?.ownerId === previous.currentPlayerId
    )!;
    fortress.building!.type = "fortress";
    previous.zombieTrack = 5;
    previous.players[0].devCards.push({ id: "zombie-card", type: "zombieApproaches", purchasedTurn: 0 });
    const command: Command = { type: "playDevelopmentCard", cardId: "zombie-card" };
    const next = applyCommand(previous, command);

    const events = diffGameStates(previous, next, command, next.currentPlayerId);

    const siegeEvent = events.find((event) => event.kind === "zombieSiege");
    expect(siegeEvent?.durationMs).toBeGreaterThanOrEqual(2400);
  });
});

function enterActionWithResources(state: GameState): GameState {
  const withDice = state.phase === "action" ? state : applyCommand(state, { type: "rollDice", forced: [1, 1] });
  return applyCommand(withDice, {
    type: "debugSetResources",
    playerId: withDice.currentPlayerId,
    resources: createResources({ food: 10, wood: 10, metal: 10, fuel: 10, ammo: 10 }) as Resources
  });
}
