import { describe, expect, it } from "vitest";
import { createResources } from "../../domain/constants";
import { applyCommand } from "../../domain/rules";
import type { Command, GameState } from "../../domain/types";
import { OnlineAuthorizationError, authorizeCommandForPlayer } from "../../online/authorization";

function players(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Player ${index + 1}`,
    color: `#${(index + 2).toString().repeat(6).slice(0, 6)}`,
    factionId: ["red-rust", "blue-steel", "green-oasis", "gold-sand", "white-tower", "ash-merchant"][index]
  }));
}

function createActionState(): GameState {
  let state = applyCommand(undefined, {
    type: "createGame",
    players: players(),
    seed: "online-auth"
  });
  state = applyCommand(state, { type: "debugJumpPhase", phase: "action" });
  state = applyCommand(state, {
    type: "debugSetResources",
    playerId: "p1",
    resources: createResources({ food: 3, wood: 2, metal: 1 })
  });
  state = applyCommand(state, {
    type: "debugSetResources",
    playerId: "p2",
    resources: createResources({ wood: 3, ammo: 1 })
  });
  return state;
}

function expectAuthorized(state: GameState, viewerPlayerId: string, command: Command) {
  expect(() => authorizeCommandForPlayer(state, viewerPlayerId, command)).not.toThrow();
}

function expectRejected(state: GameState, viewerPlayerId: string, command: Command) {
  expect(() => authorizeCommandForPlayer(state, viewerPlayerId, command)).toThrow(OnlineAuthorizationError);
}

describe("authorizeCommandForPlayer", () => {
  it("allows the current player to issue regular turn commands", () => {
    const state = createActionState();

    expectAuthorized(state, "p1", {
      type: "playerTrade",
      targetPlayerId: "p2",
      offer: { food: 1 },
      request: { wood: 1 }
    });
  });

  it("allows only the pending player to resolve a pending action", () => {
    const base = createActionState();
    const pendingState = applyCommand(base, {
      type: "playerTrade",
      targetPlayerId: "p2",
      offer: { food: 1 },
      request: { wood: 1 }
    });

    expectAuthorized(pendingState, "p2", { type: "confirmPlayerTrade", accept: true });
    expectRejected(pendingState, "p1", { type: "confirmPlayerTrade", accept: true });
  });

  it("rejects commands from uninvolved spectators", () => {
    const base = createActionState();
    const pendingState = applyCommand(base, {
      type: "playerTrade",
      targetPlayerId: "p2",
      offer: { food: 1 },
      request: { wood: 1 }
    });

    expectRejected(pendingState, "p3", { type: "confirmPlayerTrade", accept: false });
    expectRejected(base, "p3", { type: "rollDice" });
  });

  it("rejects debug and import-adjacent commands for online play", () => {
    const state = createActionState();

    expectRejected(state, "p1", {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 99 })
    });
    expectRejected(state, "p1", { type: "debugJumpPhase", phase: "victory" });
  });
});
