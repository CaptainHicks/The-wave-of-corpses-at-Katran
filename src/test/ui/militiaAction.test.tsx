import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COSTS, RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import type { GameState, Resources } from "../../domain/types";
import { MilitiaAction } from "../../ui/Actions/MilitiaAction";

function formatCost(cost: Partial<Resources>): string {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_LABELS[resource]}×${cost[resource]}`)
    .join(" ");
}

function stateWithInactiveMilitia(): GameState {
  return {
    currentPlayerId: "p1",
    players: [
      {
        id: "p1",
        name: "A",
        color: "#d84f3f",
        militia: [{ id: "m1", ownerId: "p1", vertexId: "v1", status: "inactive" }]
      }
    ]
  } as GameState;
}

describe("MilitiaAction", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders activate militia as a full-width cost card like recruit militia", () => {
    const { container } = render(
      <MilitiaAction state={stateWithInactiveMilitia()} submit={vi.fn()} setTool={vi.fn()} setSelection={vi.fn()} />
    );

    const recruitCard = container.querySelector<HTMLButtonElement>(".action-subsection:first-child .tool-card");
    const activateCard = container.querySelector<HTMLButtonElement>(".militia-activate-card");

    expect(recruitCard).toBeInTheDocument();
    expect(activateCard).toBeInTheDocument();
    expect(activateCard).toHaveClass("tool-card");
    expect(activateCard).not.toBeDisabled();
    expect(activateCard?.querySelector("small")).toHaveTextContent(formatCost(COSTS.activateMilitia));
    expect(activateCard?.querySelector("small")).not.toHaveTextContent(/^1$/);
  });
});
