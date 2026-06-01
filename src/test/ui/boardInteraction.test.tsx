import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createResources } from "../../domain/constants";
import {
  vertexHasAdjacentBuilding,
  vertexTouchesInitialResourceZone,
  vertexTouchesOnlyRevealed,
  vertexTouchesResource,
  vertexTouchesWarehouse
} from "../../domain/board";
import {
  applyCommand,
  legalBuildEdges,
  legalBuildVertices,
  legalInitialCampVertices,
  legalInitialRouteEdges,
  legalMerchantTiles,
  legalRecruitVertices
} from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { getBuildingPieceAsset, routePieceAssets } from "../../ui/art/assetManifest";
import { BoardView, describeInitialCampResourceZone } from "../../ui/Board/BoardView";
import type { UiSelection, UiTool } from "../../ui/gameUiTypes";

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function setupActionState(seed: string): GameState {
  let state = applyCommand(undefined, { type: "createGame", players: players(), seed });
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  state = applyCommand(state, { type: "rollDice", forced: [1, 1] });
  return applyCommand(state, {
    type: "debugSetResources",
    playerId: state.currentPlayerId,
    resources: createResources({ food: 10, wood: 10, metal: 10, fuel: 10, ammo: 10 })
  });
}

function renderBoard(
  state: GameState,
  tool: UiTool,
  submit = vi.fn(),
  selection?: UiSelection,
  reportError = vi.fn()
) {
  const setSelection = vi.fn();
  const view = render(
    <BoardView
      state={state}
      tool={tool}
      selection={selection}
      animationEvents={[]}
      setSelection={setSelection}
      reportError={reportError}
      submit={submit}
    />
  );
  return { ...view, submit, setSelection, reportError };
}

function findLargeZoneBlockedInitialVertex(state: GameState) {
  return Object.values(state.board.vertices).find(
    (vertex) =>
      !legalInitialCampVertices(state).includes(vertex.id) &&
      !vertex.building &&
      !vertexHasAdjacentBuilding(state.board, vertex.id) &&
      vertexTouchesOnlyRevealed(state.board, vertex.id) &&
      vertexTouchesResource(state.board, vertex.id, true) &&
      !vertexTouchesWarehouse(state.board, vertex.id) &&
      !vertexTouchesInitialResourceZone(state.board, vertex.id)
  );
}

describe("BoardView interaction targets", () => {
  it("removes visible camp previews during initial setup while keeping a larger hit area", () => {
    const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "initial-camp-markers" });
    const legalVertices = legalInitialCampVertices(state);
    const { container } = renderBoard(state, "none");

    expect(legalVertices.length).toBeGreaterThan(0);
    expect(container.querySelector(".building-piece-preview")).toBeNull();
    expect(container.querySelector(".initial-camp-preview")).toBeNull();

    const previewVertex = container.querySelector(`[data-vertex-id="${legalVertices[0]}"]`);
    expect(previewVertex).toHaveClass("has-expanded-hit-area");
    expect(previewVertex).not.toHaveClass("legal");
    expect(previewVertex?.querySelector(".vertex-hit-area")).toHaveClass("preview-hit-area");
    expect(previewVertex?.querySelector(".vertex-touch-cue")).toHaveAttribute("r", "13");
  });

  it("explains why an illegal initial camp vertex cannot be used", () => {
    const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "illegal-initial-camp" });
    const illegalVertex = Object.values(state.board.vertices).find((vertex) => !legalInitialCampVertices(state).includes(vertex.id));
    expect(illegalVertex).toBeTruthy();

    const { container, submit, reportError } = renderBoard(state, "none");
    fireEvent.click(container.querySelector(`[data-vertex-id="${illegalVertex!.id}"]`)!);

    expect(submit).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0]?.[0]).toMatch(/初始营地|迷雾|资源|仓库|建筑|交叉点/);
  });

  it("classifies large resource zones by map side and uses that label in the setup hint", () => {
    const expectedLabels = new Set(["左侧大资源区", "右侧大资源区", "左右两侧的大资源区", "中部大资源区"]);
    const foundLabels = new Set<string>();
    let blockedCase: { state: GameState; vertexId: string; label: string } | undefined;

    for (let index = 0; index < 260; index += 1) {
      const state = applyCommand(undefined, {
        type: "createGame",
        players: players(),
        seed: `setup-zone-hint-${index}`
      });
      const label = describeInitialCampResourceZone(state.board);
      if (expectedLabels.has(label)) {
        foundLabels.add(label);
      }
      if (!blockedCase) {
        const blockedVertex = findLargeZoneBlockedInitialVertex(state);
        if (blockedVertex) {
          blockedCase = { state, vertexId: blockedVertex.id, label };
        }
      }
    }

    expect(foundLabels).toEqual(expectedLabels);
    expect(blockedCase).toBeTruthy();

    const { container, submit, reportError } = renderBoard(blockedCase!.state, "none");
    fireEvent.click(container.querySelector(`[data-vertex-id="${blockedCase!.vertexId}"]`)!);

    expect(submit).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(`初始营地只能放在${blockedCase!.label}。`);
  });

  it("uses the camp piece asset as the legal camp target preview", () => {
    let state = setupActionState("camp-preview");
    while (legalBuildVertices(state).length === 0) {
      const edgeId = legalBuildEdges(state, "transport")[0];
      expect(edgeId).toBeTruthy();
      state = applyCommand(state, { type: "buildRoute", edgeId, routeType: "transport", free: true });
    }
    const { container } = renderBoard(state, "camp");

    expect(legalBuildVertices(state).length).toBeGreaterThan(0);
    const preview = container.querySelector(".building-piece-preview");

    expect(preview).toHaveAttribute(
      "href",
      getBuildingPieceAsset({
        playerId: state.currentPlayerId,
        buildingType: "camp",
        hasWatchtower: false,
        militiaCount: 0
      })
    );
    expect(preview?.closest(".vertex")).toHaveClass("has-building-preview");
    expect(preview?.closest(".vertex")?.querySelector(".vertex-hit-area")).toHaveClass("preview-hit-area");
  });

  it("explains why an illegal camp construction target cannot be used", () => {
    let state = setupActionState("illegal-camp-target");
    while (legalBuildVertices(state).length === 0) {
      const edgeId = legalBuildEdges(state, "transport")[0];
      expect(edgeId).toBeTruthy();
      state = applyCommand(state, { type: "buildRoute", edgeId, routeType: "transport", free: true });
    }
    const legalVertices = new Set(legalBuildVertices(state));
    const illegalVertex = Object.values(state.board.vertices).find((vertex) => !legalVertices.has(vertex.id));
    expect(illegalVertex).toBeTruthy();

    const { container, submit, reportError } = renderBoard(state, "camp");
    fireEvent.click(container.querySelector(`[data-vertex-id="${illegalVertex!.id}"]`)!);

    expect(submit).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0]?.[0]).toMatch(/营地|路线|资源|建筑|隔 1 个空交叉点/);
  });

  it("uses the route piece asset as the legal transport target preview", () => {
    const state = setupActionState("route-preview");
    const edgeId = legalBuildEdges(state, "transport")[0];
    const { container } = renderBoard(state, "transport");

    const edge = container.querySelector(`[data-edge-id="${edgeId}"]`);
    const preview = edge?.querySelector(".route-piece-preview");

    expect(preview).toHaveAttribute("href", routePieceAssets[state.currentPlayerId].transport);
  });

  it("explains why an illegal transport route target cannot be used", () => {
    const state = setupActionState("illegal-route-target");
    const legalEdges = new Set(legalBuildEdges(state, "transport"));
    const illegalEdge = Object.values(state.board.edges).find((edge) => !legalEdges.has(edge.id));
    expect(illegalEdge).toBeTruthy();

    const { container, submit, reportError } = renderBoard(state, "transport");
    fireEvent.click(container.querySelector(`[data-edge-id="${illegalEdge!.id}"]`)!);

    expect(submit).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0]?.[0]).toMatch(/运输线|边缘|资源|棋子|路线/);
  });

  it("passes owner color to route piece filters without drawing exposed glow caps", () => {
    let state = setupActionState("route-glow");
    const player = state.players.find((item) => item.id === state.currentPlayerId)!;
    const edgeId = legalBuildEdges(state, "transport")[0];
    state = applyCommand(state, { type: "buildRoute", edgeId, routeType: "transport", free: true });

    const { container } = renderBoard(state, "none");
    const edge = container.querySelector(`[data-edge-id="${edgeId}"]`);

    expect(edge?.getAttribute("style")).toContain(`--route-color: ${player.color}`);
    expect(edge?.querySelector(".route-piece-glow")).toBeNull();
    expect(edge?.querySelector(".route-piece")).toHaveClass("route-piece-transport");
  });

  it("draws merchant target tile art with a consistent white outline overlay", () => {
    const state = setupActionState("merchant-tile-outline");
    const tileId = legalMerchantTiles(state)[0];
    expect(tileId).toBeTruthy();

    const { container } = renderBoard(state, "none", vi.fn(), { kind: "devMerchant", cardId: "merchant-1" });
    const svg = container.querySelector(".board-svg")!;
    const tile = container.querySelector(`[data-tile-id="${tileId}"]`)!;
    const tileGroups = [...container.querySelectorAll(".tile-group")];
    const highlightLayer = container.querySelector(".tile-selection-outline-layer");
    expect(highlightLayer).toBeTruthy();
    const outlineLayer = highlightLayer!;
    const artOutline = outlineLayer.querySelector(`[data-tile-outline-id="${tileId}"]`);
    const tileArt = tile.querySelector(".tile-art");
    const svgChildren = [...svg.children];

    expect(tileArt).toHaveAttribute("preserveAspectRatio", "none");
    expect(artOutline).toBeTruthy();
    expect(tile.querySelector(".tile-art-selection-outline")).toBeNull();
    expect(svgChildren.indexOf(outlineLayer)).toBeGreaterThan(
      Math.max(...tileGroups.map((group) => svgChildren.indexOf(group)))
    );
    expect(tile.querySelector(".tile-outline")).not.toHaveClass("legal-tile-target");
    expect(tileArt).not.toHaveClass("legal-tile-art-target");
  });

  it("activates a militia by clicking its building on the map", () => {
    let state = setupActionState("activate-on-map");
    const vertexId = legalRecruitVertices(state)[0];
    state = applyCommand(state, { type: "recruitMilitia", vertexId, free: true });
    const militiaId = state.players.find((player) => player.id === state.currentPlayerId)!.militia[0].id;
    const { container, submit } = renderBoard(state, "activateMilitia");

    fireEvent.click(container.querySelector(`[data-vertex-id="${vertexId}"]`)!);

    expect(submit).toHaveBeenCalledWith({ type: "activateMilitia", militiaId });
  });

  it("only treats queued fortress downgrade vertices as legal map targets", () => {
    const state = setupActionState("downgrade-targets");
    const p1Buildings = Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === "p1");
    const fortress = p1Buildings[0];
    const camp = p1Buildings[1];
    const otherPlayerCamp = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p2")!;
    fortress.building!.type = "fortress";
    state.pending = {
      kind: "downgradeFortress",
      playerId: "p1",
      vertexIds: [fortress.id]
    };
    const { container, submit } = renderBoard(state, "none");

    expect(container.querySelector(`[data-vertex-id="${fortress.id}"]`)).toHaveClass("legal");
    expect(container.querySelector(`[data-vertex-id="${camp.id}"]`)).not.toHaveClass("legal");
    expect(container.querySelector(`[data-vertex-id="${otherPlayerCamp.id}"]`)).not.toHaveClass("legal");

    fireEvent.click(container.querySelector(`[data-vertex-id="${camp.id}"]`)!);
    fireEvent.click(container.querySelector(`[data-vertex-id="${otherPlayerCamp.id}"]`)!);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector(`[data-vertex-id="${fortress.id}"]`)!);
    expect(submit).toHaveBeenCalledWith({ type: "downgradeFortress", vertexId: fortress.id });
  });
});
