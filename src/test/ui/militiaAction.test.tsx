import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    phase: "action",
    turn: 2,
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

function stateWithActiveMilitia(): GameState {
  return {
    currentPlayerId: "p1",
    phase: "action",
    turn: 2,
    players: [
      {
        id: "p1",
        name: "A",
        color: "#d84f3f",
        militia: [
          { id: "m1", ownerId: "p1", vertexId: "v1", status: "active" },
          { id: "m2", ownerId: "p1", vertexId: "v2", status: "active" }
        ]
      }
    ],
    board: {
      vertices: {
        v1: { id: "v1", x: 0, y: 0, tileIds: [], edgeIds: ["e1"], building: { ownerId: "p1", type: "camp" } },
        v2: { id: "v2", x: 0, y: 0, tileIds: [], edgeIds: [], building: { ownerId: "p1", type: "camp" } },
        v3: { id: "v3", x: 0, y: 0, tileIds: [], edgeIds: ["e1"], building: { ownerId: "p1", type: "camp" } }
      },
      edges: {
        e1: { id: "e1", vertexIds: ["v1", "v3"], tileIds: [], route: { ownerId: "p1", type: "transport" } }
      },
      tiles: {}
    }
  } as unknown as GameState;
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

  it("keeps the militia command row visible without exposing internal ids", () => {
    render(
      <MilitiaAction state={stateWithInactiveMilitia()} submit={vi.fn()} setTool={vi.fn()} setSelection={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "移动民兵" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "驱逐尸潮" })).toBeDisabled();
    expect(screen.getByText("点击通过运输线或装甲车队相连的营地/堡垒，移动已激活民兵。")).toBeInTheDocument();
    expect(screen.queryByText(/p\d+-militia|m1/)).not.toBeInTheDocument();
  });

  it("uses one move militia entry that starts board-side militia selection", () => {
    const setTool = vi.fn();
    const setSelection = vi.fn();
    render(<MilitiaAction state={stateWithActiveMilitia()} submit={vi.fn()} setTool={setTool} setSelection={setSelection} />);

    const moveButtons = screen.getAllByRole("button", { name: "移动民兵" });

    expect(moveButtons).toHaveLength(1);
    expect(moveButtons[0]).not.toBeDisabled();

    fireEvent.click(moveButtons[0]);

    expect(setTool).toHaveBeenCalledWith("none");
    expect(setSelection).toHaveBeenCalledWith({ kind: "moveMilitia" });
  });
});
