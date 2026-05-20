import { describe, expect, it } from "vitest";
import { createResources } from "../../domain/constants";
import { applyCommand, legalInitialCampVertices, legalInitialRouteEdges } from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { getTurnUiMode } from "../../ui/selectors/turnUiMode";

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function setupGame(): GameState {
  let state = applyCommand(undefined, { type: "createGame", players: players(), seed: "ui-mode" });
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  return state;
}

describe("getTurnUiMode", () => {
  it("returns mustRoll for the first player after setup", () => {
    const state = setupGame();

    expect(state.phase).toBe("prepare");
    expect(getTurnUiMode(state)).toBe("mustRoll");
  });

  it("returns freeAction after rolling dice", () => {
    const state = applyCommand(setupGame(), { type: "rollDice", forced: [1, 1] });

    expect(state.phase).toBe("action");
    expect(getTurnUiMode(state)).toBe("freeAction");
  });

  it("returns pending for discard choices", () => {
    let state = setupGame();
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 9 })
    });
    state = applyCommand(state, { type: "rollDice", forced: [3, 4] });

    expect(state.pending?.kind).toBe("discard");
    expect(getTurnUiMode(state)).toBe("pending");
  });

  it("returns victory when the game is over", () => {
    const state = setupGame();
    state.phase = "victory";
    state.winnerId = "p1";

    expect(getTurnUiMode(state)).toBe("victory");
  });
});
