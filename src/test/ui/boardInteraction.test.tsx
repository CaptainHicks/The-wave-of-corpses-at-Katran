import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createResources } from "../../domain/constants";
import {
  isResourceTile,
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
  legalConvoyMoveFromEdges,
  legalConvoyMoveToEdges,
  legalDevelopmentRouteEdges,
  legalExpelZombieTiles,
  legalInitialCampVertices,
  legalInitialRouteEdges,
  legalMerchantTiles,
  legalRecruitVertices
} from "../../domain/rules";
import type { BoardState, GameState, TileState } from "../../domain/types";
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

function resourceTile(id: string, q: number, r: number, x: number, cluster: TileState["cluster"]): TileState {
  return {
    id,
    row: r,
    col: q,
    q,
    r,
    x,
    y: 0,
    type: "farm",
    hiddenType: "farm",
    number: 6,
    revealed: true,
    cluster
  };
}

function boardWithTiles(tiles: TileState[]): BoardState {
  return {
    tiles: Object.fromEntries(tiles.map((tile) => [tile.id, tile])),
    edges: {},
    vertices: {},
    rows: []
  };
}

function createInitialZoneBlockedCase() {
  const state = applyCommand(undefined, {
    type: "createGame",
    players: players(),
    seed: "initial-zone-blocked-hint"
  });
  const smallResourceTile = Object.values(state.board.tiles).find(
    (tile) => tile.cluster === "small" && isResourceTile(tile) && tile.hiddenType !== "warehouse"
  );
  expect(smallResourceTile).toBeTruthy();

  const blockedVertex = {
    id: "test-blocked-small-zone-vertex",
    x: smallResourceTile!.x,
    y: smallResourceTile!.y,
    tileIds: [smallResourceTile!.id],
    edgeIds: []
  };

  const nextState: GameState = {
    ...state,
    board: {
      ...state.board,
      tiles: {
        ...state.board.tiles,
        [smallResourceTile!.id]: {
          ...smallResourceTile!,
          revealed: true
        }
      },
      vertices: {
        ...state.board.vertices,
        [blockedVertex.id]: blockedVertex
      }
    }
  };

  return {
    state: nextState,
    vertexId: blockedVertex.id,
    label: describeInitialCampResourceZone(nextState.board)
  };
}

describe("BoardView interaction targets", () => {
  it("does not expose native SVG title tooltips on tile art", () => {
    const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "tile-title-tooltip" });
    const { container } = renderBoard(state, "none");
    const tile = container.querySelector(".tile-group");

    expect(tile).toBeTruthy();
    expect(tile).toHaveAttribute("aria-label");
    expect(tile?.querySelector("title")).toBeNull();
  });

  it("activates a board target on touch pointer release without repeating the synthesized click", () => {
    const state = applyCommand(undefined, { type: "createGame", players: players(), seed: "touch-pointer-activation" });
    const vertexId = legalInitialCampVertices(state)[0];
    const { container, submit } = renderBoard(state, "none");
    const vertex = container.querySelector(`[data-vertex-id="${vertexId}"]`)!;

    fireEvent.pointerUp(vertex, { pointerId: 1, pointerType: "touch" });
    fireEvent.click(vertex);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ type: "placeInitialCamp", vertexId });
  });

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
    expect(describeInitialCampResourceZone(boardWithTiles([
      resourceTile("large-left", 0, 0, 0, "large"),
      resourceTile("small-right", 4, 0, 100, "small")
    ]))).toBe("左侧大资源区");
    expect(describeInitialCampResourceZone(boardWithTiles([
      resourceTile("small-left", 0, 0, 0, "small"),
      resourceTile("large-right", 4, 0, 100, "large")
    ]))).toBe("右侧大资源区");
    expect(describeInitialCampResourceZone(boardWithTiles([
      resourceTile("large-left", 0, 0, 0, "large"),
      resourceTile("large-right", 4, 0, 100, "large")
    ]))).toBe("左右两侧的大资源区");
    expect(describeInitialCampResourceZone(boardWithTiles([
      resourceTile("small-left", 0, 0, 0, "small"),
      resourceTile("large-center", 2, 0, 50, "large"),
      resourceTile("small-right", 4, 0, 100, "small")
    ]))).toBe("中部大资源区");

    const blockedCase = createInitialZoneBlockedCase();
    expect(legalInitialCampVertices(blockedCase.state)).not.toContain(blockedCase.vertexId);
    expect(vertexTouchesResource(blockedCase.state.board, blockedCase.vertexId, true)).toBe(true);
    expect(vertexTouchesInitialResourceZone(blockedCase.state.board, blockedCase.vertexId)).toBe(false);

    const { container, submit, reportError } = renderBoard(blockedCase.state, "none");
    fireEvent.click(container.querySelector(`[data-vertex-id="${blockedCase.vertexId}"]`)!);

    expect(submit).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(`初始营地只能放在${blockedCase.label}。`);
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

    expect(preview).toHaveAttribute("filter", "url(#selection-white-preview)");
    expect(container.querySelector("#selection-white-outline")).toBeInTheDocument();
    expect(container.querySelector("#selection-white-preview")).toBeInTheDocument();
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

  it("shows the latest white-edge animation when selecting a convoy to move", () => {
    let state = setupActionState("move-convoy-source-preview");
    const sourceEdgeId = legalBuildEdges(state, "convoy")[0];
    expect(sourceEdgeId).toBeTruthy();
    state = applyCommand(state, { type: "buildRoute", edgeId: sourceEdgeId, routeType: "convoy", free: true });
    state.turn += 1;
    expect(legalConvoyMoveFromEdges(state)).toContain(sourceEdgeId);

    const { container } = renderBoard(state, "none", vi.fn(), { kind: "moveConvoy" });
    const sourceEdge = container.querySelector(`[data-edge-id="${sourceEdgeId}"]`);

    expect(sourceEdge?.querySelector(".route-piece-legal-outline")).toBeInTheDocument();
    expect(sourceEdge?.querySelector(".route-piece-highlight")).not.toBeInTheDocument();
  });

  it("uses a convoy piece preview for legal move destinations", () => {
    let state = setupActionState("move-convoy-target-preview");
    const sourceEdgeId = legalBuildEdges(state, "convoy")[0];
    expect(sourceEdgeId).toBeTruthy();
    state = applyCommand(state, { type: "buildRoute", edgeId: sourceEdgeId, routeType: "convoy", free: true });
    state.turn += 1;
    const targetEdgeId = legalConvoyMoveToEdges(state, sourceEdgeId)[0];
    expect(targetEdgeId).toBeTruthy();

    const { container } = renderBoard(state, "none", vi.fn(), { kind: "moveConvoy", fromEdgeId: sourceEdgeId });
    const targetEdge = container.querySelector(`[data-edge-id="${targetEdgeId}"]`);
    const preview = targetEdge?.querySelector(".route-piece-preview");

    expect(preview).toHaveAttribute("href", routePieceAssets[state.currentPlayerId].convoy);
    expect(targetEdge).not.toHaveClass("edge");
  });

  it("cancels convoy move selection when clicking empty board space", () => {
    const state = setupActionState("cancel-move-convoy-on-empty-board");
    const setSelection = vi.fn();
    const { container } = render(
      <BoardView
        state={state}
        tool="none"
        selection={{ kind: "moveConvoy" }}
        animationEvents={[]}
        setSelection={setSelection}
        submit={vi.fn()}
      />
    );

    fireEvent.click(container.querySelector(".board-svg")!);

    expect(setSelection).toHaveBeenCalledWith(undefined);
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

  it("keeps expel zombie targets clickable without drawing selectable tile highlights", () => {
    const state = setupActionState("expel-zombie-without-tile-highlights");
    const player = state.players.find((item) => item.id === state.currentPlayerId)!;
    const militiaVertex = Object.values(state.board.vertices).find(
      (vertex) => vertex.building?.ownerId === player.id && vertex.tileIds.some((tileId) => state.board.tiles[tileId]?.revealed)
    );
    expect(militiaVertex).toBeTruthy();

    const zombieTileId = militiaVertex!.tileIds.find((tileId) => state.board.tiles[tileId]?.revealed);
    expect(zombieTileId).toBeTruthy();
    state.zombieTileId = zombieTileId!;
    player.militia.push({
      id: "expel-highlight-test-militia",
      ownerId: player.id,
      vertexId: militiaVertex!.id,
      status: "active",
      activatedTurn: state.turn - 1
    });

    const targetTileId = legalExpelZombieTiles(state, "expel-highlight-test-militia")[0];
    expect(targetTileId).toBeTruthy();
    const submit = vi.fn();
    const { container } = renderBoard(
      state,
      "none",
      submit,
      { kind: "expelZombie", militiaId: "expel-highlight-test-militia" }
    );

    expect(container.querySelector(".tile-selection-outline-layer")).toBeNull();
    expect(container.querySelector(`[data-tile-id="${targetTileId}"] .tile-outline`)).not.toHaveClass("legal");

    fireEvent.click(container.querySelector(`[data-tile-id="${targetTileId}"]`)!);

    expect(submit).toHaveBeenCalledWith({
      type: "expelZombie",
      militiaId: "expel-highlight-test-militia",
      toTileId: targetTileId
    });
  });

  it("queues two militia mobilization placements before playing the card", () => {
    const state = setupActionState("dev-militia-two-placements");
    const vertexId = legalRecruitVertices(state)[0];
    expect(vertexId).toBeTruthy();
    const selection: UiSelection = { kind: "devMilitia", cardId: "militia-card", vertexIds: [] };
    const { container, rerender, setSelection, submit, reportError } = renderBoard(state, "none", vi.fn(), selection);

    fireEvent.click(container.querySelector(`[data-vertex-id="${vertexId}"]`)!);

    expect(setSelection).toHaveBeenCalledWith({ ...selection, vertexIds: [vertexId] });

    rerender(
      <BoardView
        state={state}
        tool="none"
        selection={{ ...selection, vertexIds: [vertexId] }}
        animationEvents={[]}
        setSelection={setSelection}
        reportError={reportError}
        submit={submit}
      />
    );

    fireEvent.click(container.querySelector(`[data-vertex-id="${vertexId}"]`)!);

    expect(submit).toHaveBeenCalledWith({
      type: "playDevelopmentCard",
      cardId: "militia-card",
      payload: { vertexIds: [vertexId, vertexId] }
    });
  });

  it("allows road crew to queue a second route connected only to its first route", () => {
    const state = setupActionState("road-crew-connected-routes");
    const originalLegalEdges = new Set(legalDevelopmentRouteEdges(state));
    const firstEdgeId = [...originalLegalEdges].find((edgeId) =>
      legalDevelopmentRouteEdges(state, "transport", [{ edgeId, routeType: "transport" }]).some(
        (candidateId) => !originalLegalEdges.has(candidateId)
      )
    );
    expect(firstEdgeId).toBeTruthy();
    const secondEdgeId = legalDevelopmentRouteEdges(state, "transport", [
      { edgeId: firstEdgeId!, routeType: "transport" }
    ]).find((edgeId) => !originalLegalEdges.has(edgeId));
    expect(secondEdgeId).toBeTruthy();

    const selection: UiSelection = {
      kind: "devRoadCrew",
      cardId: "road-crew-card",
      routeType: "transport",
      routes: [{ edgeId: firstEdgeId!, routeType: "transport" }]
    };
    const submit = vi.fn();
    const { container } = renderBoard(state, "transport", submit, selection);

    expect(container.querySelector(`[data-edge-id="${secondEdgeId}"] .route-piece-preview`)).toBeInTheDocument();
    fireEvent.click(container.querySelector(`[data-edge-id="${secondEdgeId}"]`)!);

    expect(submit).toHaveBeenCalledWith({
      type: "playDevelopmentCard",
      cardId: "road-crew-card",
      payload: {
        routes: [
          { edgeId: firstEdgeId, routeType: "transport" },
          { edgeId: secondEdgeId, routeType: "transport" }
        ]
      }
    });
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

  it("selects which militia to move on the map before choosing its destination", () => {
    const state = setupActionState("move-militia-select-source");
    const playerId = state.currentPlayerId;
    const source = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === playerId)!;
    const edgeId = source.edgeIds[0];
    const edge = state.board.edges[edgeId];
    const targetId = edge.vertexIds.find((vertexId) => vertexId !== source.id)!;
    const militiaId = "p1-active-move-test";
    state.board.edges[edgeId].route = { ownerId: playerId, type: "transport" };
    state.board.vertices[targetId].building = { ownerId: playerId, type: "camp" };
    state.players.find((player) => player.id === playerId)!.militia.push({
      id: militiaId,
      ownerId: playerId,
      vertexId: source.id,
      status: "active",
      activatedTurn: state.turn - 1
    });

    const selection: UiSelection = { kind: "moveMilitia" };
    const { container, rerender, setSelection, submit, reportError } = renderBoard(state, "none", vi.fn(), selection);

    fireEvent.click(container.querySelector(`[data-vertex-id="${source.id}"]`)!);

    expect(setSelection).toHaveBeenCalledWith({ kind: "moveMilitia", militiaId });
    expect(submit).not.toHaveBeenCalled();

    rerender(
      <BoardView
        state={state}
        tool="none"
        selection={{ kind: "moveMilitia", militiaId }}
        animationEvents={[]}
        setSelection={setSelection}
        reportError={reportError}
        submit={submit}
      />
    );

    fireEvent.click(container.querySelector(`[data-vertex-id="${targetId}"]`)!);

    expect(submit).toHaveBeenCalledWith({ type: "moveMilitia", militiaId, toVertexId: targetId });
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
