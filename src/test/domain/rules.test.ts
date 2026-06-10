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
  legalDevelopmentRouteEdges,
  legalInitialCampVertices,
  legalInitialRouteEdges,
  legalExpelZombieMilitiaIds,
  legalRecruitVertices,
  longestSupplyLength
} from "../../domain/rules";
import { randomInt } from "../../domain/rng";
import type { BoardState, EdgeState, GameState, Resources, TileType } from "../../domain/types";
import { DEV_CARD_COUNTS, PIECE_LIMITS, TILE_LABELS, VICTORY_POINTS_TO_WIN, createResources } from "../../domain/constants";

const NORMAL_RESOURCE_TYPES: TileType[] = ["factory", "farm", "military", "forest", "city"];
const NORMAL_RESOURCE_TARGET_WEIGHTS: Record<TileType, number> = {
  factory: 24,
  farm: 22,
  military: 20,
  forest: 19,
  city: 15,
  warehouse: 0,
  infected: 0,
  empty: 0
};

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

function smallResourceZoneIdsForVertex(board: BoardState, vertexId: string): string[] {
  const vertex = board.vertices[vertexId];
  const zoneIds = new Set<string>();
  vertex.tileIds.forEach((tileId) => {
    const tile = board.tiles[tileId];
    if (tile.cluster === "small" && isResourceTile(tile)) {
      zoneIds.add(smallResourceZoneId(board, tileId));
    }
  });
  return [...zoneIds];
}

function smallResourceZoneId(board: BoardState, startTileId: string): string {
  const visited = new Set<string>();
  const stack = [startTileId];
  while (stack.length > 0) {
    const tileId = stack.pop()!;
    if (visited.has(tileId)) continue;
    const tile = board.tiles[tileId];
    if (tile.cluster !== "small" || !isResourceTile(tile)) continue;
    visited.add(tileId);
    adjacentTileIds(board, tileId).forEach((adjacentId) => {
      const adjacent = board.tiles[adjacentId];
      if (adjacent.cluster === "small" && isResourceTile(adjacent) && !visited.has(adjacentId)) {
        stack.push(adjacentId);
      }
    });
  }
  return [...visited].sort().join(",");
}

function findSmallResourceCampSpot(state: GameState): { vertexId: string; routeEdgeId: string; zoneIds: string[] } {
  const spot = Object.values(state.board.vertices)
    .map((vertex) => ({
      vertex,
      routeEdgeId: vertex.edgeIds.find((edgeId) => !state.board.edges[edgeId].route),
      zoneIds: smallResourceZoneIdsForVertex(state.board, vertex.id)
    }))
    .find(
      ({ vertex, routeEdgeId, zoneIds }) =>
        !vertex.building &&
        Boolean(routeEdgeId) &&
        zoneIds.length > 0 &&
        !vertexHasAdjacentBuilding(state.board, vertex.id)
    );
  expect(spot).toBeTruthy();
  return { vertexId: spot!.vertex.id, routeEdgeId: spot!.routeEdgeId!, zoneIds: spot!.zoneIds };
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
    const state = applyCommand(undefined, {
      type: "createGame",
      players: players(),
      seed: `initial-largest-zone-${index}`,
      fogEnabled: false
    });
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

function normalResourceTargetCounts(count: number): Record<TileType, number> {
  const base = NORMAL_RESOURCE_TYPES.reduce<Record<TileType, number>>(
    (acc, type) => {
      acc[type] = Math.floor((count * NORMAL_RESOURCE_TARGET_WEIGHTS[type]) / 100);
      return acc;
    },
    { farm: 0, forest: 0, factory: 0, city: 0, military: 0, warehouse: 0, infected: 0, empty: 0 }
  );
  const allocated = NORMAL_RESOURCE_TYPES.reduce((total, type) => total + base[type], 0);
  const remainders = NORMAL_RESOURCE_TYPES.map((type) => ({
    type,
    remainder: (count * NORMAL_RESOURCE_TARGET_WEIGHTS[type]) / 100 - base[type]
  })).sort((a, b) => b.remainder - a.remainder);

  for (let index = 0; index < count - allocated; index += 1) {
    base[remainders[index % remainders.length].type] += 1;
  }

  return base;
}

function sameResourceComponents(board: BoardState): string[][] {
  const remaining = new Set(
    Object.values(board.tiles)
      .filter((tile) => NORMAL_RESOURCE_TYPES.includes(tile.hiddenType))
      .map((tile) => tile.id)
  );
  const components: string[][] = [];

  while (remaining.size > 0) {
    const start = [...remaining][0];
    const type = board.tiles[start].hiddenType;
    const component: string[] = [];
    const stack = [start];
    remaining.delete(start);

    while (stack.length > 0) {
      const tileId = stack.pop()!;
      component.push(tileId);
      adjacentTileIds(board, tileId)
        .filter((adjacentId) => remaining.has(adjacentId) && board.tiles[adjacentId].hiddenType === type)
        .forEach((adjacentId) => {
          remaining.delete(adjacentId);
          stack.push(adjacentId);
        });
    }

    components.push(component);
  }

  return components;
}

function clusterComponents(board: BoardState, cluster: "large" | "small"): string[][] {
  const remaining = new Set(
    Object.values(board.tiles)
      .filter((tile) => tile.cluster === cluster)
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

describe("game setup", () => {
  it("gives each player the configured piece limits", () => {
    const state = createSeededGame("piece-limits");

    expect(state.players).toHaveLength(3);
    state.players.forEach((player) => {
      expect(player.pieces).toEqual(PIECE_LIMITS);
    });
  });
});

describe("development deck", () => {
  it("matches the recommended development card totals", () => {
    expect(DEV_CARD_COUNTS).toEqual({
      secretBase: 5,
      zombieApproaches: 4,
      roadCrew: 2,
      airdrop: 2,
      merchant: 2,
      militiaMobilization: 6,
      requisition: 2
    });
    expect(Object.values(DEV_CARD_COUNTS).reduce((total, count) => total + count, 0)).toBe(23);
  });
});

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

  it("does not repeat the same board layout in consecutive new games", () => {
    const signatures = Array.from(
      { length: 14 },
      (_, index) => createSeededGame(`non-repeat-layout-${index}`).board.structureSignature
    );

    signatures.slice(1).forEach((signature, index) => {
      expect(signature).not.toBe(signatures[index]);
    });
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

  it("keeps initial large resource zones stocked with every normal resource", () => {
    Array.from({ length: 8 }, (_, index) => createStandardBoard(`initial-zone-mix-${index}`)).forEach((board) => {
      clusterComponents(board, "large").forEach((component) => {
        NORMAL_RESOURCE_TYPES.forEach((type) => {
          expect(component.filter((tileId) => board.tiles[tileId].hiddenType === type).length).toBeGreaterThanOrEqual(2);
        });
      });
    });
  });

  it("limits each initial large resource zone to one infected tile", () => {
    Array.from({ length: 16 }, (_, index) => createStandardBoard(`initial-zone-infected-${index}`)).forEach((board) => {
      clusterComponents(board, "large").forEach((component) => {
        expect(component.filter((tileId) => board.tiles[tileId].hiddenType === "infected")).toHaveLength(1);
      });
    });
  });

  it("keeps normal resources near the target distribution", () => {
    Array.from({ length: 8 }, (_, index) => createStandardBoard(`resource-ratio-${index}`)).forEach((board) => {
      const normalCount = Object.values(board.tiles).filter((tile) => NORMAL_RESOURCE_TYPES.includes(tile.hiddenType)).length;
      const expectedCounts = normalResourceTargetCounts(normalCount);

      NORMAL_RESOURCE_TYPES.forEach((type) => {
        expect(Object.values(board.tiles).filter((tile) => tile.hiddenType === type)).toHaveLength(expectedCounts[type]);
      });
    });
  });

  it("prevents three or more adjacent tiles of the same normal resource", () => {
    Array.from({ length: 8 }, (_, index) => createStandardBoard(`resource-adjacency-${index}`)).forEach((board) => {
      expect(Math.max(...sameResourceComponents(board).map((component) => component.length))).toBeLessThanOrEqual(2);
    });
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

  it("rolls two dice per player and starts setup with the unique highest roller", () => {
    const state = createSeededGame("starting-player-roll");
    const rollMessages = [...state.log]
      .reverse()
      .map((entry) => entry.message)
      .filter((message) => message.includes("开局掷出"));
    const finalRollByPlayer = new Map<string, number>();

    rollMessages.forEach((message) => {
      const match = /^(.*?) 开局掷出 \d \+ \d = (\d+)。$/.exec(message);
      expect(match).toBeTruthy();
      finalRollByPlayer.set(match![1], Number(match![2]));
    });

    const starter = state.players.find((player) => player.id === state.currentPlayerId)!;
    expect(rollMessages.length).toBeGreaterThanOrEqual(state.players.length);
    expect(state.setup.order[0]).toBe(starter.id);
    expect(finalRollByPlayer.get(starter.name)).toBe(Math.max(...finalRollByPlayer.values()));
    expect(state.log[0].message).toContain(`${starter.name} 点数最高`);
  });

  it("rerolls only the players tied for the highest opening roll", () => {
    const state = createSeededGame("tie-0");
    const messages = [...state.log].reverse().map((entry) => entry.message);

    expect(messages).toContain("A、B 最高点并列，继续重掷。");
    expect(messages.filter((message) => message.startsWith("A 开局掷出"))).toHaveLength(2);
    expect(messages.filter((message) => message.startsWith("B 开局掷出"))).toHaveLength(2);
    expect(messages.filter((message) => message.startsWith("C 开局掷出"))).toHaveLength(1);
    expect(state.currentPlayerId).toBe("p2");
  });

  it("runs snake initial placement and starts the highest roller prepare phase", () => {
    const state = setupGame();
    expect(state.phase).toBe("prepare");
    expect(state.currentPlayerId).toBe(state.setup.order[0]);
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
    Object.values(state.board.tiles).forEach((tile) => {
      tile.revealed = true;
    });

    const player = state.players[0];
    state.board.vertices[emptyEdge!.vertexIds[0]].building = { ownerId: player.id, type: "camp" };
    state.phase = "action";
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: player.id,
      resources: createResources({ ammo: 1, fuel: 1 })
    });

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
      routeType: "convoy"
    });
    expect(state.board.edges[emptyEdge!.id].route?.type).toBe("convoy");
    expect(state.players[0].resources).toMatchObject({ ammo: 0, fuel: 0, metal: 0 });
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

  it("skips players who cannot fulfill a public trade request", () => {
    let state = setupGame();
    state.phase = "action";
    state.currentPlayerId = "p1";
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
      resources: createResources({ wood: 1, ammo: 1 })
    });

    state = applyCommand(state, {
      type: "playerTrade",
      offer: { food: 1 },
      request: { wood: 1, ammo: 1 }
    });

    expect(state.pending?.kind).toBe("confirmTrade");
    if (state.pending?.kind !== "confirmTrade") throw new Error("Expected a pending player trade.");
    expect(state.pending?.playerId).toBe("p3");
    expect(state.pending?.candidateTargetIds).toEqual(["p3"]);
  });

  it("ends a public trade immediately when no other player can fulfill the request", () => {
    let state = setupGame();
    state.phase = "action";
    state.currentPlayerId = "p1";
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
      resources: createResources({ ammo: 1 })
    });

    state = applyCommand(state, {
      type: "playerTrade",
      offer: { food: 1 },
      request: { wood: 1, ammo: 1 }
    });

    expect(state.pending).toBeUndefined();
    expect(state.log[0].message).toContain("没有可回应的玩家");
  });

  it("automatically rejects a direct trade when the target cannot fulfill the request", () => {
    let state = setupGame();
    state.phase = "action";
    state.currentPlayerId = "p1";
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
      type: "playerTrade",
      targetPlayerId: "p2",
      offer: { food: 1 },
      request: { wood: 1, ammo: 1 }
    });

    expect(state.pending).toBeUndefined();
    expect(state.log[0].message).toContain("自动拒绝");
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
    ).toThrow(/最多驻守 2 个民兵/);
  });

  it("starts discard and zombie movement flow on seven", () => {
    let state = setupGame();
    const rollerName = state.players.find((player) => player.id === state.currentPlayerId)!.name;
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources({ food: 9 })
    });
    state = applyCommand(state, { type: "rollDice", forced: [3, 4] });
    expect(state.phase).toBe("zombie");
    expect(state.zombieTrack).toBe(1);
    expect(state.pending?.kind).toBe("discard");
    expect(state.log.some((entry) => entry.message === `${rollerName} 掷出 3 + 4 = 7，进入尸潮来袭阶段。`)).toBe(
      true
    );
    expect(state.log.some((entry) => entry.message === "掷出 7：进入尸潮阶段。")).toBe(false);
    expect(state.log.some((entry) => entry.message === "尸潮围城进度 +1，当前为 1/6。")).toBe(true);
    state = applyCommand(state, { type: "discardResources", resources: { food: 4 } });
    expect(state.pending?.kind).toBe("moveZombie");
    const targetTileId = Object.values(state.board.tiles).find(
      (tile) => tile.revealed && tile.id !== state.zombieTileId
    )!.id;
    state = applyCommand(state, { type: "moveZombie", tileId: targetTileId });
    expect(state.zombieTrack).toBe(1);
  });

  it("supports debug commands for zombie progress and fog reveal", () => {
    let state = applyCommand(undefined, {
      type: "createGame",
      players: players(),
      seed: "debug-system-menu",
      fogEnabled: true,
      debugMode: true
    });
    expect(Object.values(state.board.tiles).some((tile) => !tile.revealed)).toBe(true);

    state = applyCommand(state, { type: "debugAdvanceZombieTrack" });
    expect(state.zombieTrack).toBe(1);

    state = applyCommand(state, { type: "debugRevealAllFog" });
    expect(Object.values(state.board.tiles).every((tile) => tile.revealed)).toBe(true);
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

  it("skips to the next player when the active turn times out", () => {
    const state = actionGame();
    const next = applyCommand(state, {
      type: "timeoutTurn",
      expectedPlayerId: state.currentPlayerId,
      expectedTurn: state.turn
    });

    expect(next.currentPlayerId).toBe("p2");
    expect(next.phase).toBe("prepare");
    expect(next.turn).toBe(state.turn + 1);
    expect(next.log.some((entry) => entry.message.includes("准备阶段"))).toBe(false);
    expect(next.log.some((entry) => entry.message.includes("操作超时"))).toBe(true);
  });

  it("skips a player who times out before rolling dice", () => {
    const state = setupGame();
    const next = applyCommand(state, {
      type: "timeoutTurn",
      expectedPlayerId: state.currentPlayerId,
      expectedTurn: state.turn
    });

    expect(next.currentPlayerId).toBe("p2");
    expect(next.phase).toBe("prepare");
    expect(next.turn).toBe(state.turn + 1);
  });

  it("declines a pending player trade when the responder times out", () => {
    let state = actionGame();
    state = applyCommand(state, {
      type: "playerTrade",
      targetPlayerId: "p2",
      offer: { food: 1 },
      request: { wood: 1 }
    });
    const next = applyCommand(state, {
      type: "timeoutTurn",
      expectedPlayerId: "p2",
      expectedTurn: state.turn
    });

    expect(next.currentPlayerId).toBe("p1");
    expect(next.phase).toBe("action");
    expect(next.pending).toBeUndefined();
    expect(next.log.some((entry) => entry.message.includes("拒绝了"))).toBe(true);
  });

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

  it("builds transport lines with wood and metal", () => {
    let state = actionGame();
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: state.currentPlayerId,
      resources: createResources({ wood: 1, metal: 1 })
    });
    const edge = legalBuildEdges(state, "transport")[0];
    expect(edge).toBeTruthy();

    state = applyCommand(state, { type: "buildRoute", edgeId: edge, routeType: "transport" });

    expect(state.board.edges[edge].route?.type).toBe("transport");
    expect(state.players[0].resources).toMatchObject({ wood: 0, metal: 0, fuel: 0 });
    expect(state.log[0].message).toBe(`${state.players[0].name} 修建运输线。`);
  });

  it("combines consecutive convoy builds into one counted event log entry", () => {
    let state = actionGame();
    Object.values(state.board.tiles).forEach((tile) => {
      tile.revealed = true;
    });
    const firstEdgeId = legalBuildEdges(state, "convoy")[0];
    expect(firstEdgeId).toBeTruthy();
    state = applyCommand(state, { type: "buildRoute", edgeId: firstEdgeId, routeType: "convoy", free: true });
    const secondEdgeId = legalBuildEdges(state, "convoy")[0];
    expect(secondEdgeId).toBeTruthy();
    state = applyCommand(state, { type: "buildRoute", edgeId: secondEdgeId, routeType: "convoy", free: true });

    expect(state.log[0].message).toBe(`${state.players[0].name} 建立2支装甲车队。`);
  });

  it("allows recruiting and activating militia before trading", () => {
    let state = actionGame();
    const vertex = legalRecruitVertices(state)[0];
    expect(vertex).toBeTruthy();

    state = applyCommand(state, { type: "recruitMilitia", vertexId: vertex });
    const militiaId = state.players[0].militia[0].id;
    state = applyCommand(state, { type: "activateMilitia", militiaId });
    state = applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" });

    expect(state.players[0].militia[0].status).toBe("active");
    expect(state.players[0].militia[0].activatedTurn).toBe(state.turn);
  });

  it("prevents militia activated this turn from immediately expelling zombies", () => {
    let state = actionGame();
    const vertexId = legalRecruitVertices(state)[0];
    expect(vertexId).toBeTruthy();

    state = applyCommand(state, { type: "recruitMilitia", vertexId });
    const militiaId = state.players[0].militia[0].id;
    state = applyCommand(state, { type: "activateMilitia", militiaId });

    const zombieTileId = state.board.vertices[vertexId].tileIds.find((tileId) => state.board.tiles[tileId].revealed);
    const targetTileId = Object.values(state.board.tiles).find((tile) => tile.revealed && tile.id !== zombieTileId)?.id;
    expect(zombieTileId).toBeTruthy();
    expect(targetTileId).toBeTruthy();
    state.zombieTileId = zombieTileId!;

    expect(legalExpelZombieMilitiaIds(state)).not.toContain(militiaId);
    expect(() => applyCommand(state, { type: "expelZombie", militiaId, toTileId: targetTileId! })).toThrow(
      "本回合刚激活的民兵不能立刻执行主动行动。"
    );
  });

  it("allows buying a development card before trading", () => {
    let state = actionGame();

    state = applyCommand(state, { type: "buyDevelopmentCard" });
    state = applyCommand(state, { type: "bankTrade", give: "food", receive: "wood" });

    expect(state.players[0].devCards).toHaveLength(1);
  });

  it("lets militia mobilization recruit two militia", () => {
    let state = actionGame();
    const vertexId = legalRecruitVertices(state)[0];
    expect(vertexId).toBeTruthy();
    state.players[0].devCards.push({ id: "militia-card", type: "militiaMobilization", purchasedTurn: 0 });
    const piecesBefore = state.players[0].pieces.militia;

    state = applyCommand(state, {
      type: "playDevelopmentCard",
      cardId: "militia-card",
      payload: { vertexIds: [vertexId, vertexId] }
    });

    expect(state.players[0].militia.filter((militia) => militia.vertexId === vertexId)).toHaveLength(2);
    expect(state.players[0].pieces.militia).toBe(piecesBefore - 2);
    expect(state.players[0].devCards.some((card) => card.id === "militia-card")).toBe(false);
    expect(state.log.some((entry) => entry.message === `${state.players[0].name} 使用【民兵动员】。`)).toBe(true);
    expect(state.log.some((entry) => entry.message === `${state.players[0].name} 征召2名民兵。`)).toBe(true);
  });

  it("combines consecutive militia actions into counted event log entries", () => {
    let state = actionGame();
    const vertexId = legalRecruitVertices(state)[0];
    expect(vertexId).toBeTruthy();

    state = applyCommand(state, { type: "recruitMilitia", vertexId });
    state = applyCommand(state, { type: "recruitMilitia", vertexId });
    expect(state.log[0].message).toBe(`${state.players[0].name} 征召2名民兵。`);

    const [first, second] = state.players[0].militia.slice(-2);
    state = applyCommand(state, { type: "activateMilitia", militiaId: first.id });
    state = applyCommand(state, { type: "activateMilitia", militiaId: second.id });
    expect(state.log[0].message).toBe(`${state.players[0].name} 激活2名民兵。`);
  });

  it("writes selected resource gains and tile names clearly in the event log", () => {
    let state = actionGame();
    state.pending = {
      kind: "chooseResource",
      playerId: state.currentPlayerId,
      amount: 3,
      reason: "airdrop"
    };
    state = applyCommand(state, { type: "chooseResource", resources: { food: 1, wood: 1, metal: 1 } });
    expect(state.log[0].message).toBe(`${state.players[0].name} 获得：食物×1 木材×1 金属×1。`);

    const targetTile = Object.values(state.board.tiles).find((tile) => tile.revealed && tile.id !== state.zombieTileId)!;
    state.phase = "zombie";
    state.pending = { kind: "moveZombie", playerId: state.currentPlayerId, stealAfterMove: false };
    state = applyCommand(state, { type: "moveZombie", tileId: targetTile.id });
    expect(state.log[0].message).toContain(`${targetTile.id}（${TILE_LABELS[targetTile.hiddenType]}）`);
  });

  it("lets road crew build its second route from the first queued route", () => {
    let state = actionGame();
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

    state.players[0].devCards.push({ id: "road-crew-card", type: "roadCrew", purchasedTurn: 0 });
    state = applyCommand(state, {
      type: "playDevelopmentCard",
      cardId: "road-crew-card",
      payload: {
        routes: [
          { edgeId: firstEdgeId, routeType: "transport" },
          { edgeId: secondEdgeId, routeType: "transport" }
        ]
      }
    });

    expect(state.board.edges[firstEdgeId!].route).toMatchObject({ ownerId: state.currentPlayerId, type: "transport" });
    expect(state.board.edges[secondEdgeId!].route).toMatchObject({ ownerId: state.currentPlayerId, type: "transport" });
    expect(state.log.some((entry) => entry.message === `${state.players[0].name} 修建2条运输线。`)).toBe(true);
  });

  it("awards one victory point when a player first camps in a new resource zone", () => {
    let state = actionGame();
    const playerId = state.currentPlayerId;
    const spot = findSmallResourceCampSpot(state);
    const scoreBefore = calculateScore(state, playerId).total;
    state.board.edges[spot.routeEdgeId].route = { ownerId: playerId, type: "transport" };

    state = applyCommand(state, { type: "buildCamp", vertexId: spot.vertexId, free: true });
    const score = calculateScore(state, playerId);

    spot.zoneIds.forEach((zoneId) => {
      expect(state.awards.newResourceZones?.[playerId]).toContain(zoneId);
    });
    expect(score.newResourceZones).toBe(spot.zoneIds.length);
    expect(score.total).toBe(scoreBefore + 1 + spot.zoneIds.length);
  });

  it("does not award the same new resource zone to the same player twice", () => {
    let state = actionGame();
    const playerId = state.currentPlayerId;
    const spot = findSmallResourceCampSpot(state);
    state.awards.newResourceZones = { [playerId]: spot.zoneIds };
    const scoreBefore = calculateScore(state, playerId).total;
    state.board.edges[spot.routeEdgeId].route = { ownerId: playerId, type: "transport" };

    state = applyCommand(state, { type: "buildCamp", vertexId: spot.vertexId, free: true });
    const score = calculateScore(state, playerId);

    expect(state.awards.newResourceZones?.[playerId]).toEqual(spot.zoneIds);
    expect(score.newResourceZones).toBe(spot.zoneIds.length);
    expect(score.total).toBe(scoreBefore + 1);
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

  it("requires requisition to specify the resource type", () => {
    const state = actionGame();
    state.players[0].devCards.push({ id: "req-card", type: "requisition", purchasedTurn: 0 });

    expect(() => applyCommand(state, { type: "playDevelopmentCard", cardId: "req-card" })).toThrow(
      "征用物资必须指定资源。"
    );
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
    p1.defenderTokens = VICTORY_POINTS_TO_WIN - 3;
    p1.devCards.push({ id: "hidden-secret", type: "secretBase", purchasedTurn: 0 });
    state.phase = "action";

    expect(calculateScore(state, p1.id).total).toBe(VICTORY_POINTS_TO_WIN - 1);
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

  it("counts militia activated this turn for siege defense", () => {
    let state = setupGame();
    const p1Fortress = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p1")!;
    const p2Fortress = Object.values(state.board.vertices).find((vertex) => vertex.building?.ownerId === "p2")!;
    p1Fortress.building!.type = "fortress";
    p2Fortress.building!.type = "fortress";
    state.players[0].resources = createResources({ food: 2 });
    state.players[0].militia.push(
      { id: "p1-new-active-1", ownerId: "p1", vertexId: p1Fortress.id, status: "inactive" },
      { id: "p1-new-active-2", ownerId: "p1", vertexId: p1Fortress.id, status: "inactive" }
    );
    state.players[0].devCards.push({ id: "zombie-card", type: "zombieApproaches", purchasedTurn: 0 });
    state.zombieTrack = 5;
    state.phase = "action";

    state = applyCommand(state, { type: "activateMilitia", militiaId: "p1-new-active-1" });
    state = applyCommand(state, { type: "activateMilitia", militiaId: "p1-new-active-2" });
    state = applyCommand(state, { type: "playDevelopmentCard", cardId: "zombie-card" });

    expect(state.players[0].defenderTokens).toBe(1);
    expect(state.pending?.kind).toBe("chooseResource");
    expect(state.zombieTrack).toBe(0);
    expect(state.players[0].militia.every((militia) => militia.status === "inactive")).toBe(true);
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
