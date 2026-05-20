import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  legalInitialCampVertices,
  legalInitialRouteEdges
} from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { PendingPanel } from "../../ui/Panels/PendingPanel";

function setupGame(): GameState {
  let state = applyCommand(undefined, {
    type: "createGame",
    players: [
      { name: "A", color: "#d84f3f" },
      { name: "B", color: "#2b78d4" },
      { name: "C", color: "#209468" }
    ],
    seed: "pending-panel"
  });
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  return state;
}

describe("PendingPanel", () => {
  it("does not render raw vertex id buttons for fortress downgrades", () => {
    const state = setupGame();
    const fortress = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p1")!;
    fortress.building!.type = "fortress";
    state.pending = {
      kind: "downgradeFortress",
      playerId: "p1",
      vertexIds: [fortress.id]
    };

    const { container, queryByText } = render(
      <PendingPanel state={state} submit={vi.fn()} setTool={vi.fn()} />
    );

    expect(queryByText(fortress.id)).toBeNull();
    expect(container.querySelector(".button-grid")).toBeNull();
  });
});
