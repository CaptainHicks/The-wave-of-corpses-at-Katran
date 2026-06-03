import { NUMBER_POOL, RESOURCES, TILE_RESOURCE } from "./constants";
import { randomInt, shuffle } from "./rng";
import type {
  BlackMarket,
  BoardState,
  EdgeState,
  Resources,
  RngState,
  RouteType,
  TileState,
  TileType,
  VertexState
} from "./types";

const ROW_LENGTHS = [9, 10, 11, 12, 11, 10, 9];
const Q_STARTS = [-4, -5, -6, -7, -7, -7, -7];
const HEX_SIZE = 44;

type BoardCluster = TileState["cluster"];
type BoardRoleSymbol = "L" | "S" | "O";
type RevealMode = "large-buffer" | "central-band";

interface BoardStructure {
  id: string;
  reveal: RevealMode;
  rows: readonly string[];
}

interface BoardCell {
  row: number;
  col: number;
  role: Exclude<BoardCluster, "empty">;
}

interface CreateStandardBoardOptions {
  avoidStructureSignature?: string;
}

const BOARD_STRUCTURES: readonly BoardStructure[] = [
  {
    id: "central-large",
    reveal: "large-buffer",
    rows: [
      "SSOSSOOSS",
      "OOOOOOOOOO",
      "OLLLLLLLLLO",
      "OLLLLLLLLLLO",
      "OLLLLLLLLLO",
      "OOOOOOOOOO",
      "SSOOSSOSS"
    ]
  },
  {
    id: "left-large",
    reveal: "large-buffer",
    rows: [
      "LLLOOSSSS",
      "LLLLOOSSSS",
      "LLLLLOOSSSS",
      "LLLLLLOOSSSS",
      "LLLLLOOSSSS",
      "LLLLOOSSSS",
      "LLLOOSSSS"
    ]
  },
  {
    id: "right-large",
    reveal: "large-buffer",
    rows: [
      "SSSSOOLLL",
      "SSSSOOLLLL",
      "SSSSOOLLLLL",
      "SSSSOOLLLLLL",
      "SSSSOOLLLLL",
      "SSSSOOLLLL",
      "SSSSOOLLL"
    ]
  },
  {
    id: "dual-large",
    reveal: "large-buffer",
    rows: [
      "LLOOSOOLL",
      "LLOOSSOOLL",
      "LLOOSSSOOLL",
      "LLOOSSSSOOLL",
      "LLOOSSSOOLL",
      "LLOOSSOOLL",
      "OOOSSSOOO"
    ]
  },
  {
    id: "left-start-split-right-a",
    reveal: "large-buffer",
    rows: [
      "LLOOSSSSS",
      "LLOOSSSSSS",
      "LLOOSSOSOSS",
      "LLLOOOOOOOOO",
      "LLOOSSOSOSS",
      "LLOOSSSSSS",
      "LLOOSSSSS"
    ]
  },
  {
    id: "left-start-split-right-b",
    reveal: "large-buffer",
    rows: [
      "LLOOSSSSS",
      "LLOOSSSSSS",
      "LLOOSSOSOSS",
      "LLLOOOOOOOOO",
      "LLOOSSOSOSS",
      "LLOOSSSSSS",
      "LLOOSSSSS"
    ]
  },
  {
    id: "small-islands",
    reveal: "central-band",
    rows: [
      "SSOOSSOOO",
      "OOSSSOOSSO",
      "SSOOSSSOOSO",
      "SSSOOSSSOOSS",
      "SSOOSSSOOSO",
      "OOSSSOOSSO",
      "OOOSSOOSS"
    ]
  }
] as const;

const ROLE_SYMBOL_TO_CLUSTER: Record<BoardRoleSymbol, BoardCluster> = {
  L: "large",
  S: "small",
  O: "empty"
};

const WAREHOUSE_NUMBERS = [3, 4, 10, 11];
const HIGH_NUMBERS = [6, 8, 6, 8, 6, 8];
const WAREHOUSE_COUNT = 4;
const INFECTED_COUNT = 4;
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
const MIN_NORMAL_RESOURCE_TILE_COUNT = 30;
const MIN_RESOURCE_ZONE_TILE_COUNT = MIN_NORMAL_RESOURCE_TILE_COUNT + WAREHOUSE_COUNT + INFECTED_COUNT;
const EXTRA_NUMBER_SEQUENCE = [5, 9, 4, 10, 3, 11, 2, 12];
const STRUCTURE_BUILD_ATTEMPTS = 700;

function repeatTile(type: TileType, count: number): TileType[] {
  return Array.from({ length: count }, () => type);
}

function roundCoord(value: number): number {
  return Math.round(value * 1000);
}

function vertexId(x: number, y: number): string {
  return `v:${roundCoord(x)}:${roundCoord(y)}`;
}

function edgeId(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function tileCenter(q: number, r: number): { x: number; y: number } {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: HEX_SIZE * 1.5 * r
  };
}

function tileCorners(x: number, y: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    return {
      x: x + HEX_SIZE * Math.cos(angle),
      y: y + HEX_SIZE * Math.sin(angle)
    };
  });
}

function tileId(row: number, col: number): string {
  return `t-${row}-${col}`;
}

export function isResourceTile(tile: TileState): boolean {
  return tile.hiddenType === "warehouse" || TILE_RESOURCE[tile.hiddenType] !== undefined;
}

export function isProductiveTile(tile: TileState): boolean {
  return tile.revealed && isResourceTile(tile) && tile.hiddenType !== "infected" && tile.hiddenType !== "empty";
}

export function tileResource(tile: TileState): keyof Resources | undefined {
  if (tile.hiddenType === "warehouse") return undefined;
  return TILE_RESOURCE[tile.hiddenType];
}

export function createStandardBoard(
  seed = `board-${Date.now()}-${Math.random()}`,
  options: CreateStandardBoardOptions = {}
): BoardState {
  let rng: RngState = { seed: `board:${seed}`, counter: 1 };
  const selectableStructures = BOARD_STRUCTURES.filter(
    (structure) =>
      BOARD_STRUCTURES.length === 1 || structureSignature(structure) !== options.avoidStructureSignature
  );
  const [structureIndex, structureRng] = randomInt(rng, selectableStructures.length);
  rng = structureRng;
  const structures = [
    ...selectableStructures.slice(structureIndex),
    ...selectableStructures.slice(0, structureIndex)
  ];

  for (const structure of structures) {
    const roles = parseStructureRows(structure);

    for (let attempt = 0; attempt < STRUCTURE_BUILD_ATTEMPTS; attempt += 1) {
      const result = buildTileTypes(roles, structure, rng);
      if (!result) continue;
      const [tileTypes, nextRng] = result;
      rng = nextRng;

      try {
        const board = buildBoardFromTileTypes(roles, structure, tileTypes);
        rng = assignNumbers(board, rng);
        rng = assignBlackMarkets(board, rng);
        if (validateStandardBoard(board).length === 0) return board;
      } catch {
        // Try another resource/number distribution for the same structure.
      }
    }
  }

  throw new Error("Unable to generate a valid random wasteland map.");
}

function structureSignature(structure: BoardStructure): string {
  return structure.rows.join("|");
}

function parseStructureRows(structure: BoardStructure): BoardCluster[][] {
  const roles = structure.rows.map((row, rowIndex) => {
    if (row.length !== ROW_LENGTHS[rowIndex]) {
      throw new Error(`Board structure ${structure.id} row ${rowIndex + 1} must have ${ROW_LENGTHS[rowIndex]} cells.`);
    }

    return [...row].map((symbol) => {
      const role = ROLE_SYMBOL_TO_CLUSTER[symbol as BoardRoleSymbol];
      if (!role) throw new Error(`Board structure ${structure.id} contains unknown cell role ${symbol}.`);
      return role;
    });
  });

  const resourceCellCount = roles.flat().filter((role) => role !== "empty").length;
  if (resourceCellCount < MIN_RESOURCE_ZONE_TILE_COUNT) {
    throw new Error(`Board structure ${structure.id} must have at least ${MIN_RESOURCE_ZONE_TILE_COUNT} resource cells.`);
  }

  return roles;
}

function buildTileTypes(
  roles: BoardCluster[][],
  structure: BoardStructure,
  rng: RngState
): [TileType[][], RngState] | undefined {
  let nextRng = rng;
  const cells = resourceCells(roles);
  const smallCells = cells.filter((cell) => cell.role === "small");

  const [smallWarehouseCandidates, smallRng] = shuffle(smallCells, nextRng);
  const smallWarehouseCells = pickNonAdjacentCells(smallWarehouseCandidates, WAREHOUSE_COUNT);
  nextRng = smallRng;
  const warehouseCells = smallWarehouseCells;
  if (warehouseCells.length !== WAREHOUSE_COUNT) return undefined;

  const warehouseKeys = new Set(warehouseCells.map(cellKey));
  const infectedCandidates = cells.filter(
    (cell) => !warehouseKeys.has(cellKey(cell)) && warehouseCells.every((warehouse) => !cellsAreAdjacent(cell, warehouse))
  );
  const revealedInfectedCandidates = infectedCandidates.filter((cell) => cellIsRevealed(roles, structure, cell.row, cell.col));
  if (revealedInfectedCandidates.length === 0) return undefined;

  const [revealedInfectedCells, revealedRng] = shuffle(revealedInfectedCandidates, nextRng);
  nextRng = revealedRng;
  const infectedCells: BoardCell[] = [revealedInfectedCells[0]];
  const infectedKeys = new Set(infectedCells.map(cellKey));
  const [remainingInfectedCandidates, infectedRng] = shuffle(
    infectedCandidates.filter((cell) => !infectedKeys.has(cellKey(cell))),
    nextRng
  );
  nextRng = infectedRng;
  infectedCells.push(...remainingInfectedCandidates.slice(0, INFECTED_COUNT - 1));
  if (infectedCells.length !== INFECTED_COUNT) return undefined;
  infectedCells.forEach((cell) => infectedKeys.add(cellKey(cell)));

  const normalCells = cells.filter((cell) => !warehouseKeys.has(cellKey(cell)) && !infectedKeys.has(cellKey(cell)));
  const normalAssignments = assignNormalResourceTypes(roles, normalCells, nextRng);
  if (!normalAssignments) return undefined;
  const [normalTypesByCell, normalTypeRng] = normalAssignments;
  nextRng = normalTypeRng;

  const tileTypes = roles.map((row) => row.map(() => "empty" as TileType));
  warehouseCells.forEach((cell) => {
    tileTypes[cell.row][cell.col] = "warehouse";
  });
  infectedCells.forEach((cell) => {
    tileTypes[cell.row][cell.col] = "infected";
  });
  normalCells.forEach((cell) => {
    const type = normalTypesByCell.get(cellKey(cell));
    if (type) tileTypes[cell.row][cell.col] = type;
  });

  return [tileTypes, nextRng];
}

function assignNormalResourceTypes(
  roles: BoardCluster[][],
  normalCells: BoardCell[],
  rng: RngState
): [Map<string, TileType>, RngState] | undefined {
  let nextRng = rng;
  const initialComponents = initialResourceCellComponents(roles);
  const normalCellKeys = new Set(normalCells.map(cellKey));

  for (let attempt = 0; attempt < 400; attempt += 1) {
    let attemptRng = nextRng;
    const targetCounts = normalResourceTargetCounts(normalCells.length);
    const assignments = new Map<string, TileType>();
    let valid = true;

    for (const component of initialComponents) {
      const componentNormalCells = component.filter((cell) => normalCellKeys.has(cellKey(cell)));
      if (componentNormalCells.length < NORMAL_RESOURCE_TYPES.length * 2) {
        valid = false;
        break;
      }

      let shuffledCells: BoardCell[];
      [shuffledCells, attemptRng] = shuffle(componentNormalCells, attemptRng);
      let shuffledInitialTypes: TileType[];
      [shuffledInitialTypes, attemptRng] = shuffle(NORMAL_RESOURCE_TYPES, attemptRng);

      for (const type of shuffledInitialTypes) {
        if (targetCounts[type] < 2) {
          valid = false;
          break;
        }

        for (let index = 0; index < 2; index += 1) {
          const candidateIndex = shuffledCells.findIndex((cell) =>
            !assignments.has(cellKey(cell)) && canAssignNormalResource(normalCells, assignments, cell, type)
          );
          if (candidateIndex < 0) {
            valid = false;
            break;
          }

          const [cell] = shuffledCells.splice(candidateIndex, 1);
          assignments.set(cellKey(cell), type);
          targetCounts[type] -= 1;
        }

        if (!valid) break;
      }

      if (!valid) break;
    }

    if (!valid) {
      nextRng = attemptRng;
      continue;
    }

    const remainingCells = normalCells.filter((cell) => !assignments.has(cellKey(cell)));
    const remainingTypes = normalResourcePoolFromCounts(targetCounts);
    if (remainingCells.length !== remainingTypes.length) {
      nextRng = attemptRng;
      continue;
    }

    let shuffledRemainingCells: BoardCell[];
    [shuffledRemainingCells, attemptRng] = shuffle(remainingCells, attemptRng);
    let shuffledRemainingTypes: TileType[];
    [shuffledRemainingTypes, attemptRng] = shuffle(remainingTypes, attemptRng);

    for (const type of shuffledRemainingTypes) {
      const candidateIndex = shuffledRemainingCells.findIndex((cell) =>
        canAssignNormalResource(normalCells, assignments, cell, type)
      );
      if (candidateIndex < 0) {
        valid = false;
        break;
      }

      const [cell] = shuffledRemainingCells.splice(candidateIndex, 1);
      assignments.set(cellKey(cell), type);
    }

    if (valid && normalResourceAssignmentValid(normalCells, assignments)) {
      return [assignments, attemptRng];
    }

    nextRng = attemptRng;
  }

  return undefined;
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

function normalResourcePoolFromCounts(counts: Record<TileType, number>): TileType[] {
  return NORMAL_RESOURCE_TYPES.flatMap((type) => repeatTile(type, counts[type]));
}

function initialResourceCellComponents(roles: BoardCluster[][]): BoardCell[][] {
  const largeCells = resourceCells(roles).filter((cell) => cell.role === "large");
  if (largeCells.length === 0) return [];
  return cellComponents(largeCells);
}

function cellComponents(cells: BoardCell[]): BoardCell[][] {
  const cellsByKey = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const remaining = new Set(cellsByKey.keys());
  const components: BoardCell[][] = [];

  while (remaining.size > 0) {
    const startKey = [...remaining][0];
    const component: BoardCell[] = [];
    const stack = [startKey];
    remaining.delete(startKey);

    while (stack.length > 0) {
      const key = stack.pop()!;
      const cell = cellsByKey.get(key);
      if (!cell) continue;
      component.push(cell);

      cells.forEach((candidate) => {
        const candidateKey = cellKey(candidate);
        if (!remaining.has(candidateKey) || !cellsAreAdjacent(cell, candidate)) return;
        remaining.delete(candidateKey);
        stack.push(candidateKey);
      });
    }

    components.push(component);
  }

  return components;
}

function normalResourceAssignmentValid(normalCells: BoardCell[], assignments: Map<string, TileType>): boolean {
  const cellsByKey = new Map(normalCells.map((cell) => [cellKey(cell), cell]));
  const remaining = new Set(cellsByKey.keys());

  while (remaining.size > 0) {
    const startKey = [...remaining][0];
    const type = assignments.get(startKey);
    const stack = [startKey];
    const component: string[] = [];
    remaining.delete(startKey);

    while (stack.length > 0) {
      const key = stack.pop()!;
      const cell = cellsByKey.get(key);
      if (!cell) continue;
      component.push(key);

      normalCells.forEach((candidate) => {
        const candidateKey = cellKey(candidate);
        if (
          !remaining.has(candidateKey) ||
          assignments.get(candidateKey) !== type ||
          !cellsAreAdjacent(cell, candidate)
        ) {
          return;
        }
        remaining.delete(candidateKey);
        stack.push(candidateKey);
      });
    }

    if (component.length > 2) return false;
  }

  return true;
}

function canAssignNormalResource(
  normalCells: BoardCell[],
  assignments: Map<string, TileType>,
  cell: BoardCell,
  type: TileType
): boolean {
  const key = cellKey(cell);
  if (assignments.has(key)) return false;
  assignments.set(key, type);
  const size = normalResourceComponentSize(normalCells, assignments, cell, type);
  assignments.delete(key);
  return size <= 2;
}

function normalResourceComponentSize(
  normalCells: BoardCell[],
  assignments: Map<string, TileType>,
  start: BoardCell,
  type: TileType
): number {
  const cellsByKey = new Map(normalCells.map((cell) => [cellKey(cell), cell]));
  const visited = new Set<string>();
  const stack = [cellKey(start)];

  while (stack.length > 0) {
    const key = stack.pop()!;
    if (visited.has(key) || assignments.get(key) !== type) continue;
    visited.add(key);
    const cell = cellsByKey.get(key);
    if (!cell) continue;

    normalCells.forEach((candidate) => {
      const candidateKey = cellKey(candidate);
      if (visited.has(candidateKey) || assignments.get(candidateKey) !== type || !cellsAreAdjacent(cell, candidate)) {
        return;
      }
      stack.push(candidateKey);
    });
  }

  return visited.size;
}

function resourceCells(roles: BoardCluster[][]): BoardCell[] {
  return roles.flatMap((row, rowIndex) =>
    row.flatMap((role, colIndex) => (role === "empty" ? [] : [{ row: rowIndex, col: colIndex, role }]))
  );
}

function pickNonAdjacentCells(candidates: BoardCell[], count: number): BoardCell[] {
  const chosen: BoardCell[] = [];
  candidates.forEach((candidate) => {
    if (chosen.length >= count) return;
    if (chosen.every((cell) => !cellsAreAdjacent(cell, candidate))) chosen.push(candidate);
  });
  return chosen;
}

function cellKey(cell: Pick<BoardCell, "row" | "col">): string {
  return `${cell.row}:${cell.col}`;
}

function cellsAreAdjacent(a: Pick<BoardCell, "row" | "col">, b: Pick<BoardCell, "row" | "col">): boolean {
  const aq = Q_STARTS[a.row] + a.col;
  const bq = Q_STARTS[b.row] + b.col;
  const dr = b.row - a.row;
  const dq = bq - aq;
  return (
    (dq === 1 && dr === 0) ||
    (dq === -1 && dr === 0) ||
    (dq === 0 && dr === 1) ||
    (dq === 0 && dr === -1) ||
    (dq === 1 && dr === -1) ||
    (dq === -1 && dr === 1)
  );
}

function cellIsRevealed(roles: BoardCluster[][], structure: BoardStructure, row: number, col: number): boolean {
  if (structure.reveal === "central-band") return row >= 2 && row <= 4;
  if (roles[row][col] === "large") return true;
  return neighboringCells(roles, row, col).some((cell) => roles[cell.row][cell.col] === "large");
}

function neighboringCells(roles: BoardCluster[][], row: number, col: number): Array<{ row: number; col: number }> {
  return roles
    .flatMap((candidateRow, rowIndex) => candidateRow.map((_, colIndex) => ({ row: rowIndex, col: colIndex })))
    .filter((cell) => cell.row !== row || cell.col !== col)
    .filter((cell) => cellsAreAdjacent({ row, col }, cell));
}

function buildBoardFromTileTypes(
  roles: BoardCluster[][],
  structure: BoardStructure,
  tileTypes: TileType[][]
): BoardState {
  const tiles: Record<string, TileState> = {};
  const vertices: Record<string, VertexState> = {};
  const edges: Record<string, EdgeState> = {};
  const rows: string[][] = [];

  ROW_LENGTHS.forEach((length, row) => {
    rows[row] = [];
    for (let col = 0; col < length; col += 1) {
      const q = Q_STARTS[row] + col;
      const r = row;
      const center = tileCenter(q, r);
      const id = tileId(row, col);
      const hiddenType = tileTypes[row][col];
      const role = roles[row][col];
      tiles[id] = {
        id,
        row,
        col,
        q,
        r,
        x: center.x,
        y: center.y,
        type: hiddenType,
        hiddenType,
        revealed: cellIsRevealed(roles, structure, row, col),
        cluster: hiddenType === "empty" ? "empty" : role === "large" ? "large" : "small"
      };
      rows[row].push(id);

      const corners = tileCorners(center.x, center.y);
      const cornerIds = corners.map((corner) => {
        const idForVertex = vertexId(corner.x, corner.y);
        if (!vertices[idForVertex]) {
          vertices[idForVertex] = {
            id: idForVertex,
            x: roundCoord(corner.x) / 1000,
            y: roundCoord(corner.y) / 1000,
            tileIds: [],
            edgeIds: []
          };
        }
        vertices[idForVertex].tileIds.push(id);
        return idForVertex;
      });

      for (let i = 0; i < 6; i += 1) {
        const a = cornerIds[i];
        const b = cornerIds[(i + 1) % 6];
        const idForEdge = edgeId(a, b);
        if (!edges[idForEdge]) {
          edges[idForEdge] = { id: idForEdge, vertexIds: [a, b], tileIds: [] };
        }
        edges[idForEdge].tileIds.push(id);
      }
    }
  });

  Object.values(edges).forEach((edge) => {
    edge.vertexIds.forEach((id) => vertices[id].edgeIds.push(edge.id));
  });

  return { tiles, edges, vertices, rows, structureId: structure.id, structureSignature: structureSignature(structure) };
}

function assignNumbers(board: BoardState, rng: RngState): RngState {
  let nextRng = rng;
  const resourceTiles = Object.values(board.tiles).filter(isResourceTile);
  const [warehouseTiles, warehouseTileRng] = shuffle(
    resourceTiles.filter((tile) => tile.hiddenType === "warehouse").sort((a, b) => a.id.localeCompare(b.id)),
    nextRng
  );
  const [warehouseNumbers, warehouseNumberRng] = shuffle(WAREHOUSE_NUMBERS, warehouseTileRng);
  nextRng = warehouseNumberRng;
  warehouseTiles.forEach((tile, index) => {
    tile.number = warehouseNumbers[index];
  });

  const assignedNumbers = [...warehouseNumbers];
  const normalTiles = resourceTiles
    .filter((tile) => tile.hiddenType !== "warehouse")
    .sort((a, b) => a.id.localeCompare(b.id));

  const [highNumbers, highNumberRng] = shuffle(HIGH_NUMBERS, nextRng);
  nextRng = highNumberRng;
  let highTiles: TileState[] | undefined;
  for (let attempt = 0; attempt < 100 && !highTiles; attempt += 1) {
    const [candidates, candidateRng] = shuffle(normalTiles, nextRng);
    nextRng = candidateRng;
    const chosen: TileState[] = [];
    candidates.forEach((tile) => {
      if (chosen.length >= highNumbers.length) return;
      if (chosen.every((other) => !areTilesAdjacent(board, other.id, tile.id))) chosen.push(tile);
    });
    if (chosen.length === highNumbers.length) highTiles = chosen;
  }

  if (!highTiles) {
    throw new Error("Unable to place all high-probability numbers.");
  }

  highTiles.forEach((tile, index) => {
    tile.number = highNumbers[index];
    assignedNumbers.push(highNumbers[index]);
  });

  const remainingNumbers = [...NUMBER_POOL];
  while (remainingNumbers.length < resourceTiles.length) {
    remainingNumbers.push(EXTRA_NUMBER_SEQUENCE[(remainingNumbers.length - NUMBER_POOL.length) % EXTRA_NUMBER_SEQUENCE.length]);
  }
  assignedNumbers.forEach((number) => {
    const index = remainingNumbers.indexOf(number);
    if (index >= 0) remainingNumbers.splice(index, 1);
  });

  const remainingTiles = resourceTiles
    .filter((tile) => tile.number === undefined)
    .sort((a, b) => a.id.localeCompare(b.id));

  const [shuffledRemainingTiles, remainingTileRng] = shuffle(remainingTiles, nextRng);
  const [shuffledRemainingNumbers, remainingNumberRng] = shuffle(remainingNumbers, remainingTileRng);
  nextRng = remainingNumberRng;
  shuffledRemainingTiles.forEach((tile, index) => {
    tile.number = shuffledRemainingNumbers[index];
  });

  return nextRng;
}

function assignBlackMarkets(board: BoardState, rng: RngState): RngState {
  const candidates = Object.values(board.edges).filter((edge) => {
    if (edge.tileIds.length !== 2) return false;
    const [a, b] = edge.tileIds.map((id) => board.tiles[id]);
    return (isResourceTile(a) && b.hiddenType === "empty") || (isResourceTile(b) && a.hiddenType === "empty");
  });

  const markets: BlackMarket[] = [
    { type: "generic" },
    { type: "specific", resource: "food" },
    { type: "generic" },
    { type: "specific", resource: "wood" },
    { type: "generic" },
    { type: "specific", resource: "metal" },
    { type: "generic" },
    { type: "specific", resource: "fuel" },
    { type: "specific", resource: "ammo" }
  ];

  if (candidates.length < markets.length) {
    throw new Error("Unable to place all black markets on resource-empty edges.");
  }

  const [shuffledCandidates, candidateRng] = shuffle(candidates, rng);
  const selectedCandidates = selectBlackMarketEdges(board, shuffledCandidates, markets.length);
  if (!selectedCandidates) {
    throw new Error("Unable to place all black markets with spacing and spread constraints.");
  }

  const [shuffledMarkets, marketRng] = shuffle(markets, candidateRng);
  shuffledMarkets.forEach((market, index) => {
    selectedCandidates[index].blackMarket = market;
  });

  return marketRng;
}

interface MarketCandidate {
  edge: EdgeState;
  x: number;
  y: number;
  xBand: number;
  yBand: number;
  order: number;
}

interface MarketBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  spanX: number;
  spanY: number;
}

function selectBlackMarketEdges(board: BoardState, candidates: EdgeState[], count: number): EdgeState[] | undefined {
  const rawPoints = candidates.map((edge) => edgeMidpoint(board, edge.id));
  const bounds = marketBounds(rawPoints);
  const marketCandidates = candidates.map((edge, order) => {
    const point = rawPoints[order];
    return {
      edge,
      x: point.x,
      y: point.y,
      xBand: marketBand(point.x, bounds.minX, bounds.maxX),
      yBand: marketBand(point.y, bounds.minY, bounds.maxY),
      order
    };
  });
  const targetXBands = new Set(marketCandidates.map((candidate) => candidate.xBand));
  const targetYBands = new Set(marketCandidates.map((candidate) => candidate.yBand));

  return [undefined, ...marketCandidates]
    .map((initial) =>
      greedyMarketSelection(marketCandidates, count, bounds, targetXBands, targetYBands, initial ? [initial] : [])
    )
    .filter((selection) => selection.length === count)
    .sort(
      (a, b) =>
        scoreMarketSelection(b, bounds, targetXBands, targetYBands) -
        scoreMarketSelection(a, bounds, targetXBands, targetYBands)
    )[0]
    ?.map((candidate) => candidate.edge);
}

function greedyMarketSelection(
  candidates: MarketCandidate[],
  count: number,
  bounds: MarketBounds,
  targetXBands: Set<number>,
  targetYBands: Set<number>,
  initial: MarketCandidate[]
): MarketCandidate[] {
  const selected = [...initial];

  while (selected.length < count) {
    const next = candidates
      .filter((candidate) => !selected.includes(candidate))
      .filter((candidate) => selected.every((placed) => !edgesShareVertex(candidate.edge, placed.edge)))
      .sort(
        (a, b) =>
          scoreMarketCandidate(b, selected, bounds, targetXBands, targetYBands) -
          scoreMarketCandidate(a, selected, bounds, targetXBands, targetYBands)
      )[0];
    if (!next) break;
    selected.push(next);
  }

  return selected;
}

function scoreMarketCandidate(
  candidate: MarketCandidate,
  selected: MarketCandidate[],
  bounds: MarketBounds,
  targetXBands: Set<number>,
  targetYBands: Set<number>
): number {
  const selectedXBands = new Set(selected.map((placed) => placed.xBand));
  const selectedYBands = new Set(selected.map((placed) => placed.yBand));
  const missingX = [...targetXBands].filter((band) => !selectedXBands.has(band)).length;
  const missingY = [...targetYBands].filter((band) => !selectedYBands.has(band)).length;
  const sameXBandCount = selected.filter((placed) => placed.xBand === candidate.xBand).length;
  const sameYBandCount = selected.filter((placed) => placed.yBand === candidate.yBand).length;

  let score = normalizedDistanceToClosest(candidate, selected, bounds) * 1000;
  if (!selectedXBands.has(candidate.xBand)) score += 10000 + missingX * 1000;
  if (!selectedYBands.has(candidate.yBand)) score += 10000 + missingY * 1000;
  score -= (sameXBandCount + sameYBandCount) * 25;
  score -= candidate.order * 0.0001;
  return score;
}

function scoreMarketSelection(
  selection: MarketCandidate[],
  bounds: MarketBounds,
  targetXBands: Set<number>,
  targetYBands: Set<number>
): number {
  const selectedXBands = new Set(selection.map((candidate) => candidate.xBand));
  const selectedYBands = new Set(selection.map((candidate) => candidate.yBand));
  const xValues = selection.map((candidate) => candidate.x);
  const yValues = selection.map((candidate) => candidate.y);
  const xSpread = (Math.max(...xValues) - Math.min(...xValues)) / Math.max(bounds.spanX, 1);
  const ySpread = (Math.max(...yValues) - Math.min(...yValues)) / Math.max(bounds.spanY, 1);
  const bandCoverage =
    [...targetXBands].filter((band) => selectedXBands.has(band)).length +
    [...targetYBands].filter((band) => selectedYBands.has(band)).length;
  const minDistance = Math.min(
    ...selection.flatMap((candidate, index) =>
      selection.slice(index + 1).map((other) => normalizedDistance(candidate, other, bounds))
    )
  );

  return bandCoverage * 100000 + (xSpread + ySpread) * 10000 + minDistance * 1000;
}

function marketBounds(points: Array<{ x: number; y: number }>): MarketBounds {
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  return {
    minX,
    maxX,
    minY,
    maxY,
    spanX: maxX - minX,
    spanY: maxY - minY
  };
}

function marketBand(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(2, Math.floor(((value - min) / span) * 3)));
}

function normalizedDistanceToClosest(
  candidate: MarketCandidate,
  selected: MarketCandidate[],
  bounds: MarketBounds
): number {
  if (selected.length === 0) return 1;
  return Math.min(...selected.map((placed) => normalizedDistance(candidate, placed, bounds)));
}

function normalizedDistance(a: MarketCandidate, b: MarketCandidate, bounds: MarketBounds): number {
  const dx = (a.x - b.x) / Math.max(bounds.spanX, 1);
  const dy = (a.y - b.y) / Math.max(bounds.spanY, 1);
  return Math.hypot(dx, dy);
}

function edgesShareVertex(a: EdgeState, b: EdgeState): boolean {
  return a.vertexIds.some((id) => b.vertexIds.includes(id));
}

function edgeMidpoint(board: BoardState, edgeIdValue: string): { x: number; y: number } {
  const edge = board.edges[edgeIdValue];
  const a = board.vertices[edge.vertexIds[0]];
  const b = board.vertices[edge.vertexIds[1]];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function adjacentTileIds(board: BoardState, tileIdValue: string): string[] {
  const target = board.tiles[tileIdValue];
  if (!target) return [];
  return Object.values(board.tiles)
    .filter((tile) => tile.id !== tileIdValue)
    .filter((tile) => {
      const dq = tile.q - target.q;
      const dr = tile.r - target.r;
      return (
        (dq === 1 && dr === 0) ||
        (dq === -1 && dr === 0) ||
        (dq === 0 && dr === 1) ||
        (dq === 0 && dr === -1) ||
        (dq === 1 && dr === -1) ||
        (dq === -1 && dr === 1)
      );
    })
    .map((tile) => tile.id);
}

export function areTilesAdjacent(board: BoardState, a: string, b: string): boolean {
  return adjacentTileIds(board, a).includes(b);
}

export function edgeTouchesHiddenTile(board: BoardState, edgeIdValue: string): string | undefined {
  const edge = board.edges[edgeIdValue];
  return edge?.tileIds.find((id) => !board.tiles[id].revealed);
}

export function tileIdsAroundRoute(board: BoardState, edgeIdValue: string): string[] {
  const edge = board.edges[edgeIdValue];
  if (!edge) return [];
  const tileIds = new Set<string>();
  edge.tileIds.forEach((id) => tileIds.add(id));
  edge.vertexIds.forEach((vertexIdValue) => {
    board.vertices[vertexIdValue].tileIds.forEach((id) => tileIds.add(id));
  });
  return [...tileIds];
}

export function hiddenTileIdsAroundRoute(board: BoardState, edgeIdValue: string): string[] {
  return tileIdsAroundRoute(board, edgeIdValue).filter((id) => !board.tiles[id].revealed);
}

export function getPlayerVertices(board: BoardState, playerId: string): VertexState[] {
  return Object.values(board.vertices).filter((vertex) => vertex.building?.ownerId === playerId);
}

export function getPlayerEdges(board: BoardState, playerId: string): EdgeState[] {
  return Object.values(board.edges).filter((edge) => edge.route?.ownerId === playerId);
}

export function vertexHasAdjacentBuilding(board: BoardState, vertexIdValue: string): boolean {
  const vertex = board.vertices[vertexIdValue];
  if (!vertex) return false;
  return vertex.edgeIds.some((id) => {
    const edge = board.edges[id];
    return edge.vertexIds.some((otherId) => otherId !== vertex.id && Boolean(board.vertices[otherId].building));
  });
}

export function vertexTouchesResource(board: BoardState, vertexIdValue: string, revealedOnly = true): boolean {
  const vertex = board.vertices[vertexIdValue];
  if (!vertex) return false;
  return vertex.tileIds.some((id) => {
    const tile = board.tiles[id];
    return isResourceTile(tile) && (!revealedOnly || tile.revealed);
  });
}

export function vertexTouchesInitialResourceZone(board: BoardState, vertexIdValue: string): boolean {
  const vertex = board.vertices[vertexIdValue];
  if (!vertex) return false;
  const hasLargeResourceZone = Object.values(board.tiles).some((tile) => isResourceTile(tile) && tile.cluster === "large");
  if (!hasLargeResourceZone) return true;
  return vertex.tileIds.some((id) => {
    const tile = board.tiles[id];
    return isResourceTile(tile) && tile.cluster === "large";
  });
}

export function vertexTouchesWarehouse(board: BoardState, vertexIdValue: string): boolean {
  const vertex = board.vertices[vertexIdValue];
  if (!vertex) return false;
  return vertex.tileIds.some((id) => board.tiles[id].hiddenType === "warehouse");
}

export function vertexTouchesOnlyRevealed(board: BoardState, vertexIdValue: string): boolean {
  const vertex = board.vertices[vertexIdValue];
  if (!vertex) return false;
  return vertex.tileIds.every((id) => board.tiles[id].revealed);
}

export function edgeConnectedToPlayerNetwork(board: BoardState, edgeIdValue: string, playerId: string): boolean {
  const edge = board.edges[edgeIdValue];
  if (!edge || edge.route) return false;
  return edge.vertexIds.some((vertexIdValue) => {
    const vertex = board.vertices[vertexIdValue];
    if (vertex.building?.ownerId === playerId) return true;
    return vertex.edgeIds.some((id) => board.edges[id].route?.ownerId === playerId);
  });
}

export function routeTypeAllowedOnEdge(board: BoardState, edgeIdValue: string, routeType: RouteType): boolean {
  const edge = board.edges[edgeIdValue];
  if (!edge) return false;
  if (routeType === "convoy") return edge.tileIds.length > 0;
  return edge.tileIds.some((id) => isResourceTile(board.tiles[id]));
}

export function isBlackMarketVisible(board: BoardState, edgeIdValue: string): boolean {
  const edge = board.edges[edgeIdValue];
  if (!edge?.blackMarket) return false;
  return edge.tileIds.length > 0 && edge.tileIds.some((id) => board.tiles[id].revealed);
}

export function vertexConnectedToPlayerNetwork(board: BoardState, vertexIdValue: string, playerId: string): boolean {
  const vertex = board.vertices[vertexIdValue];
  if (!vertex) return false;
  return vertex.edgeIds.some((edgeIdValue) => board.edges[edgeIdValue].route?.ownerId === playerId);
}

export function adjacentPlayersToTile(board: BoardState, tileIdValue: string): string[] {
  const playerIds = new Set<string>();
  Object.values(board.vertices).forEach((vertex) => {
    if (vertex.tileIds.includes(tileIdValue) && vertex.building) {
      playerIds.add(vertex.building.ownerId);
    }
  });
  return [...playerIds];
}

export function validateStandardBoard(board: BoardState): string[] {
  const errors: string[] = [];
  const tiles = Object.values(board.tiles);
  if (tiles.length !== 72) errors.push(`Map should have 72 tiles, got ${tiles.length}.`);
  ROW_LENGTHS.forEach((length, row) => {
    if (board.rows[row]?.length !== length) {
      errors.push(`Row ${row + 1} should have ${length} tiles.`);
    }
  });

  const counts = tiles.reduce<Record<TileType, number>>(
    (acc, tile) => {
      acc[tile.hiddenType] += 1;
      return acc;
    },
    {
      farm: 0,
      forest: 0,
      factory: 0,
      city: 0,
      military: 0,
      warehouse: 0,
      infected: 0,
      empty: 0
    }
  );
  const normalResourceTileCount = NORMAL_RESOURCE_TYPES.reduce((total, type) => total + counts[type], 0);
  const expectedNormalCounts = normalResourceTargetCounts(normalResourceTileCount);
  NORMAL_RESOURCE_TYPES.forEach((type) => {
    if (counts[type] !== expectedNormalCounts[type]) {
      errors.push(`${type} count should be ${expectedNormalCounts[type]}, got ${counts[type]}.`);
    }
  });
  if (counts.warehouse !== WAREHOUSE_COUNT) {
    errors.push(`warehouse count should be ${WAREHOUSE_COUNT}, got ${counts.warehouse}.`);
  }
  if (counts.infected !== INFECTED_COUNT) {
    errors.push(`infected count should be ${INFECTED_COUNT}, got ${counts.infected}.`);
  }
  const resourceZoneTileCount = tiles.filter((tile) => tile.cluster !== "empty").length;
  if (counts.empty !== tiles.length - resourceZoneTileCount) {
    errors.push(`empty count should be ${tiles.length - resourceZoneTileCount}, got ${counts.empty}.`);
  }

  tiles.forEach((tile) => {
    if (tile.hiddenType === "warehouse" && (tile.number === 6 || tile.number === 8)) {
      errors.push(`${tile.id} is a warehouse and cannot have ${tile.number}.`);
    }
    if (tile.number === 6 || tile.number === 8) {
      adjacentTileIds(board, tile.id).forEach((adjacentId) => {
        const adjacent = board.tiles[adjacentId];
        if (adjacent.number === 6 || adjacent.number === 8) {
          errors.push(`${tile.id} has a high-probability number adjacent to ${adjacent.id}.`);
        }
      });
    }
    if (tile.hiddenType === "warehouse") {
      adjacentTileIds(board, tile.id).forEach((adjacentId) => {
        const adjacent = board.tiles[adjacentId];
        if (adjacent.hiddenType === "warehouse") {
          errors.push(`${tile.id} is adjacent to another warehouse.`);
        }
        if (adjacent.hiddenType === "infected") {
          errors.push(`${tile.id} is adjacent to an infected tile.`);
        }
      });
    }
  });

  const numberCount = tiles.filter((tile) => tile.number !== undefined).length;
  const expectedNumberCount = tiles.filter(isResourceTile).length;
  if (numberCount !== expectedNumberCount) {
    errors.push(`Map should have ${expectedNumberCount} number tokens, got ${numberCount}.`);
  }
  errors.push(...validateEmptyWastelandSpacing(board));
  errors.push(...validateLandingZoneSeparation(board));
  errors.push(...validateInitialResourceMix(board));
  errors.push(...validateNormalResourceAdjacency(board));
  return [...new Set(errors)];
}

function validateInitialResourceMix(board: BoardState): string[] {
  const largeComponents = resourceClusterComponents(board, "large");
  if (largeComponents.length === 0) return [];

  const errors: string[] = [];
  largeComponents.forEach((component, index) => {
    const countsByType = NORMAL_RESOURCE_TYPES.reduce<Record<TileType, number>>(
      (acc, type) => {
        acc[type] = component.filter((tileIdValue) => board.tiles[tileIdValue].hiddenType === type).length;
        return acc;
      },
      { farm: 0, forest: 0, factory: 0, city: 0, military: 0, warehouse: 0, infected: 0, empty: 0 }
    );

    NORMAL_RESOURCE_TYPES.forEach((type) => {
      if (countsByType[type] < 2) {
        errors.push(`Initial resource zone ${index + 1} should have at least 2 ${type} tiles, got ${countsByType[type]}.`);
      }
    });
  });

  return errors;
}

function validateNormalResourceAdjacency(board: BoardState): string[] {
  const normalTilesById = new Map(
    Object.values(board.tiles)
      .filter((tile) => NORMAL_RESOURCE_TYPES.includes(tile.hiddenType))
      .map((tile) => [tile.id, tile])
  );
  const remaining = new Set(normalTilesById.keys());
  const errors: string[] = [];

  while (remaining.size > 0) {
    const start = [...remaining][0];
    const type = board.tiles[start].hiddenType;
    const component: string[] = [];
    const stack = [start];
    remaining.delete(start);

    while (stack.length > 0) {
      const tileIdValue = stack.pop()!;
      component.push(tileIdValue);
      adjacentTileIds(board, tileIdValue).forEach((adjacentId) => {
        if (!remaining.has(adjacentId) || board.tiles[adjacentId].hiddenType !== type) return;
        remaining.delete(adjacentId);
        stack.push(adjacentId);
      });
    }

    if (component.length > 2) {
      errors.push(`${type} resource cluster should have at most 2 adjacent tiles, got ${component.length}.`);
    }
  }

  return errors;
}

function validateLandingZoneSeparation(board: BoardState): string[] {
  const largeComponents = resourceClusterComponents(board, "large");
  if (largeComponents.length < 2) return [];

  const errors: string[] = [];
  Object.values(board.tiles)
    .filter((tile) => tile.cluster === "large")
    .forEach((tile) => {
      adjacentTileIds(board, tile.id).forEach((adjacentId) => {
        const adjacent = board.tiles[adjacentId];
        if (adjacent.cluster === "small") {
          errors.push("Landing resource zones should not directly connect to initial large resource zones.");
        }
      });
    });

  return errors;
}

function validateEmptyWastelandSpacing(board: BoardState): string[] {
  const maxEmptyDistance = maxDistanceToResourceZone(board);
  return maxEmptyDistance > 2
    ? [`Empty wasteland bands should be at most 2 tiles from a resource zone, got ${maxEmptyDistance}.`]
    : [];
}

function maxDistanceToResourceZone(board: BoardState): number {
  const queue: string[] = [];
  const distances = new Map<string, number>();

  Object.values(board.tiles).forEach((tile) => {
    if (tile.cluster !== "empty") {
      distances.set(tile.id, 0);
      queue.push(tile.id);
    }
  });

  for (let index = 0; index < queue.length; index += 1) {
    const tileIdValue = queue[index];
    const distance = distances.get(tileIdValue) ?? 0;
    adjacentTileIds(board, tileIdValue).forEach((adjacentId) => {
      if (distances.has(adjacentId)) return;
      distances.set(adjacentId, distance + 1);
      queue.push(adjacentId);
    });
  }

  return Math.max(
    0,
    ...Object.values(board.tiles)
      .filter((tile) => tile.cluster === "empty")
      .map((tile) => distances.get(tile.id) ?? 0)
  );
}

function resourceClusterComponents(board: BoardState, cluster: "large" | "small" | "resource"): string[][] {
  const remaining = new Set(
    Object.values(board.tiles)
      .filter((tile) => (cluster === "resource" ? tile.cluster !== "empty" : tile.cluster === cluster))
      .map((tile) => tile.id)
  );
  const components: string[][] = [];

  while (remaining.size > 0) {
    const start = [...remaining][0];
    const component: string[] = [];
    const stack = [start];
    remaining.delete(start);

    while (stack.length > 0) {
      const tileIdValue = stack.pop()!;
      component.push(tileIdValue);
      adjacentTileIds(board, tileIdValue)
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

export function resourceCount(resources: Partial<Resources>): number {
  return RESOURCES.reduce((total, resource) => total + (resources[resource] ?? 0), 0);
}
