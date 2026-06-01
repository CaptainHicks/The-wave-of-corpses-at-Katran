import { describe, expect, it } from "vitest";
import {
  adjacentTileIds,
  createStandardBoard,
  hiddenTileIdsAroundRoute,
  isResourceTile,
  isBlackMarketVisible,
  routeTypeAllowedOnEdge,
  validateStandardBoard,
  vertexHasAdjacentBuilding,
  vertexTouchesOnlyRevealed,
  vertexTouchesResource,
  vertexTouchesWarehouse
} from "../../domain/board";
import {
  applyCommand,
  calculateScore,
  legalConvoyMoveFromEdges,
  legalConvoyMoveToEdges,
  legalBuildEdges,
  legalInitialCampVertices,
  legalInitialRouteEdges,
  legalRecruitVertices,
  longestSupplyLength
} from "../../domain/rules";
import { randomInt } from "../../domain/rng";
import type { BoardState, EdgeState, GameState, Resources } from "../../domain/types";
import { createResources } from "../../domain/constants";

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function diceFor(total: number): [number, number] {
  const first = Math.max(1, Math.min(6, total - 1));
  return [first, total - first];
}

function setupGame(): GameState {
  let state = applyCommand(undefined, { type: "createGame", players: players(), seed: "test" });
  while (state.phase === "setup") {
    const camp = legalInitialCampVertices(state)[0];
    expect(camp).toBeTruthy();
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: camp });
    const route = legalInitialRouteEdges(state)[0];
    expect(route).toBeTruthy();
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: route });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  return state;
}

function createSeededGame(seed: string): GameState {
  return applyCommand(undefined, { type: "createGame", players: players(), seed });
}

function clusterSignature(state: GameState): string {
  return state.board.rows
    .map((row) => row.map((id) => state.board.tiles[id].cluster).join(""))
    .join("|");
}

function tileTypeSignature(state: GameState): string {
  return state.board.rows
    .map((row) => row.map((id) => state.board.tiles[id].hiddenType).join(","))
    .join("|");
}

function edgeMidpoint(board: BoardState, edge: EdgeState): { x: number; y: number } {
  const [a, b] = edge.vertexIds.map((id) => board.vertices[id]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function eligibleBlackMarketEdges(board: BoardState): EdgeState[] {
  return Object.values(board.edges).filter((edge) => {
    if (edge.tileIds.length !== 2) return false;
    const [a, b] = edge.tileIds.map((id) => board.tiles[id]);
    return (isResourceTile(a) && b.hiddenType === "empty") || (isResourceTile(b) && a.hiddenType === "empty");
  });
}

function occupiedBands(values: number[], min: number, max: number): Set<number> {
  const span = max - min;
  if (span <= 0) return new Set([0]);
  return new Set(values.map((value) => Math.max(0, Math.min(2, Math.floor(((value - min) / span) * 3)))));
}

function vertexTouchesCluster(board: BoardState, vertexId: string, cluster: "large" | "small"): boolean {
  return board.vertices[vertexId].tileIds.some((id) => board.tiles[id].cluster === cluster);
}

function resourceClusters(board: BoardState): Set<"large" | "small"> {
  return new Set(
    Object.values(board.tiles)
      .filter((tile) => isResourceTile(tile))
      .map((tile) => tile.cluster)
      .filter((cluster): cluster is "large" | "small" => cluster !== "empty")
  );
}

function isBaseInitialCampCandidate(state: GameState, vertexId: string): boolean {
  const vertex = state.board.vertices[vertexId];
  return (
    !vertex.building &&
    !vertexHasAdjacentBuilding(state.board, vertexId) &&
    vertexTouchesOnlyRevealed(state.board, vertexId) &&
    vertexTouchesResource(state.board, vertexId, true) &&
    !vertexTouchesWarehouse(state.board, vertexId)
  );
}

function baseInitialCampCandidates(state: GameState): string[] {
  return Object.values(state.board.vertices)
    .filter((vertex) => isBaseInitialCampCandidate(state, vertex.id))
    .map((vertex) => vertex.id);
}

function createGameWithLargeAndSmallInitialOptions(): GameState {
  for (let index = 0; index < 80; index += 1) {
    const state = createSeededGame(`initial-largest-zone-${index}`);
    const clusters = resourceClusters(state.board);
    const smallOnlyInitialVertex = Object.values(state.board.vertices).find(
      (vertex) =>
        isBaseInitialCampCandidate(state, vertex.id) &&
        vertexTouchesCluster(state.board, vertex.id, "small") &&
        !vertexTouchesCluster(state.board, vertex.id, "large")
    );
    if (clusters.has("large") && clusters.has("small") && smallOnlyInitialVertex) return state;
  }

  throw new Error("No generated map with both large and small initial camp options found.");
}

function createGameWithoutLargeResourceZone(): GameState {
  for (let index = 0; index < 120; index += 1) {
    const state = createSeededGame(`initial-small-only-${index}`);
    const clusters = resourceClusters(state.board);
    if (!clusters.has("large") && clusters.has("small") && baseInitialCampCandidates(state).length > 0) return state;
  }

  throw new Error("No generated all-small resource map found.");
}

function createGameWithMultipleLargeResourceZones(): { state: GameState; largeComponents: string[][] } {
  for (let index = 0; index < 120; index += 1) {
    const state = createSeededGame(`initial-dual-largest-zone-${index}`);
    const largeComponents = resourceComponents(state.board, "large");
    if (
      largeComponents.length >= 2 &&
      largeComponents.filter((component) =>
        legalInitialCampVertices(state).some((vertexId) =>
          state.board.vertices[vertexId].tileIds.some((tileId) => component.includes(tileId))
        )
      ).length >= 2
    ) {
      return { state, largeComponents };
    }
  }

  throw new Error("No generated map with multiple large resource zones found.");
}

function resourceComponents(board: BoardState, cluster: "large" | "small"): string[][] {
  const remaining = new Set(
    Object.values(board.tiles)
      .filter((tile) => isResourceTile(tile) && tile.cluster === cluster)
      .map((tile) => tile.id)
  );
  const components: string[][] = [];

  while (remaining.size > 0) {
    const start = [...remaining][0];
    const component: string[] = [];
    const stack = [start];
    remaining.delete(start);

    while (stack.length > 0) {
      const tileId = stack.pop()!;
      component.push(tileId);
      adjacentTileIds(board, tileId)
        .filter((adjacentId) => remaining.has(adjacentId))
        .forEach((adjacentId) => {
          remaining.delete(adjacentId);
          stack.push(adjacentId);
        });
    }

    components.push(component);
  }

  return components;
}

function findSimpleEdgePath(
  state: GameState,
  length: number,
  excluded = new Set<string>(),
  playerId = "p1"
): string[] {
  const board = state.board;
  for (const start of Object.values(board.vertices)) {
    if (blocksPath(start.id)) continue;
    const result = search(start.id, [], new Set(excluded));
    if (result) return result;
  }
  throw new Error(`No path of ${length} edges found`);

  function blocksPath(vertexId: string): boolean {
    const building = board.vertices[vertexId].building;
    return Boolean(building && building.ownerId !== playerId);
  }

  function search(vertexId: string, path: string[], used: Set<string>): string[] | undefined {
    if (path.length === length) return path;
    const vertex = board.vertices[vertexId];
    for (const edgeId of vertex.edgeIds) {
      if (used.has(edgeId)) continue;
      const edge = board.edges[edgeId];
      if (edge.tileIds.length === 0 || edge.route) continue;
      const next = edge.vertexIds.find((id) => id !== vertexId)!;
      if (blocksPath(next)) continue;
      const nextUsed = new Set(used);
      nextUsed.add(edgeId);
      const result = search(next, [...path, edgeId], nextUsed);
      if (result) return result;
    }
    return undefined;
  }
}

describe("standard board", () => {
  it("matches the rulebook counts and placement constraints", () => {
    const board = createStandardBoard();
    expect(validateStandardBoard(board)).toEqual([]);
    expect(Object.keys(board.tiles)).toHaveLength(72);
    expect(board.rows.map((row) => row.length)).toEqual([9, 10, 11, 12, 11, 10, 9]);
  });

  it("places black markets on resource-empty edges and labels both market types", () => {
    const board = createStandardBoard();
    const marketEdges = Object.values(board.edges).filter((edge) => edge.blackMarket);
    expect(marketEdges).toHaveLength(9);
    expect(marketEdges.filter((edge) => edge.blackMarket?.type === "generic")).toHaveLength(4);
    expect(marketEdges.filter((edge) => edge.blackMarket?.type === "specific")).toHaveLength(5);
    marketEdges.forEach((edge) => {
      expect(edge.tileIds).toHaveLength(2);
      const types = edge.tileIds.map((id) => board.tiles[id].hiddenType);
      const resourceCount = edge.tileIds.filter((id) => routeTypeAllowedOnEdge(board, edge.id, "transport") && board.tiles[id].hiddenType !== "empty").length;
      expect(types).toContain("empty");
      expect(resourceCount).toBeGreaterThan(0);
    });
  });

  it("keeps black markets non-adjacent and spread across the full eligible map", () => {
    Array.from({ length: 24 }, (_, index) => createStandardBoard(`black-market-layout-${index}`)).forEach((board) => {
      const marketEdges = Object.values(board.edges).filter((edge) => edge.blackMarket);
      const usedMarketVertices = marketEdges.flatMap((edge) => edge.vertexIds);
      expect(new Set(usedMarketVertices).size).toBe(usedMarketVertices.length);

      const eligibleMidpoints = eligibleBlackMarketEdges(board).map((edge) => edgeMidpoint(board, edge));
      const marketMidpoints = marketEdges.map((edge) => edgeMidpoint(board, edge));
      const xValues = eligibleMidpoints.map((point) => point.x);
      const yValues = eligibleMidpoints.map((point) => point.y);
      const xMin = Math.min(...xValues);
      const xMax = Math.max(...xValues);
      const yMin = Math.min(...yValues);
      const yMax = Math.max(...yValues);

      expect(occupiedBands(marketMidpoints.map((point) => point.x), xMin, xMax)).toEqual(occupiedBands(xValues, xMin, xMax));
      expect(occupiedBands(marketMidpoints.map((point) => point.y), yMin, yMax)).toEqual(occupiedBands(yValues, yMin, yMax));
    });
  });

  it("shows black markets once any adjacent tile is revealed", () => {
    const board = createStandardBoard();
    const hiddenMarket = Object.values(board.edges).find(
      (edge) => edge.blackMarket && edge.tileIds.some((id) => !board.tiles[id].revealed)
    );
    expect(hiddenMarket).toBeTruthy();
    hiddenMarket!.tileIds.forEach((id) => {
      board.tiles[id].revealed = false;
    });
    expect(isBlackMarketVisible(board, hiddenMarket!.id)).toBe(false);
    board.tiles[hiddenMarket!.tileIds[0]].revealed = true;
    expect(isBlackMarketVisible(board, hiddenMarket!.id)).toBe(true);
    hiddenMarket!.tileIds.forEach((id) => {
      board.tiles[id].revealed = true;
    });
    expect(isBlackMarketVisible(board, hiddenMarket!.id)).toBe(true);
  });

  it("randomizes the map structure between new game seeds", () => {
    const signatures = new Set(
      Array.from({ length: 20 }, (_, index) => clusterSignature(createSeededGame(`map-structure-${index}`)))
    );

    expect(signatures.size).toBeGreaterThan(1);
  });

  it("randomizes resource placement inside repeated structure shapes", () => {
    const resourceSignaturesByStructure = new Map<string, Set<string>>();

    Array.from({ length: 40 }, (_, index) => createSeededGame(`map-resources-${index}`)).forEach((state) => {
      const structure = clusterSignature(state);
      const resourceSignatures = resourceSignaturesByStructure.get(structure) ?? new Set<string>();
      resourceSignatures.add(tileTypeSignature(state));
      resourceSignaturesByStructure.set(structure, resourceSignatures);
    });

    expect([...resourceSignaturesByStructure.values()].some((signatures) => signatures.size > 1)).toBe(true);
  });

  it("keeps random map seeds valid and playable for setup", () => {
    ["playable-a", "playable-b", "playable-c", "playable-d", "playable-e"].forEach((seed) => {
      const state = createSeededGame(seed);

      expect(validateStandardBoard(state.board)).toEqual([]);
      expect(legalInitialCampVertices(state).length).toBeGreaterThan(0);
      expect(Object.values(state.board.tiles).some((tile) => tile.hiddenType === "infected" && tile.revealed)).toBe(
        true
      );
    });
  });

  it("can start a game without fog and reveal the whole map", () => {
    const state = applyCommand(undefined, {
      type: "createGame",
      players: players(),
      seed: "no-fog-map",
      fogEnabled: false
    });

    expect(state.fogEnabled).toBe(false);
    expect(Object.values(state.board.tiles).every((tile) => tile.revealed)).toBe(true);
  });

  it("keeps fog enabled by default", () => {
    const state = createSeededGame("default-fog-map");

    expect(state.fogEnabled).toBe(true);
    expect(Object.values(state.board.tiles).some((tile) => !tile.revealed)).toBe(true);
  });
});

describe("setup and production", () => {
  it("limits initial camps to the largest resource zones when large zones exist", () => {
    const state = createGameWithLargeAndSmallInitialOptions();
    const legalVertices = legalInitialCampVertices(state);
    const smallOnlyVertex = Object.values(state.board.vertices).find(
      (vertex) =>
        isBaseInitialCampCandidate(state, vertex.id) &&
        vertexTouchesCluster(state.board, vertex.id, "small") &&
        !vertexTouchesCluster(state.board, vertex.id, "large")
    );

    expect(smallOnlyVertex).toBeTruthy();
    expect(legalVertices.every((vertexId) => vertexTouchesCluster(state.board, vertexId, "large"))).toBe(true);
    expect(legalVertices).not.toContain(smallOnlyVertex!.id);
    expect(() => applyCommand(state, { type: "placeInitialCamp", vertexId: smallOnlyVertex!.id })).toThrow(
      "最大资源区"
    );
  });

  it("allows small resource zones for initial camps when the map has no large resource zone", () => {
    const state = createGameWithoutLargeResourceZone();
    const legalVertices = legalInitialCampVertices(state);
    const baseVertices = baseInitialCampCandidates(state);

    expect(legalVertices.length).toBeGreaterThan(0);
    expect(new Set(legalVertices)).toEqual(new Set(baseVertices));
    expect(legalVertices.every((vertexId) => vertexTouchesCluster(state.board, vertexId, "small"))).toBe(true);
  });

  it("allows initial camps in both largest resource zones when two large zones exist", () => {
    const { state, largeComponents } = createGameWithMultipleLargeResourceZones();
    const legalVertices = legalInitialCampVertices(state);
    const reachableLargeZoneCount = largeComponents.filter((component) =>
      legalVertices.some((vertexId) => state.board.vertices[vertexId].tileIds.some((tileId) => component.includes(tileId)))
    ).length;

    expect(reachableLargeZoneCount).toBeGreaterThanOrEqual(2);
  });

  it("supports the rulebook range of two to six hot-seat players", () => {
    const two = applyCommand(undefined, {
      type: "createGame",
      players: players().slice(0, 2),
      seed: "two-player"
    });
    expect(two.players).toHaveLength(2);

    const six = applyCommand(undefined, {
      type: "createGame",
      players: [
        ...players(),
        { name: "D", color: "#d49b28" },
        { name: "E", color: "#8e5bb7" },
        { name: "F", color: "#5b7f86" }
      ],
      seed: "six-player"
    });
    expect(six.players).toHaveLength(6);

    const debug = applyCommand(undefined, {
      type: "createGame",
      players: [
        { name: "A", color: "#d84f3f", factionId: "red-rust" },
        { name: "B", color: "#2b78d4", factionId: "blue-steel" }
      ],
      seed: "debug-player-options",
      debugMode: true
    });
    expect(debug.debugMode).toBe(true);
    expect(debug.players[0].factionId).toBe("red-rust");
  });

  it("runs snake initial placement and starts player one prepare phase", () => {
    const state = setupGame();
    expect(state.phase).toBe("prepare");
    expect(state.currentPlayerId).toBe("p1");
    const buildings = Object.values(state.board.vertices).filter((vertex) => vertex.building);
    expect(buildings).toHaveLength(6);
  });

  it("rolls two separate six-sided dice from consecutive random draws", () => {
    const state = setupGame();
    const [first, rngAfterFirst] = randomInt(state.rng, 6);
    const [second, rngAfterSecond] = randomInt(rngAfterFirst, 6);

    const next = applyCommand(state, { type: "rollDice" });

    expect(next.dice).toEqual([first + 1, second + 1]);
    expect(next.rng).toEqual(rngAfterSecond);
    expect(next.dice?.every((value) => value >= 1 && value <= 6)).toBe(true);
  });

  it("rejects invalid forced dice values before applying the roll", () => {
    const state = setupGame();

    expect(() => applyCommand(state, { type: "rollDice", forced: [0, 7] })).toThrow("骰子点数必须是 1 到 6。");
  });

  it("produces resources from an adjacent numbered tile", () => {
    let state = setupGame();
    const p1 = state.players[0];
    const vertex = Object.values(state.board.vertices).find((item) => item.building?.ownerId === p1.id)!;
    const tile = vertex.tileIds.map((id) => state.board.tiles[id]).find((item) => item.number && item.hiddenType !== "warehouse")!;
    const before = { ...p1.resources };
    state = applyCommand(state, { type: "rollDice", forced: diceFor(tile.number!) });
    const after = state.players[0].resources;
    const gained = Object.keys(after).some((resource) => after[resource as keyof Resources] > before[resource as keyof Resources]);
    expect(gained).toBe(true);
    expect(state.phase).toBe("action");
  });

  it("reveals every fog tile around a newly built route segment", () => {
    let state = setupGame();
    const candidate = Object.values(state.board.edges).find((edge) => {
      const hidden = hiddenTileIdsAroundRoute(state.board, edge.id);
      return !edge.route && hidden.length >= 2 && hidden.every((id) => state.board.tiles[id].hiddenType === "empty");
    });
    expect(candidate).toBeTruthy();
    const player = state.players[0];
    const anchor = state.board.vertices[candidate!.vertexIds[0]];
    anchor.building = { ownerId: player.id, type: "camp" };
    state.phase = "action";

    const hiddenBefore = hiddenTileIdsAroundRoute(state.board, candidate!.id);
    state = applyCommand(state, {
      type: "buildRoute",
      edgeId: candidate!.id,
      routeType: "convoy",
      free: true
    });

    expect(hiddenBefore.length).toBeGreaterThanOrEqual(2);
    expect(hiddenBefore.every((id) => state.board.tiles[id].revealed)).toBe(true);
  });

  it("allows convoys on empty edges but blocks transport lines there", () => {
    let state = setupGame();
    const emptyEdge = Object.values(state.board.edges).find(
      (edge) => !edge.route && edge.tileIds.length > 0 && edge.tileIds.every((id) => state.board.tiles[id].hiddenType === "empty")
    );
    expect(emptyEdge).toBeTruthy();
    expect(routeTypeAllowedOnEdge(state.board, emptyEdge!.id, "transport")).toBe(false);
    expect(routeTypeAllowedOnEdge(state.board, emptyEdge!.id, "convoy")).toBe(true);

    const player = state.players[0];
    state.board.vertices[emptyEdge!.vertexIds[0]].building = { ownerId: player.id, type: "camp" };
    state.phase = "action";

    expect(legalBuildEdges(state, "transport")).not.toContain(emptyEdge!.id);
    expect(legalBuildEdges(state, "convoy")).toContain(emptyEdge!.id);
    expect(() =>
      applyCommand(state, {
        type: "buildRoute",
        edgeId: emptyEdge!.id,
        routeType: "transport",
        free: true
      })
    ).toThrow(/运输线只能放在资源地块边缘/);

    state = applyCommand(state, {
      type: "buildRoute",
      edgeId: emptyEdge!.id,
      routeType: "convoy",
      free: true
    });
    expect(state.board.edges[emptyEdge!.id].route?.type).toBe("convoy");
  });

  it("exposes legal convoy move targets from an open convoy", () => {
    let state = setupGame();
    state.phase = "action";
    const source = legalBuildEdges(state, "convoy")[0];
    expect(source).toBeTruthy();
    state = applyCommand(state, {
      type: "buildRoute",
      edgeId: source,
      routeType: "convoy",
      free: true
    });

    expect(legalConvoyMoveFromEdges(state)).toContain(source);
    expect(legalConvoyMoveToEdges(state, source).length).toBeGreaterThan(0);
  });

  it("grants black market trade from either endpoint of the market edge", () => {
    let state = setupGame();
    const marketEdge = Object.values(state.board.edges).find(
      (edge) => edge.blackMarket?.type === "generic" && isBlackMarketVisible(state.board, edge.id)
    );
    expect(marketEdge).toBeTruthy();
    const player = state.players[0];
    state.board.vertices[marketEdge!.vertexIds[1]].building = { ownerId: player.id, type: "camp" };
    state.phase = "action";
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: player.id,
      resources: createResources({ food: 3 })
    });
    state = applyCommand(state, {
      type: "bankTrade",
      give: "food",
      receive: "wood",
      rate: 3
    });
    expect(state.players[0].resources.food).toBe(0);
    expect(state.players[0].resources.wood).toBe(1);
  });

  it("requires the target player to confirm multi-resource player trades", () => {
    let state = setupGame();
    state.phase = "action";
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 1, metal: 1 })
    });
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p2",
      resources: createResources({ wood: 1, ammo: 2 })
    });

    state = applyCommand(state, {
      type: "playerTrade",
      targetPlayerId: "p2",
      offer: { food: 1, metal: 1 },
      request: { wood: 1, ammo: 2 }
    });
    expect(state.pending?.kind).toBe("confirmTrade");
    expect(state.pending?.playerId).toBe("p2");
    expect(state.players[0].resources.food).toBe(1);
    expect(state.players[0].resources.metal).toBe(1);
    expect(state.players[1].resources.wood).toBe(1);
    expect(state.players[1].resources.ammo).toBe(2);

    state = applyCommand(state, { type: "confirmPlayerTrade", accept: true });
    expect(state.pending).toBeUndefined();
    expect(state.players[0].resources.wood).toBe(1);
    expect(state.players[0].resources.ammo).toBe(2);
    expect(state.players[1].resources.food).toBe(1);
    expect(state.players[1].resources.metal).toBe(1);
  });

  it("lets public trade offers rotate through other players until one accepts", () => {
    let state = setupGame();
    state.phase = "action";
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 1 })
    });
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p2",
      resources: createResources({ wood: 1 })
    });
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p3",
      resources: createResources({ wood: 1 })
    });

    state = applyCommand(state, {
      type: "playerTrade",
      offer: { food: 1 },
      request: { wood: 1 }
    });
    expect(state.pending?.kind).toBe("confirmTrade");
    expect(state.pending?.playerId).toBe("p2");

    state = applyCommand(state, { type: "confirmPlayerTrade", accept: false });
    expect(state.pending?.kind).toBe("confirmTrade");
    expect(state.pending?.playerId).toBe("p3");
    expect(state.players[1].resources.wood).toBe(1);

    state = applyCommand(state, { type: "confirmPlayerTrade", accept: true });
    expect(state.pending).toBeUndefined();
    expect(state.players[0].resources.wood).toBe(1);
    expect(state.players[0].resources.food).toBe(0);
    expect(state.players[1].resources.wood).toBe(1);
    expect(state.players[2].resources.wood).toBe(0);
    expect(state.players[2].resources.food).toBe(1);
  });

  it("shows only own buildings with militia capacity as recruit targets", () => {
    let state = setupGame();
    const player = state.players[0];
    const vertex = Object.values(state.board.vertices).find((item) => item.building?.ownerId === player.id)!;
    state.phase = "action";
    expect(legalRecruitVertices(state)).toContain(vertex.id);

    state = applyCommand(state, { type: "recruitMilitia", vertexId: vertex.id, free: true });
    state = applyCommand(state, { type: "recruitMilitia", vertexId: vertex.id, free: true });

    expect(legalRecruitVertices(state)).not.toContain(vertex.id);
    expect(() =>
      applyCommand(state, { type: "recruitMilitia", vertexId: vertex.id, free: true })
    ).toThrow(/最多驻守2个民兵/);
  });

  it("starts discard and zombie movement flow on seven", () => {
    let state = setupGame();
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 9 })
    });
    state = applyCommand(state, { type: "rollDice", forced: [3, 4] });
    expect(state.phase).toBe("zombie");
    expect(state.zombieTrack).toBe(1);
    expect(state.pending?.kind).toBe("discard");
    state = applyCommand(state, { type: "discardResources", resources: { food: 4 } });
    expect(state.pending?.kind).toBe("moveZombie");
    const targetTileId = Object.values(state.board.tiles).find(
      (tile) => tile.revealed && tile.id !== state.zombieTileId
    )!.id;
    state = applyCommand(state, { type: "moveZombie", tileId: targetTileId });
    expect(state.zombieTrack).toBe(1);
  });
});

describe("free action phase", () => {
  function actionGame(): GameState {
    let state = setupGame();
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 10, wood: 10, metal: 10, fuel: 10, ammo: 10 })
    });
    return applyCommand(state, { type: "rollDice", forced: [1, 1] });
  }

  it("blocks free actions before the mandatory dice roll", () => {
    let state = setupGame();
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 10, wood: 10, metal: 10, fuel: 10, ammo: 10 })
    });
    const anyEdge = Object.keys(state.board.edges)[0];

    expect(() => applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" })).toThrow();
    expect(() =>
      applyCommand(state, { type: "buildRoute", edgeId: anyEdge, routeType: "transport", free: true })
    ).toThrow();
    expect(() => applyCommand(state, { type: "buyDevelopmentCard" })).toThrow();
  });

  it("allows trading before building after the dice roll", () => {
    let state = actionGame();
    expect(state.phase).toBe("action");

    state = applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" });
    const edge = legalBuildEdges(state, "transport")[0];
    expect(edge).toBeTruthy();
    state = applyCommand(state, { type: "buildRoute", edgeId: edge, routeType: "transport" });

    expect(state.board.edges[edge].route?.ownerId).toBe("p1");
  });

  it("allows building before trading after the dice roll", () => {
    let state = actionGame();
    const edge = legalBuildEdges(state, "transport")[0];
    expect(edge).toBeTruthy();

    state = applyCommand(state, { type: "buildRoute", edgeId: edge, routeType: "transport" });
    state = applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" });

    expect(state.phase).toBe("action");
  });

  it("allows recruiting and readying militia before trading", () => {
    let state = actionGame();
    const vertex = legalRecruitVertices(state)[0];
    expect(vertex).toBeTruthy();

    state = applyCommand(state, { type: "recruitMilitia", vertexId: vertex });
    const militiaId = state.players[0].militia[0].id;
    state = applyCommand(state, { type: "activateMilitia", militiaId });
    state = applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" });

    expect(state.players[0].militia[0].status).toBe("readying");
  });

  it("allows buying a development card before trading", () => {
    let state = actionGame();

    state = applyCommand(state, { type: "buyDevelopmentCard" });
    state = applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" });

    expect(state.players[0].devCards).toHaveLength(1);
  });

  it("blocks free actions while pending choices remain unresolved", () => {
    let state = setupGame();
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 9 })
    });
    state = applyCommand(state, { type: "rollDice", forced: [3, 4] });

    expect(state.pending?.kind).toBe("discard");
    expect(() => applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" })).toThrow();
  });

  it("keeps same-turn purchased development cards unplayable", () => {
    let state = actionGame();
    state = applyCommand(state, { type: "buyDevelopmentCard" });
    const card = state.players[0].devCards[0];

    expect(() => applyCommand(state, { type: "playDevelopmentCard", cardId: card.id })).toThrow();
  });

  it("still allows only one played development card each turn", () => {
    let state = actionGame();
    state.players[0].devCards.push(
      { id: "req-1", type: "requisition", purchasedTurn: 0 },
      { id: "req-2", type: "requisition", purchasedTurn: 0 }
    );

    state = applyCommand(state, {
      type: "playDevelopmentCard",
      cardId: "req-1",
      payload: { resource: "wood" }
    });

    expect(() =>
      applyCommand(state, {
        type: "playDevelopmentCard",
        cardId: "req-2",
        payload: { resource: "wood" }
      })
    ).toThrow();
  });
});

describe("scoring and siege", () => {
  it("counts camp, fortress, defender, merchant, and secret base victory points", () => {
    const state = setupGame();
    const p1 = state.players[0];
    const vertex = Object.values(state.board.vertices).find((item) => item.building?.ownerId === p1.id)!;
    vertex.building!.type = "fortress";
    p1.defenderTokens = 1;
    p1.devCards.push({ id: "secret", type: "secretBase", purchasedTurn: 0, revealed: true });
    state.merchant.controllerId = p1.id;
    const score = calculateScore(state, p1.id);
    expect(score.total).toBeGreaterThanOrEqual(5);
  });

  it("checks victory on end turn and reveals hidden secret bases when needed", () => {
    let state = setupGame();
    const p1 = state.players[0];
    p1.defenderTokens = 11;
    p1.devCards.push({ id: "hidden-secret", type: "secretBase", purchasedTurn: 0 });
    state.phase = "action";

    expect(calculateScore(state, p1.id).total).toBe(13);
    state = applyCommand(state, { type: "endTurn" });

    expect(state.phase).toBe("victory");
    expect(state.winnerId).toBe(p1.id);
    expect(state.players[0].devCards.find((card) => card.id === "hidden-secret")?.revealed).toBe(true);
  });

  it("does not allow secret bases to be manually played as development cards", () => {
    const state = setupGame();
    state.phase = "action";
    state.players[0].devCards.push({ id: "manual-secret", type: "secretBase", purchasedTurn: 0 });

    expect(() =>
      applyCommand(state, { type: "playDevelopmentCard", cardId: "manual-secret" })
    ).toThrow(/秘密据点不需要主动使用/);
  });

  it("calculates a mixed supply line length", () => {
    const state = setupGame();
    const p1 = state.players[0];
    const edges = Object.values(state.board.edges).filter((edge) => !edge.route).slice(0, 5);
    edges.forEach((edge, index) => {
      edge.route = { ownerId: p1.id, type: index % 2 === 0 ? "transport" : "convoy" };
    });
    expect(longestSupplyLength(state.board, p1.id)).toBeGreaterThan(0);
  });

  it("recalculates longest supply when a holder line is broken or surpassed", () => {
    let state = setupGame();
    const p1Path = findSimpleEdgePath(state, 5);
    p1Path.forEach((edgeId, index) => {
      state.board.edges[edgeId].route = {
        ownerId: "p1",
        type: index % 2 === 0 ? "transport" : "convoy"
      };
    });
    state = applyCommand(state, { type: "debugJumpPhase", phase: state.phase });
    expect(state.awards.longestSupply?.playerId).toBe("p1");

    const excluded = new Set(p1Path);
    const p2Path = findSimpleEdgePath(state, 6, excluded, "p2");
    p2Path.forEach((edgeId) => {
      state.board.edges[edgeId].route = { ownerId: "p2", type: "transport" };
    });
    state = applyCommand(state, { type: "debugJumpPhase", phase: state.phase });
    expect(state.awards.longestSupply?.playerId).toBe("p2");
    expect(state.awards.longestSupply?.length).toBeGreaterThanOrEqual(6);

    p2Path.forEach((edgeId) => {
      state.board.edges[edgeId].route = undefined;
    });
    state = applyCommand(state, { type: "debugJumpPhase", phase: state.phase });
    expect(state.awards.longestSupply?.playerId).toBe("p1");

    p1Path.forEach((edgeId) => {
      state.board.edges[edgeId].route = undefined;
    });
    state = applyCommand(state, { type: "debugJumpPhase", phase: state.phase });
    expect(state.awards.longestSupply).toBeUndefined();
  });

  it("recalculates strongest militia instead of trusting the previous holder count", () => {
    let state = setupGame();
    const p1Vertex = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p1")!.id;
    const p2Vertex = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p2")!.id;
    state.players[0].militia = [0, 1, 2].map((index) => ({
      id: `p1-m-${index}`,
      ownerId: "p1",
      vertexId: p1Vertex,
      status: "inactive"
    }));
    state = applyCommand(state, { type: "debugJumpPhase", phase: state.phase });
    expect(state.awards.strongestMilitia?.playerId).toBe("p1");

    state.players[0].militia = state.players[0].militia.slice(0, 2);
    state.players[1].militia = [0, 1, 2].map((index) => ({
      id: `p2-m-${index}`,
      ownerId: "p2",
      vertexId: p2Vertex,
      status: "inactive"
    }));
    state = applyCommand(state, { type: "debugJumpPhase", phase: state.phase });
    expect(state.awards.strongestMilitia?.playerId).toBe("p2");
  });

  it("queues fortress downgrade choices after a failed siege", () => {
    let state = setupGame();
    const p1Camp = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p1")!;
    const p2Camp = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p2")!;
    p1Camp.building!.type = "fortress";
    p2Camp.building!.type = "fortress";
    state.zombieTrack = 5;
    state.phase = "action";
    state.players[0].devCards.push({ id: "zombie-card", type: "zombieApproaches", purchasedTurn: 0 });

    state = applyCommand(state, { type: "playDevelopmentCard", cardId: "zombie-card" });

    expect(state.zombieTrack).toBe(0);
    expect(state.pending?.kind).toBe("downgradeFortress");
  });

  it("only makes fortress owners with the fewest active militia lose a fortress after failed siege", () => {
    let state = setupGame();
    const p1Fortress = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p1")!;
    const p2Fortresses = Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === "p2");
    const p3Camp = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p3")!;
    p1Fortress.building!.type = "fortress";
    p2Fortresses[0].building!.type = "fortress";
    p2Fortresses[1].building!.type = "fortress";
    state.players[1].militia.push({
      id: "p2-active",
      ownerId: "p2",
      vertexId: p2Fortresses[0].id,
      status: "active"
    });
    state.players[2].militia.push({
      id: "p3-active",
      ownerId: "p3",
      vertexId: p3Camp.id,
      status: "active"
    });
    state.zombieTrack = 5;
    state.phase = "action";
    state.players[0].devCards.push({ id: "zombie-card", type: "zombieApproaches", purchasedTurn: 0 });

    state = applyCommand(state, { type: "playDevelopmentCard", cardId: "zombie-card" });

    expect(state.pending).toMatchObject({
      kind: "downgradeFortress",
      playerId: "p1",
      vertexIds: [p1Fortress.id]
    });
    expect(state.pending && "next" in state.pending ? state.pending.next : undefined).toMatchObject({
      kind: "chooseResource",
      playerId: "p1"
    });
    expect(state.board.vertices[p3Camp.id].building?.type).toBe("camp");
  });
});
