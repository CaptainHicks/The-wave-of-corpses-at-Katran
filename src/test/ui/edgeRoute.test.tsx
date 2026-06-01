import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createResources } from "../../domain/constants";
import type { EdgeState, PlayerState, VertexState } from "../../domain/types";
import { EdgeRoute } from "../../ui/Board/EdgeRoute";

const whiteTowerPlayer: PlayerState = {
  id: "p1",
  name: "白塔公社",
  color: "#8e5bb7",
  factionId: "white-tower",
  resources: createResources(),
  devCards: [],
  militia: [],
  defenderTokens: 0,
  movedConvoyThisTurn: false,
  pieces: {
    camps: 0,
    fortresses: 0,
    transports: 0,
    convoys: 0,
    militia: 0,
    watchtowers: 0
  },
  usedDevCardThisTurn: false
};

const edge: EdgeState = {
  id: "e1",
  vertexIds: ["v1", "v2"],
  tileIds: [],
  route: { ownerId: "p1", type: "transport" }
};

const a: VertexState = { id: "v1", x: 0, y: 0, tileIds: [], edgeIds: ["e1"] };
const b: VertexState = { id: "v2", x: 100, y: 0, tileIds: [], edgeIds: ["e1"] };

describe("EdgeRoute piece assets", () => {
  it("uses faction-colored route pieces instead of seat-colored pieces", () => {
    const { container } = render(
      <svg>
        <EdgeRoute
          edge={edge}
          a={a}
          b={b}
          owner={whiteTowerPlayer}
          legal={false}
          selected={false}
          queued={false}
          onClick={() => undefined}
        />
      </svg>
    );

    expect(container.querySelector(".route-piece")).toHaveAttribute(
      "href",
      "/assets/board/routes/purple/transport.v1.webp"
    );
  });
});
