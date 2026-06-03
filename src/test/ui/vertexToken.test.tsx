import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Militia, PlayerState, VertexState } from "../../domain/types";
import { createResources } from "../../domain/constants";
import { boardMarkerAssets } from "../../ui/art/assetManifest";
import { VertexToken } from "../../ui/Board/VertexToken";

const player: PlayerState = {
  id: "p1",
  name: "A",
  color: "#d84f3f",
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

const vertex: VertexState = {
  id: "v1",
  x: 50,
  y: 50,
  tileIds: [],
  edgeIds: [],
  building: { ownerId: "p1", type: "camp" }
};

function militia(status: Militia["status"]): Militia {
  return {
    id: `m-${status}`,
    ownerId: "p1",
    vertexId: "v1",
    status
  };
}

function renderVertex(militiaAtVertex: Militia[], legal = false) {
  return render(
    <svg>
      <VertexToken
        vertex={vertex}
        legal={legal}
        buildingOwner={player}
        militia={militiaAtVertex}
        players={[player]}
        onClick={() => undefined}
      />
    </svg>
  );
}

describe("VertexToken militia lightning", () => {
  it("does not render lightning for an empty building", () => {
    const { container } = renderVertex([]);

    expect(container.querySelector(".militia-lightning-token")).toBeNull();
  });

  it("renders yellow lightning for unactivated militia", () => {
    const { container } = renderVertex([militia("inactive")]);

    expect(container.querySelector(".militia-lightning-token")).toHaveAttribute(
      "href",
      boardMarkerAssets.militiaLightning.inactive
    );
  });

  it.each<Militia["status"]>(["readying", "active"])(
    "renders green lightning for %s militia",
    (status) => {
      const { container } = renderVertex([militia(status)]);

      expect(container.querySelector(".militia-lightning-token")).toHaveAttribute(
        "href",
        boardMarkerAssets.militiaLightning.active
      );
    }
  );

  it("renders one lightning token per stationed militia", () => {
    const { container } = renderVertex([militia("inactive"), militia("active")]);

    const tokens = [...container.querySelectorAll(".militia-lightning-token")];
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toHaveAttribute("href", boardMarkerAssets.militiaLightning.inactive);
    expect(tokens[1]).toHaveAttribute("href", boardMarkerAssets.militiaLightning.active);
  });

  it("marks legal building targets on the piece instead of the hit area", () => {
    const { container } = renderVertex([], true);

    expect(container.querySelector(".building-piece")).toHaveClass("legal-building-target");
    expect(container.querySelector(".building-piece-legal-outline")).toBeInTheDocument();
    expect(container.querySelector(".vertex-legal-target-ring")).not.toBeInTheDocument();
    expect(container.querySelector(".vertex-hit-area")).toHaveAttribute("r", "18");
  });

  it("keeps coarse pointer vertex hit areas compact", () => {
    const { container } = render(
      <svg>
        <VertexToken
          vertex={{ ...vertex, building: undefined }}
          legal={false}
          expandedHitArea
          coarsePointer
          militia={[]}
          players={[player]}
          onClick={() => undefined}
        />
      </svg>
    );

    expect(container.querySelector(".vertex-hit-area")).toHaveAttribute("r", "20");
    expect(container.querySelector(".vertex-touch-cue")).toHaveAttribute("r", "13");
  });

  it("shows the white dashed placement cue for desktop expanded hit areas", () => {
    const { container } = render(
      <svg>
        <VertexToken
          vertex={{ ...vertex, building: undefined }}
          legal={false}
          expandedHitArea
          militia={[]}
          players={[player]}
          onClick={() => undefined}
        />
      </svg>
    );

    expect(container.querySelector(".vertex-hit-area")).toHaveAttribute("r", "18");
    expect(container.querySelector(".vertex-touch-cue")).toHaveAttribute("r", "13");
  });

  it("uses faction-colored building pieces instead of seat-colored pieces", () => {
    const whiteTowerPlayer: PlayerState = {
      ...player,
      id: "p1",
      factionId: "white-tower",
      color: "#8e5bb7"
    };
    const { container } = render(
      <svg>
        <VertexToken
          vertex={vertex}
          legal={false}
          buildingOwner={whiteTowerPlayer}
          militia={[]}
          players={[whiteTowerPlayer]}
          onClick={() => undefined}
        />
      </svg>
    );

    expect(container.querySelector(".building-piece")).toHaveAttribute(
      "href",
      "/assets/board/buildings/purple/camp.v1.webp"
    );
  });
});
