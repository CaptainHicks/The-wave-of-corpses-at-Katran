import {
  BASE_HAND_LIMIT,
  COSTS,
  DEV_CARD_COUNTS,
  PIECE_LIMITS,
  RESOURCES,
  TILE_RESOURCE,
  VICTORY_POINTS_TO_WIN,
  WATCHTOWER_HAND_BONUS,
  ZOMBIE_TRACK_LIMIT,
  createResources
} from "./constants";
import {
  adjacentPlayersToTile,
  adjacentTileIds,
  edgeConnectedToPlayerNetwork,
  getPlayerEdges,
  getPlayerVertices,
  hiddenTileIdsAroundRoute,
  isBlackMarketVisible,
  isResourceTile,
  routeTypeAllowedOnEdge,
  tileResource,
  validateStandardBoard,
  vertexConnectedToPlayerNetwork,
  vertexHasAdjacentBuilding,
  vertexTouchesInitialResourceZone,
  vertexTouchesOnlyRevealed,
  vertexTouchesResource,
  vertexTouchesWarehouse
} from "./board";
import { createStandardBoard } from "./board";
import { randomInt, shuffle } from "./rng";
import type {
  BoardState,
  Command,
  DevCard,
  DevCardType,
  GameEvent,
  GameState,
  Militia,
  PendingChoice,
  Phase,
  PlayerState,
  Resource,
  Resources,
  RouteType,
  ScoreBreakdown,
  VertexState
} from "./types";

const MILITIA_MOBILIZATION_AMOUNT = 2;
let lastGameBoardStructureSignature: string | undefined;

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function assertRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}

export function addResources(a: Resources, b: Partial<Resources>): Resources {
  return RESOURCES.reduce<Resources>((next, resource) => {
    next[resource] = a[resource] + (b[resource] ?? 0);
    return next;
  }, createResources());
}

export function subtractResources(a: Resources, b: Partial<Resources>): Resources {
  return RESOURCES.reduce<Resources>((next, resource) => {
    next[resource] = a[resource] - (b[resource] ?? 0);
    return next;
  }, createResources());
}

export function hasResources(a: Resources, b: Partial<Resources>): boolean {
  return RESOURCES.every((resource) => a[resource] >= (b[resource] ?? 0));
}

export function resourceTotal(resources: Partial<Resources>): number {
  return RESOURCES.reduce((total, resource) => total + (resources[resource] ?? 0), 0);
}

function hasNonNegativeResourceAmounts(resources: Partial<Resources>): boolean {
  return RESOURCES.every((resource) => (resources[resource] ?? 0) >= 0);
}

function takeCost(player: PlayerState, cost: Partial<Resources>, free?: boolean): void {
  if (free) return;
  assertRule(hasResources(player.resources, cost), "资源不足。");
  player.resources = subtractResources(player.resources, cost);
}

function gain(player: PlayerState, resources: Partial<Resources>): void {
  player.resources = addResources(player.resources, resources);
}

function spend(player: PlayerState, resources: Partial<Resources>): void {
  assertRule(hasResources(player.resources, resources), "资源不足。");
  player.resources = subtractResources(player.resources, resources);
}

function event(state: GameState, message: string): void {
  const id = `log-${state.turn}-${state.log.length + 1}`;
  state.log.unshift({ id, turn: state.turn, message });
  state.log = state.log.slice(0, 80);
}

function queuePending(state: GameState, choice: PendingChoice): void {
  if (!state.pending) {
    state.pending = choice;
    return;
  }
  let cursor = state.pending;
  while ("next" in cursor && cursor.next) {
    cursor = cursor.next;
  }
  if ("next" in cursor) {
    cursor.next = choice;
  }
}

function currentPlayer(state: GameState): PlayerState {
  const player = state.players.find((item) => item.id === state.currentPlayerId);
  assertRule(player, "当前玩家不存在。");
  return player;
}

function findPlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((item) => item.id === playerId);
  assertRule(player, "玩家不存在。");
  return player;
}

function emptyPlayer(index: number, name: string, color: string, factionId?: string): PlayerState {
  return {
    id: `p${index + 1}`,
    name,
    color,
    factionId,
    resources: createResources(),
    devCards: [],
    militia: [],
    defenderTokens: 0,
    movedConvoyThisTurn: false,
    pieces: { ...PIECE_LIMITS },
    usedDevCardThisTurn: false
  };
}

function buildDevDeck(seed: string): [DevCard[], GameState["rng"]] {
  const cards: DevCard[] = [];
  Object.entries(DEV_CARD_COUNTS).forEach(([type, count]) => {
    for (let i = 0; i < count; i += 1) {
      cards.push({ id: `dev-${type}-${i}`, type: type as DevCardType, purchasedTurn: -1 });
    }
  });
  return shuffle(cards, { seed, counter: 1 });
}

export function createGame(
  players: Array<{ name: string; color: string; factionId?: string }>,
  seed = `wasteland-${Date.now()}`,
  debugMode = false,
  fogEnabled = true
): GameState {
  assertRule(players.length >= 2 && players.length <= 6, "本地热座支持 2 到 6 名玩家。");
  const board = createStandardBoard(seed, { avoidStructureSignature: lastGameBoardStructureSignature });
  lastGameBoardStructureSignature = board.structureSignature;
  if (!fogEnabled) {
    Object.values(board.tiles).forEach((tile) => {
      tile.revealed = true;
    });
  }
  const validationErrors = validateStandardBoard(board);
  assertRule(validationErrors.length === 0, validationErrors.join("\n"));
  const zombieTile = Object.values(board.tiles).find(
    (tile) => tile.hiddenType === "infected" && tile.revealed
  );
  assertRule(zombieTile, "标准地图缺少公开感染区。");

  const [devDeck, rng] = buildDevDeck(seed);
  const playerStates = players.map((player, index) => emptyPlayer(index, player.name, player.color, player.factionId));
  const state: GameState = {
    players: playerStates,
    debugMode,
    fogEnabled,
    currentPlayerId: playerStates[0].id,
    phase: "setup",
    board,
    zombieTrack: 0,
    zombieTileId: zombieTile.id,
    merchant: { tileId: zombieTile.id },
    devDeck,
    pending: undefined,
    log: [],
    rng,
    turn: 1,
    setup: {
      order: playerStates.map((player) => player.id),
      placementIndex: 0,
      round: 1
    },
    awards: {}
  };
  event(state, "废土地图已生成。开始第一轮初始营地放置。");
  return state;
}

function ensureNoPending(state: GameState): void {
  assertRule(!state.pending, "请先处理当前待处理事项。");
}

function isLegacyActionPhase(phase: string): boolean {
  return phase === "trade" || phase === "build" || phase === "militia" || phase === "development";
}

function isActionWindowPhase(phase: string): boolean {
  return phase === "action" || isLegacyActionPhase(phase);
}

function assertActionWindow(state: GameState, message = "请先掷骰，再进行行动。"): void {
  ensureNoPending(state);
  assertRule(isActionWindowPhase(state.phase), message);
  if (state.phase !== "action") state.phase = "action";
}

function nextSetupPlayer(state: GameState): void {
  if (state.setup.round === 1) {
    state.setup.placementIndex += 1;
    if (state.setup.placementIndex >= state.setup.order.length) {
      state.setup.round = 2;
      state.setup.placementIndex = state.setup.order.length - 1;
      event(state, "第一轮放置结束，开始反向第二轮。");
    }
  } else {
    state.setup.placementIndex -= 1;
    if (state.setup.placementIndex < 0) {
      state.phase = "prepare";
      state.currentPlayerId = state.setup.order[0];
      state.pending = undefined;
      state.setup.placementIndex = 0;
      event(state, "初始放置完成，游戏正式开始。");
      startPreparePhase(state);
      return;
    }
  }
  state.currentPlayerId = state.setup.order[state.setup.placementIndex];
}

function setupPlayerId(state: GameState): string {
  return state.setup.order[state.setup.placementIndex];
}

function placeInitialCamp(state: GameState, vertexId: string): void {
  assertRule(state.phase === "setup", "只有初始设置阶段可以放置初始营地。");
  assertRule(!state.pending, "请先为刚放置的营地连接初始运输线。");
  assertRule(state.currentPlayerId === setupPlayerId(state), "还没轮到该玩家放置。");
  const vertex = state.board.vertices[vertexId];
  assertRule(vertex, "交叉点不存在。");
  assertRule(!vertex.building, "该交叉点已有建筑。");
  assertRule(!vertexHasAdjacentBuilding(state.board, vertexId), "营地之间必须至少间隔一个空交叉点。");
  assertRule(vertexTouchesOnlyRevealed(state.board, vertexId), "初始营地不能接触迷雾地块。");
  assertRule(vertexTouchesResource(state.board, vertexId, true), "初始营地必须相邻至少一个公开资源地块。");
  assertRule(vertexTouchesInitialResourceZone(state.board, vertexId), "初始营地只能放在最大资源区。");
  assertRule(!vertexTouchesWarehouse(state.board, vertexId), "初始营地不能直接相邻废弃仓库。");

  const player = currentPlayer(state);
  assertRule(player.pieces.camps > 0, "营地棋子不足。");
  player.pieces.camps -= 1;
  vertex.building = { ownerId: player.id, type: "camp" };
  state.pending = {
    kind: "setupRoute",
    playerId: player.id,
    campVertexId: vertexId,
    secondCamp: state.setup.round === 2
  };
  event(state, `${player.name} 放置初始营地。`);
}

function placeInitialRoute(state: GameState, edgeId: string): void {
  assertRule(state.phase === "setup", "只有初始设置阶段可以放置初始运输线。");
  assertRule(state.pending?.kind === "setupRoute", "当前没有待放置的初始运输线。");
  const edge = state.board.edges[edgeId];
  assertRule(edge, "边不存在。");
  assertRule(!edge.route, "该边已有路线。");
  assertRule(edge.vertexIds.includes(state.pending.campVertexId), "初始运输线必须连接刚放置的营地。");
  assertRule(routeTypeAllowedOnEdge(state.board, edgeId, "transport"), "初始运输线只能放在资源地块边缘。");
  const player = findPlayer(state, state.pending.playerId);
  assertRule(player.pieces.transports > 0, "运输线棋子不足。");
  edge.route = { ownerId: player.id, type: "transport" };
  player.pieces.transports -= 1;
  event(state, `${player.name} 放置初始运输线。`);

  const secondCamp = state.pending.secondCamp;
  const campVertexId = state.pending.campVertexId;
  state.pending = undefined;
  if (secondCamp) {
    grantInitialResources(state, player, campVertexId);
  }
  nextSetupPlayer(state);
}

function grantInitialResources(state: GameState, player: PlayerState, vertexId: string): void {
  const vertex = state.board.vertices[vertexId];
  const warehouseCount = vertex.tileIds.filter((id) => state.board.tiles[id].hiddenType === "warehouse").length;
  vertex.tileIds.forEach((tileId) => {
    const tile = state.board.tiles[tileId];
    const resource = tileResource(tile);
    if (tile.revealed && resource) {
      gain(player, { [resource]: 1 });
      event(state, `${player.name} 从第二个营地获得 1 张${resourceName(resource)}。`);
    }
  });
  if (warehouseCount > 0) {
    state.pending = {
      kind: "chooseResource",
      playerId: player.id,
      amount: warehouseCount,
      reason: "initial-warehouse"
    };
  }
}

function resourceName(resource: Resource): string {
  const names: Record<Resource, string> = {
    food: "食物",
    wood: "木材",
    metal: "金属",
    fuel: "燃料",
    ammo: "弹药"
  };
  return names[resource];
}

function startPreparePhase(state: GameState): void {
  state.phase = "prepare";
  const player = currentPlayer(state);
  player.usedDevCardThisTurn = false;
  player.movedConvoyThisTurn = false;
  player.militia.forEach((militia) => {
    if (militia.status === "readying") militia.status = "active";
  });
  event(state, `${player.name} 的准备阶段：民兵防线已就绪。`);
}

function assertDiceValues(dice: [number, number]): void {
  assertRule(
    dice.length === 2 && dice.every((value) => Number.isInteger(value) && value >= 1 && value <= 6),
    "骰子点数必须是 1 到 6。"
  );
}

function rollDice(state: GameState, forced?: [number, number]): void {
  ensureNoPending(state);
  assertRule(state.phase === "dice" || state.phase === "prepare", "当前阶段不能掷骰。");
  if (state.phase === "prepare") state.phase = "dice";
  let dice = forced;
  if (dice) {
    assertDiceValues(dice);
  }
  if (!dice) {
    const [a, rngA] = randomInt(state.rng, 6);
    const [b, rngB] = randomInt(rngA, 6);
    state.rng = rngB;
    dice = [a + 1, b + 1];
  }
  state.dice = dice;
  const total = dice[0] + dice[1];
  event(state, `${currentPlayer(state).name} 掷出 ${dice[0]} + ${dice[1]} = ${total}。`);
  if (total === 7) {
    startZombieSevenFlow(state);
    return;
  }
  produceResources(state, total);
  state.phase = "action";
}

function produceResources(state: GameState, number: number): void {
  Object.values(state.board.tiles)
    .filter((tile) => tile.revealed && tile.number === number && tile.id !== state.zombieTileId)
    .forEach((tile) => {
      const adjacentVertices = Object.values(state.board.vertices).filter(
        (vertex) => vertex.tileIds.includes(tile.id) && vertex.building
      );
      adjacentVertices.forEach((vertex) => {
        const player = findPlayer(state, vertex.building!.ownerId);
        const amount = vertex.building!.type === "fortress" ? 2 : 1;
        const resource = tileResource(tile);
        if (resource) {
          gain(player, { [resource]: amount });
          event(state, `${player.name} 从 ${tile.id} 获得 ${amount} 张${resourceName(resource)}。`);
        } else if (tile.hiddenType === "warehouse") {
          const nextChoice: PendingChoice = {
            kind: "chooseResource",
            playerId: player.id,
            amount,
            reason: "warehouse-production",
            next: state.pending
          };
          state.pending = nextChoice;
        }
      });
    });
}

function handLimit(state: GameState, player: PlayerState): number {
  const watchtowers = Object.values(state.board.vertices).filter(
    (vertex) => vertex.watchtowerOwnerId === player.id
  ).length;
  return BASE_HAND_LIMIT + watchtowers * WATCHTOWER_HAND_BONUS;
}

function startZombieSevenFlow(state: GameState): void {
  state.phase = "zombie";
  const discards = state.players
    .map((player) => ({ player, amount: Math.floor(resourceTotal(player.resources) / 2) }))
    .filter(({ player }) => resourceTotal(player.resources) > handLimit(state, player));
  let next: PendingChoice | undefined = {
    kind: "moveZombie",
    playerId: state.currentPlayerId,
    stealAfterMove: true
  };
  [...discards].reverse().forEach(({ player, amount }) => {
    next = { kind: "discard", playerId: player.id, amount, next };
  });
  state.pending = next;
  event(state, "掷出 7：进入尸潮阶段。");
  advanceZombieTrack(state, 1);
}

function resolveDiscard(state: GameState, resources: Partial<Resources>): void {
  assertRule(state.pending?.kind === "discard", "当前不需要弃牌。");
  const player = findPlayer(state, state.pending.playerId);
  assertRule(resourceTotal(resources) === state.pending.amount, `必须弃掉 ${state.pending.amount} 张资源。`);
  spend(player, resources);
  event(state, `${player.name} 弃掉 ${state.pending.amount} 张资源。`);
  state.pending = state.pending.next;
}

function moveZombie(state: GameState, tileId: string): void {
  assertRule(state.pending?.kind === "moveZombie", "当前不能移动尸潮。");
  const tile = state.board.tiles[tileId];
  assertRule(tile, "目标地块不存在。");
  assertRule(tile.revealed, "尸潮不能移动到迷雾地块。");
  state.zombieTileId = tileId;
  const player = findPlayer(state, state.pending.playerId);
  event(state, `${player.name} 将尸潮移动到 ${tile.id}。`);
  const targets = adjacentPlayersToTile(state.board, tileId).filter((id) => id !== player.id);
  state.pending =
    state.pending.stealAfterMove && targets.length > 0
      ? { kind: "stealResource", playerId: player.id, targetPlayerIds: targets }
      : undefined;
  if (!state.pending && state.phase === "zombie") state.phase = "action";
}

function stealResource(state: GameState, targetPlayerId?: string): void {
  assertRule(state.pending?.kind === "stealResource", "当前不能抽取资源。");
  const actor = findPlayer(state, state.pending.playerId);
  if (!targetPlayerId) {
    state.pending = undefined;
    if (state.phase === "zombie") state.phase = "action";
    return;
  }
  assertRule(state.pending.targetPlayerIds.includes(targetPlayerId), "该玩家不是合法抽牌目标。");
  const target = findPlayer(state, targetPlayerId);
  const available = RESOURCES.flatMap((resource) => Array.from({ length: target.resources[resource] }, () => resource));
  if (available.length > 0) {
    const [index, nextRng] = randomInt(state.rng, available.length);
    state.rng = nextRng;
    const resource = available[index];
    target.resources[resource] -= 1;
    actor.resources[resource] += 1;
    event(state, `${actor.name} 从 ${target.name} 随机抽取 1 张资源。`);
  }
  state.pending = undefined;
  if (state.phase === "zombie") state.phase = "action";
}

function advanceZombieTrack(state: GameState, amount: number): void {
  state.zombieTrack += amount;
  event(state, `尸潮进度 +${amount}，当前为 ${state.zombieTrack}/${ZOMBIE_TRACK_LIMIT}。`);
  if (state.zombieTrack >= ZOMBIE_TRACK_LIMIT) resolveSiege(state);
}

function resolveSiege(state: GameState): void {
  const fortressCount = Object.values(state.board.vertices).filter(
    (vertex) => vertex.building?.type === "fortress"
  ).length;
  const activeByPlayer = new Map<string, number>();
  state.players.forEach((player) => {
    activeByPlayer.set(
      player.id,
      player.militia.filter((militia) => militia.status === "active").length
    );
  });
  const defense = [...activeByPlayer.values()].reduce((sum, count) => sum + count, 0);
  if (defense >= fortressCount) {
    const max = Math.max(...activeByPlayer.values());
    const leaders = state.players.filter((player) => activeByPlayer.get(player.id) === max && max > 0);
    if (leaders.length === 1) {
      leaders[0].defenderTokens += 1;
      event(state, `尸潮围城防守成功，${leaders[0].name} 获得卡坦保卫者得分牌。`);
    } else if (leaders.length > 1) {
      leaders.forEach((player) => drawDevCard(state, player));
      event(state, "尸潮围城防守成功，最高民兵并列，相关玩家各获得 1 张发展卡。");
    } else {
      event(state, "尸潮围城防守成功。");
    }
  } else {
    const fortressOwners = state.players.filter((player) =>
      Object.values(state.board.vertices).some(
        (vertex) => vertex.building?.ownerId === player.id && vertex.building.type === "fortress"
      )
    );
    const min = Math.min(...fortressOwners.map((player) => activeByPlayer.get(player.id) ?? 0));
    const losers = fortressOwners.filter((player) => (activeByPlayer.get(player.id) ?? 0) === min);
    let next: PendingChoice | undefined = state.pending;
    [...losers].reverse().forEach((player) => {
      const vertexIds = Object.values(state.board.vertices)
        .filter((vertex) => vertex.building?.ownerId === player.id && vertex.building.type === "fortress")
        .map((vertex) => vertex.id);
      next = { kind: "downgradeFortress", playerId: player.id, vertexIds, next };
    });
    state.pending = next;
    event(state, "尸潮围城防守失败，防御最低且拥有堡垒的玩家需要降级 1 座堡垒。");
  }
  state.players.forEach((player) => {
    player.militia.forEach((militia) => {
      militia.status = "inactive";
      militia.activatedTurn = undefined;
    });
  });
  state.zombieTrack = 0;
  updateAwards(state);
}

function resolveDowngrade(state: GameState, vertexId: string): void {
  assertRule(state.pending?.kind === "downgradeFortress", "当前不需要降级堡垒。");
  assertRule(state.pending.vertexIds.includes(vertexId), "请选择自己的 1 座堡垒降级。");
  const vertex = state.board.vertices[vertexId];
  const player = findPlayer(state, state.pending.playerId);
  assertRule(vertex.building?.ownerId === player.id && vertex.building.type === "fortress", "该位置不是你的堡垒。");
  vertex.building.type = "camp";
  if (vertex.watchtowerOwnerId === player.id) {
    vertex.watchtowerOwnerId = undefined;
    player.pieces.watchtowers += 1;
  }
  player.pieces.fortresses += 1;
  player.pieces.camps -= 1;
  event(state, `${player.name} 将 1 座堡垒降级为营地。`);
  state.pending = state.pending.next;
}

function drawDevCard(state: GameState, player: PlayerState): DevCard | undefined {
  const card = state.devDeck.shift();
  if (!card) return undefined;
  player.devCards.push({ ...card, purchasedTurn: state.turn });
  return card;
}

function chooseResource(state: GameState, resources: Partial<Resources>): void {
  assertRule(state.pending?.kind === "chooseResource", "当前不需要选择资源。");
  assertRule(resourceTotal(resources) === state.pending.amount, `必须选择 ${state.pending.amount} 张资源。`);
  const player = findPlayer(state, state.pending.playerId);
  gain(player, resources);
  event(state, `${player.name} 选择获得 ${state.pending.amount} 张资源。`);
  state.pending = state.pending.next;
}

function endPhase(state: GameState): void {
  ensureNoPending(state);
  if (state.phase === "prepare") {
    state.phase = "dice";
    return;
  }
  if (state.phase === "dice") {
    throw new RuleError("请先掷骰，再结束掷骰阶段。");
  }
  assertRule(isActionWindowPhase(state.phase), "当前阶段不能手动推进。");
  state.phase = "action";
}

function endTurn(state: GameState): void {
  assertActionWindow(state);
  checkVictoryOrNext(state);
}

function timeoutTurn(state: GameState, expectedPlayerId?: string, expectedTurn?: number): void {
  if (expectedTurn != null && expectedTurn !== state.turn) return;
  const activePlayerId = state.pending?.playerId ?? state.currentPlayerId;
  if (expectedPlayerId && expectedPlayerId !== activePlayerId) return;
  assertRule(state.phase !== "victory", "游戏已经结束。");

  const player = findPlayer(state, activePlayerId);
  event(state, `${player.name} 操作超时，系统自动托管。`);

  if (state.pending) {
    resolvePendingTimeout(state);
    return;
  }

  if (state.phase === "setup") {
    const vertexId = legalInitialCampVertices(state)[0];
    assertRule(vertexId, "没有可自动放置的初始营地。");
    placeInitialCamp(state, vertexId);
    return;
  }

  checkVictoryOrNext(state);
}

function resolvePendingTimeout(state: GameState): void {
  const pending = state.pending;
  assertRule(pending, "当前没有待处理选择。");

  if (pending.kind === "setupRoute") {
    const edgeId = legalInitialRouteEdges(state)[0];
    assertRule(edgeId, "没有可自动放置的初始运输线。");
    placeInitialRoute(state, edgeId);
    return;
  }

  if (pending.kind === "chooseResource") {
    chooseResource(state, createResources({ food: pending.amount }));
    return;
  }

  if (pending.kind === "discard") {
    const player = findPlayer(state, pending.playerId);
    resolveDiscard(state, takeFirstResources(player.resources, pending.amount));
    return;
  }

  if (pending.kind === "moveZombie") {
    const tileId =
      Object.values(state.board.tiles).find((tile) => tile.revealed && tile.id !== state.zombieTileId)?.id ??
      Object.values(state.board.tiles).find((tile) => tile.revealed)?.id;
    assertRule(tileId, "没有可自动移动尸潮的地块。");
    moveZombie(state, tileId);
    return;
  }

  if (pending.kind === "stealResource") {
    const targetPlayerId =
      pending.targetPlayerIds.find((playerId) => resourceTotal(findPlayer(state, playerId).resources) > 0) ??
      pending.targetPlayerIds[0];
    stealResource(state, targetPlayerId);
    return;
  }

  if (pending.kind === "confirmTrade") {
    confirmPlayerTrade(state, false);
    return;
  }

  if (pending.kind === "downgradeFortress") {
    resolveDowngrade(state, pending.vertexIds[0]);
  }
}

function takeFirstResources(resources: Resources, amount: number): Resources {
  let remaining = amount;
  return RESOURCES.reduce<Resources>((picked, resource) => {
    const count = Math.min(resources[resource], remaining);
    picked[resource] = count;
    remaining -= count;
    return picked;
  }, createResources());
}

function scoreForVictoryCheck(state: GameState, player: PlayerState): ScoreBreakdown {
  let score = calculateScore(state, player.id);
  const hiddenSecretBases = player.devCards.filter(
    (card) => card.type === "secretBase" && !card.revealed
  );
  if (score.total < VICTORY_POINTS_TO_WIN && score.total + hiddenSecretBases.length >= VICTORY_POINTS_TO_WIN) {
    hiddenSecretBases.forEach((card) => {
      card.revealed = true;
    });
    event(state, `${player.name} 公开秘密据点以达成胜利。`);
    score = calculateScore(state, player.id);
  }
  return score;
}

function maybeCurrentPlayerWins(state: GameState): boolean {
  updateAwards(state);
  const player = currentPlayer(state);
  const score = scoreForVictoryCheck(state, player);
  if (score.total >= VICTORY_POINTS_TO_WIN) {
    state.phase = "victory";
    state.winnerId = player.id;
    event(state, `${player.name} 达到 ${score.total} 点胜利点，赢得游戏。`);
    return true;
  }
  return false;
}

function checkVictoryOrNext(state: GameState): void {
  if (maybeCurrentPlayerWins(state)) return;
  const player = currentPlayer(state);
  const index = state.players.findIndex((item) => item.id === player.id);
  const next = state.players[(index + 1) % state.players.length];
  state.currentPlayerId = next.id;
  state.turn += 1;
  state.dice = undefined;
  startPreparePhase(state);
}

function playerTrade(
  state: GameState,
  targetPlayerId: string | undefined,
  offer: Partial<Resources>,
  request: Partial<Resources>
): void {
  assertActionWindow(state, "玩家交易只能在行动阶段进行。");
  const actor = currentPlayer(state);
  const targetIds = targetPlayerId
    ? [findPlayer(state, targetPlayerId).id]
    : state.players.filter((player) => player.id !== actor.id).map((player) => player.id);
  assertRule(!targetIds.includes(actor.id), "不能和自己交易。");
  assertRule(targetIds.length > 0, "没有可交易的其他玩家。");
  assertRule(resourceTotal(offer) > 0 && resourceTotal(request) > 0, "玩家交易双方都必须提供资源。");
  assertRule(hasNonNegativeResourceAmounts(offer) && hasNonNegativeResourceAmounts(request), "交易资源数量不能为负。");
  assertRule(hasResources(actor.resources, offer), "当前玩家资源不足。");
  const firstTarget = findPlayer(state, targetIds[0]);
  state.pending = {
    kind: "confirmTrade",
    playerId: firstTarget.id,
    actorId: actor.id,
    targetPlayerId: firstTarget.id,
    candidateTargetIds: targetIds,
    declinedTargetIds: [],
    offer,
    request
  };
  const targetLabel = targetPlayerId ? firstTarget.name : "所有其他玩家";
  event(state, `${actor.name} 向 ${targetLabel} 提出资源交易，等待确认。`);
}

function confirmPlayerTrade(state: GameState, accept: boolean): void {
  assertRule(state.pending?.kind === "confirmTrade", "当前没有待确认的玩家交易。");
  assertRule(isActionWindowPhase(state.phase), "玩家交易只能在行动阶段进行。");
  const pending = state.pending;
  const actor = findPlayer(state, pending.actorId);
  const target = findPlayer(state, pending.targetPlayerId);
  const offer = pending.offer;
  const request = pending.request;
  if (!accept) {
    const remainingTargetIds = (pending.candidateTargetIds ?? [target.id]).filter((id) => id !== target.id);
    const declinedTargetIds = [...(pending.declinedTargetIds ?? []), target.id];
    if (remainingTargetIds.length > 0) {
      const nextTarget = findPlayer(state, remainingTargetIds[0]);
      state.pending = {
        ...pending,
        playerId: nextTarget.id,
        targetPlayerId: nextTarget.id,
        candidateTargetIds: remainingTargetIds,
        declinedTargetIds
      };
      event(state, `${target.name} 拒绝了 ${actor.name} 的资源交易，等待 ${nextTarget.name} 回应。`);
      return;
    }
    state.pending = undefined;
    event(state, `${target.name} 拒绝了 ${actor.name} 的资源交易，报价结束。`);
    return;
  }
  assertRule(hasResources(actor.resources, offer), "发起交易玩家资源已不足。");
  assertRule(hasResources(target.resources, request), "确认交易玩家资源已不足。");
  actor.resources = subtractResources(actor.resources, offer);
  target.resources = addResources(target.resources, offer);
  target.resources = subtractResources(target.resources, request);
  actor.resources = addResources(actor.resources, request);
  state.pending = undefined;
  event(state, `${actor.name} 与 ${target.name} 完成资源交易。`);
}

function legalTradeRates(state: GameState, player: PlayerState, give: Resource): Array<2 | 3 | 4> {
  const rates: Array<2 | 3 | 4> = [4];
  if (
    Object.values(state.board.edges).some(
      (edge) =>
        edge.blackMarket?.type === "generic" &&
        isBlackMarketVisible(state.board, edge.id) &&
        edge.vertexIds.some((vertexId) => state.board.vertices[vertexId].building?.ownerId === player.id)
    )
  ) {
    rates.push(3);
  }
  if (
    Object.values(state.board.edges).some(
      (edge) =>
        edge.blackMarket?.type === "specific" &&
        edge.blackMarket.resource === give &&
        isBlackMarketVisible(state.board, edge.id) &&
        edge.vertexIds.some((vertexId) => state.board.vertices[vertexId].building?.ownerId === player.id)
    )
  ) {
    rates.push(2);
  }
  if (state.merchant.controllerId === player.id && state.zombieTileId !== state.merchant.tileId) {
    const tile = state.board.tiles[state.merchant.tileId];
    const resource = tileResource(tile);
    if (tile.hiddenType === "warehouse" || resource === give) rates.push(2);
  }
  return rates.sort((a, b) => a - b);
}

function bankTrade(state: GameState, give: Resource, receive: Resource, rate?: 2 | 3 | 4): void {
  assertActionWindow(state, "银行和黑市交易只能在行动阶段进行。");
  const player = currentPlayer(state);
  const legalRates = legalTradeRates(state, player, give);
  const actualRate = rate ?? legalRates[0];
  assertRule(legalRates.includes(actualRate), "当前没有该贸易比例。");
  spend(player, { [give]: actualRate });
  gain(player, { [receive]: 1 });
  event(state, `${player.name} 用 ${actualRate}:1 交易获得 1 张${resourceName(receive)}。`);
}

function buildRoute(state: GameState, edgeId: string, routeType: RouteType, free?: boolean): void {
  assertActionWindow(state, "建造路线只能在行动阶段进行。");
  const player = currentPlayer(state);
  const edge = state.board.edges[edgeId];
  assertRule(edge, "边不存在。");
  assertRule(!edge.route, "该边已有路线。");
  assertRule(edgeConnectedToPlayerNetwork(state.board, edgeId, player.id), "路线必须连接自己的网络。");
  assertRule(
    routeTypeAllowedOnEdge(state.board, edgeId, routeType),
    routeType === "transport" ? "运输线只能放在资源地块边缘。" : "装甲车队必须放在有效地块边缘。"
  );
  if (routeType === "transport") {
    assertRule(player.pieces.transports > 0, "运输线棋子不足。");
    takeCost(player, COSTS.transport, free);
    player.pieces.transports -= 1;
  } else {
    assertRule(player.pieces.convoys > 0, "装甲车队棋子不足。");
    takeCost(player, COSTS.convoy, free);
    player.pieces.convoys -= 1;
  }
  edge.route = { ownerId: player.id, type: routeType };
  event(state, `${player.name} 建造${routeType === "transport" ? "运输线" : "装甲车队"}。`);
  revealFromRoute(state, player, edgeId);
  updateAwards(state);
}

function moveConvoy(state: GameState, fromEdgeId: string, toEdgeId: string): void {
  assertActionWindow(state, "移动装甲车队只能在行动阶段进行。");
  const player = currentPlayer(state);
  assertRule(!player.movedConvoyThisTurn, "每名玩家每回合只能移动 1 个开放装甲车队。");
  const from = state.board.edges[fromEdgeId];
  const to = state.board.edges[toEdgeId];
  assertRule(from?.route?.ownerId === player.id && from.route.type === "convoy", "起点必须是自己的装甲车队。");
  assertRule(to && !to.route, "目标边必须为空。");
  assertRule(routeTypeAllowedOnEdge(state.board, toEdgeId, "convoy"), "装甲车队必须放在有效地块边缘。");
  assertRule(isOpenConvoyEdge(state.board, player.id, fromEdgeId), "只有路线末端的开放装甲车队可以移动。");
  from.route = undefined;
  const connected = edgeConnectedToPlayerNetwork(state.board, toEdgeId, player.id);
  if (!connected) {
    from.route = { ownerId: player.id, type: "convoy" };
    throw new RuleError("移动后装甲车队仍必须连接自己的网络。");
  }
  to.route = { ownerId: player.id, type: "convoy" };
  player.movedConvoyThisTurn = true;
  revealFromRoute(state, player, toEdgeId);
  event(state, `${player.name} 移动 1 个开放装甲车队。`);
  updateAwards(state);
}

function revealFromRoute(state: GameState, player: PlayerState, edgeId: string): void {
  const hiddenTileIds = hiddenTileIdsAroundRoute(state.board, edgeId);
  hiddenTileIds.forEach((hiddenTileId) => {
    const tile = state.board.tiles[hiddenTileId];
    tile.revealed = true;
    event(state, `${player.name} 的路线触达迷雾，翻开 ${tile.id}。`);
    const resource = tileResource(tile);
    if (resource) {
      gain(player, { [resource]: 1 });
      event(state, `${player.name} 探索获得 1 张${resourceName(resource)}。`);
    } else if (tile.hiddenType === "warehouse") {
      queuePending(state, {
        kind: "chooseResource",
        playerId: player.id,
        amount: 1,
        reason: "explore-warehouse"
      });
    } else if (tile.hiddenType === "infected") {
      advanceZombieTrack(state, 1);
      const total = resourceTotal(player.resources);
      if (total > 0) {
        const [index, nextRng] = randomInt(state.rng, total);
        state.rng = nextRng;
        let cursor = index;
        for (const resource of RESOURCES) {
          if (cursor < player.resources[resource]) {
            player.resources[resource] -= 1;
            event(state, `${player.name} 探索感染区，随机失去 1 张资源。`);
            break;
          }
          cursor -= player.resources[resource];
        }
      }
    }
  });
}

function buildCamp(state: GameState, vertexId: string, free?: boolean): void {
  assertActionWindow(state, "建造营地只能在行动阶段进行。");
  const vertex = state.board.vertices[vertexId];
  assertRule(vertex, "交叉点不存在。");
  assertRule(!vertex.building, "该交叉点已有建筑。");
  assertRule(!vertexHasAdjacentBuilding(state.board, vertexId), "营地必须遵守距离规则。");
  const player = currentPlayer(state);
  assertRule(vertexConnectedToPlayerNetwork(state.board, vertexId, player.id), "新营地必须连接自己的路线。");
  assertRule(vertexTouchesResource(state.board, vertexId, false), "营地必须至少相邻一个资源地块。");
  assertRule(player.pieces.camps > 0, "营地棋子不足。");
  takeCost(player, COSTS.camp, free);
  player.pieces.camps -= 1;
  vertex.building = { ownerId: player.id, type: "camp" };
  awardNewResourceZoneBonuses(state, player, vertexId);
  event(state, `${player.name} 建造营地。`);
}

function awardNewResourceZoneBonuses(state: GameState, player: PlayerState, vertexId: string): void {
  const touchedZoneIds = new Set(touchedSmallResourceZoneIds(state.board, vertexId));
  if (touchedZoneIds.size === 0) return;

  const claimedByPlayer = new Set(state.awards.newResourceZones?.[player.id] ?? []);
  const newlyClaimed = [...touchedZoneIds].filter((zoneId) => !claimedByPlayer.has(zoneId));
  if (newlyClaimed.length === 0) return;

  state.awards.newResourceZones ??= {};
  state.awards.newResourceZones[player.id] = [...claimedByPlayer, ...newlyClaimed];
  newlyClaimed.forEach(() => {
    event(state, `${player.name} 首次在新资源区建立营地，获得 1 点胜利点。`);
  });
}

function touchedSmallResourceZoneIds(board: BoardState, vertexId: string): string[] {
  const vertex = board.vertices[vertexId];
  if (!vertex) return [];
  const touchedSmallTileIds = vertex.tileIds.filter((tileId) => {
    const tile = board.tiles[tileId];
    return tile.cluster === "small" && isResourceTile(tile);
  });
  if (touchedSmallTileIds.length === 0) return [];

  const zoneIds = new Set<string>();
  touchedSmallTileIds.forEach((tileId) => zoneIds.add(smallResourceZoneId(board, tileId)));
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

function upgradeFortress(state: GameState, vertexId: string, free?: boolean): void {
  assertActionWindow(state, "升级堡垒只能在行动阶段进行。");
  const vertex = state.board.vertices[vertexId];
  const player = currentPlayer(state);
  assertRule(vertex?.building?.ownerId === player.id && vertex.building.type === "camp", "只能升级自己的营地。");
  assertRule(player.pieces.fortresses > 0, "堡垒棋子不足。");
  takeCost(player, COSTS.fortress, free);
  vertex.building.type = "fortress";
  player.pieces.fortresses -= 1;
  player.pieces.camps += 1;
  event(state, `${player.name} 将营地升级为堡垒。`);
}

function buildWatchtower(state: GameState, vertexId: string, free?: boolean): void {
  assertActionWindow(state, "建造哨塔只能在行动阶段进行。");
  const vertex = state.board.vertices[vertexId];
  const player = currentPlayer(state);
  assertRule(vertex?.building?.ownerId === player.id, "哨塔必须建在自己的营地或堡垒旁。");
  assertRule(!vertex.watchtowerOwnerId, "该建筑旁已有哨塔。");
  assertRule(player.pieces.watchtowers > 0, "哨塔棋子不足。");
  takeCost(player, COSTS.watchtower, free);
  player.pieces.watchtowers -= 1;
  vertex.watchtowerOwnerId = player.id;
  event(state, `${player.name} 建造哨塔。`);
}

function recruitMilitia(state: GameState, vertexId: string, free?: boolean): void {
  assertActionWindow(state, "征召民兵只能在行动阶段进行。");
  const vertex = state.board.vertices[vertexId];
  const player = currentPlayer(state);
  assertRule(vertex?.building?.ownerId === player.id, "民兵必须驻守在自己的营地或堡垒上。");
  const stationed = player.militia.filter((militia) => militia.vertexId === vertexId).length;
  assertRule(stationed < 2, "每个营地或堡垒最多驻守 2 个民兵。");
  assertRule(player.pieces.militia > 0, "民兵棋子不足。");
  takeCost(player, COSTS.militia, free);
  const militia: Militia = {
    id: `${player.id}-militia-${player.militia.length + 1}`,
    ownerId: player.id,
    vertexId,
    status: "inactive"
  };
  player.militia.push(militia);
  player.pieces.militia -= 1;
  event(state, `${player.name} 征召 1 个民兵。`);
  updateAwards(state);
}

function canPlanRecruitMilitia(
  player: PlayerState,
  vertex: VertexState | undefined,
  vertexId: string,
  plannedVertexIds: string[]
): boolean {
  return Boolean(
    vertex?.building?.ownerId === player.id &&
      player.militia.filter((militia) => militia.vertexId === vertexId).length +
        plannedVertexIds.filter((plannedVertexId) => plannedVertexId === vertexId).length <
        2
  );
}

function resolveMilitiaMobilizationVertices(
  state: GameState,
  player: PlayerState,
  payload?: Record<string, unknown>
): string[] {
  assertRule(player.pieces.militia > 0, "民兵棋子不足。");

  const payloadVertexIds = Array.isArray(payload?.vertexIds)
    ? payload.vertexIds.filter((vertexId): vertexId is string => typeof vertexId === "string")
    : undefined;
  const legacyVertexId = typeof payload?.vertexId === "string" ? payload.vertexId : undefined;
  const requestedVertexIds = payloadVertexIds ?? (legacyVertexId ? [legacyVertexId] : []);
  const plannedVertexIds: string[] = [];
  const addVertex = (vertexId: string, strict: boolean) => {
    const vertex = state.board.vertices[vertexId];
    const canRecruit = canPlanRecruitMilitia(player, vertex, vertexId, plannedVertexIds);
    if (strict) assertRule(canRecruit, "这张卡只能把民兵部署到自己的营地或堡垒，且每处最多 2 个。");
    if (!canRecruit) return;
    plannedVertexIds.push(vertexId);
  };

  requestedVertexIds.slice(0, MILITIA_MOBILIZATION_AMOUNT).forEach((vertexId) => {
    if (plannedVertexIds.length < player.pieces.militia) addVertex(vertexId, true);
  });

  if (payloadVertexIds && payloadVertexIds.length > 0) {
    assertRule(plannedVertexIds.length > 0, "没有可放置民兵的营地或堡垒。");
    return plannedVertexIds;
  }

  const candidateVertexIds = [...requestedVertexIds, ...legalRecruitVerticesForPlayer(state, player.id)];
  while (plannedVertexIds.length < MILITIA_MOBILIZATION_AMOUNT && plannedVertexIds.length < player.pieces.militia) {
    const countBeforePass = plannedVertexIds.length;
    for (const vertexId of candidateVertexIds) {
      addVertex(vertexId, false);
      if (plannedVertexIds.length >= MILITIA_MOBILIZATION_AMOUNT || plannedVertexIds.length >= player.pieces.militia) break;
    }
    if (plannedVertexIds.length === countBeforePass) break;
  }

  assertRule(plannedVertexIds.length > 0, "没有可放置民兵的营地或堡垒。");
  return plannedVertexIds;
}

function activateMilitia(state: GameState, militiaId: string): void {
  assertActionWindow(state, "激活民兵只能在行动阶段进行。");
  const player = currentPlayer(state);
  const militia = player.militia.find((item) => item.id === militiaId);
  assertRule(militia, "民兵不存在。");
  assertRule(militia.status === "inactive", "只有未激活民兵可以激活。");
  takeCost(player, COSTS.activateMilitia);
  militia.status = "active";
  militia.activatedTurn = state.turn;
  event(state, `${player.name} 激活 1 个民兵。`);
}

function militiaCanTakeActiveAction(state: GameState, militia: Militia | undefined): militia is Militia {
  return Boolean(militia?.status === "active" && militia.activatedTurn !== state.turn);
}

function moveMilitia(state: GameState, militiaId: string, toVertexId: string): void {
  assertActionWindow(state, "移动民兵只能在行动阶段进行。");
  const player = currentPlayer(state);
  const militia = player.militia.find((item) => item.id === militiaId);
  assertRule(militia?.status === "active", "只有已激活民兵可以移动。");
  assertRule(militiaCanTakeActiveAction(state, militia), "本回合刚激活的民兵不能立刻执行主动行动。");
  const target = state.board.vertices[toVertexId];
  assertRule(target?.building?.ownerId === player.id, "目标必须是自己的营地或堡垒。");
  assertRule(player.militia.filter((item) => item.vertexId === toVertexId).length < 2, "目标驻守已满。");
  assertRule(connectedByOwnRoutes(state.board, player.id, militia.vertexId, toVertexId), "民兵移动必须通过自己的路线连接。");
  militia.vertexId = toVertexId;
  militia.status = "inactive";
  militia.activatedTurn = undefined;
  event(state, `${player.name} 移动 1 个民兵。`);
}

function connectedByOwnRoutes(board: BoardState, playerId: string, from: string, to: string): boolean {
  const queue = [from];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) return true;
    const vertex = board.vertices[current];
    vertex.edgeIds.forEach((edgeId) => {
      const edge = board.edges[edgeId];
      if (edge.route?.ownerId !== playerId) return;
      edge.vertexIds.forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    });
  }
  return false;
}

function isOpenConvoyEdge(board: BoardState, playerId: string, edgeId: string): boolean {
  const edge = board.edges[edgeId];
  if (edge?.route?.ownerId !== playerId || edge.route.type !== "convoy") return false;
  const ownNeighbors = edge.vertexIds.flatMap((vertexId) =>
    board.vertices[vertexId].edgeIds.filter(
      (neighborId) => neighborId !== edgeId && board.edges[neighborId].route?.ownerId === playerId
    )
  );
  return ownNeighbors.length <= 1;
}

function edgeConnectedToPlayerNetworkExcluding(
  board: BoardState,
  edgeId: string,
  playerId: string,
  excludedEdgeId?: string
): boolean {
  const edge = board.edges[edgeId];
  if (!edge || edge.route) return false;
  return edge.vertexIds.some((vertexId) => {
    const vertex = board.vertices[vertexId];
    if (vertex.building?.ownerId === playerId) return true;
    return vertex.edgeIds.some(
      (neighborId) => neighborId !== excludedEdgeId && board.edges[neighborId].route?.ownerId === playerId
    );
  });
}

function expelZombie(state: GameState, militiaId: string, toTileId: string, targetPlayerId?: string): void {
  assertActionWindow(state, "驱逐尸潮只能在行动阶段进行。");
  const player = currentPlayer(state);
  const militia = player.militia.find((item) => item.id === militiaId);
  assertRule(militia?.status === "active", "只有已激活民兵可以驱逐尸潮。");
  assertRule(militiaCanTakeActiveAction(state, militia), "本回合刚激活的民兵不能立刻执行主动行动。");
  const vertex = state.board.vertices[militia.vertexId];
  assertRule(vertex.tileIds.includes(state.zombieTileId), "民兵所在建筑必须相邻尸潮所在地块。");
  const targetTile = state.board.tiles[toTileId];
  assertRule(targetTile?.revealed, "尸潮只能移动到已翻开的地块。");
  assertRule(toTileId !== state.zombieTileId, "必须将尸潮驱逐到另一个已翻开的地块。");
  state.zombieTileId = toTileId;
  militia.status = "inactive";
  militia.activatedTurn = undefined;
  event(state, `${player.name} 使用民兵驱逐尸潮。`);
  const targets = adjacentPlayersToTile(state.board, toTileId).filter((id) => id !== player.id);
  if (targetPlayerId && targets.includes(targetPlayerId)) {
    state.pending = { kind: "stealResource", playerId: player.id, targetPlayerIds: [targetPlayerId] };
    stealResource(state, targetPlayerId);
  } else if (targets.length > 0) {
    state.pending = { kind: "stealResource", playerId: player.id, targetPlayerIds: targets };
  }
}

function buyDevelopmentCard(state: GameState): void {
  assertActionWindow(state, "购买发展卡只能在行动阶段进行。");
  const player = currentPlayer(state);
  takeCost(player, COSTS.devCard);
  const card = drawDevCard(state, player);
  assertRule(card, "发展卡牌堆已空。");
  event(state, `${player.name} 购买 1 张发展卡。`);
}

function playDevelopmentCard(state: GameState, cardId: string, payload?: Record<string, unknown>): void {
  assertActionWindow(state, "使用发展卡只能在行动阶段进行。");
  const player = currentPlayer(state);
  const card = player.devCards.find((item) => item.id === cardId);
  assertRule(card, "没有这张发展卡。");
  assertRule(card.type !== "secretBase", "秘密据点不需要主动使用，达到胜利条件时自动公开。");
  assertRule(!player.usedDevCardThisTurn, "每回合最多使用 1 张发展卡。");
  assertRule(card.purchasedTurn !== state.turn, "本回合购买的发展卡不能立刻使用。");

  player.usedDevCardThisTurn = true;
  player.devCards = player.devCards.filter((item) => item.id !== cardId);

  if (card.type === "militiaMobilization") {
    const vertexIds = resolveMilitiaMobilizationVertices(state, player, payload);
    vertexIds.forEach((vertexId) => recruitMilitia(state, vertexId, true));
    event(state, `${player.name} 使用民兵动员征召 ${vertexIds.length} 个民兵。`);
  } else if (card.type === "roadCrew") {
    const routePayload = payload?.routes as Array<{ edgeId: string; routeType: RouteType }> | undefined;
    const routes =
      routePayload ??
      Object.values(state.board.edges)
        .filter((edge) => !edge.route && edgeConnectedToPlayerNetwork(state.board, edge.id, player.id))
        .filter((edge) => routeTypeAllowedOnEdge(state.board, edge.id, "transport"))
        .slice(0, 2)
        .map((edge) => ({ edgeId: edge.id, routeType: "transport" as RouteType }));
    assertRule(routes.length > 0, "没有可建造的路线位置。");
    routes.slice(0, 2).forEach((route) => {
      if (!state.pending) buildRoute(state, route.edgeId, route.routeType, true);
    });
    event(state, `${player.name} 使用开路队免费建造路线。`);
  } else if (card.type === "airdrop") {
    state.pending = { kind: "chooseResource", playerId: player.id, amount: 2, reason: "airdrop" };
  } else if (card.type === "requisition") {
    const resource = payload?.resource as Resource | undefined;
    assertRule(resource && RESOURCES.includes(resource), "征用物资必须指定资源。");
    state.players
      .filter((item) => item.id !== player.id)
      .forEach((target) => {
        const amount = target.resources[resource];
        target.resources[resource] = 0;
        player.resources[resource] += amount;
      });
    event(state, `${player.name} 征用所有其他玩家的${resourceName(resource)}。`);
  } else if (card.type === "merchant") {
    const tileId =
      typeof payload?.tileId === "string"
        ? payload.tileId
        : Object.values(state.board.tiles).find(
            (tile) =>
              tile.revealed &&
              isResourceTile(tile) &&
              tile.hiddenType !== "infected" &&
              Object.values(state.board.vertices).some(
                (vertex) => vertex.tileIds.includes(tile.id) && vertex.building?.ownerId === player.id
              )
          )?.id;
    assertRule(tileId, "没有合法的商人移动目标。");
    moveMerchant(state, player, tileId);
  } else if (card.type === "zombieApproaches") {
    advanceZombieTrack(state, 1);
    queuePending(state, { kind: "chooseResource", playerId: player.id, amount: 1, reason: "zombie-approaches" });
  }
}

function moveMerchant(state: GameState, player: PlayerState, tileId: string): void {
  const tile = state.board.tiles[tileId];
  assertRule(tile?.revealed && isResourceTile(tile) && tile.hiddenType !== "infected", "商人只能移动到已翻开的资源地块。");
  const touchesOwnBuilding = Object.values(state.board.vertices).some(
    (vertex) => vertex.tileIds.includes(tileId) && vertex.building?.ownerId === player.id
  );
  assertRule(touchesOwnBuilding, "商人必须移动到自己建筑相邻的地块。");
  state.merchant = { tileId, controllerId: player.id };
  event(state, `${player.name} 获得商人控制权。`);
}

function updateAwards(state: GameState): void {
  const lengths = state.players.map((player) => ({
    playerId: player.id,
    length: longestSupplyLength(state.board, player.id)
  }));
  state.awards.longestSupply = resolveCompetitiveAward(
    state.awards.longestSupply,
    lengths,
    "length",
    5
  );

  const militiaCounts = state.players.map((player) => ({
    playerId: player.id,
    count: player.militia.length
  }));
  state.awards.strongestMilitia = resolveCompetitiveAward(
    state.awards.strongestMilitia,
    militiaCounts,
    "count",
    3
  );
}

function resolveCompetitiveAward<T extends "length" | "count">(
  current: ({ playerId: string } & Record<T, number>) | undefined,
  scores: Array<{ playerId: string } & Record<T, number>>,
  key: T,
  minimum: number
): ({ playerId: string } & Record<T, number>) | undefined {
  const currentScore = current ? scores.find((score) => score.playerId === current.playerId)?.[key] ?? 0 : 0;
  const qualifying = scores.filter((score) => score[key] >= minimum);
  if (qualifying.length === 0) return undefined;
  const max = Math.max(...qualifying.map((score) => score[key]));
  const leaders = qualifying.filter((score) => score[key] === max);
  if (current && currentScore === max && leaders.some((leader) => leader.playerId === current.playerId)) {
    return { playerId: current.playerId, [key]: currentScore } as { playerId: string } & Record<T, number>;
  }
  return leaders.length === 1 ? leaders[0] : undefined;
}

export function longestSupplyLength(board: BoardState, playerId: string): number {
  const playerEdges = getPlayerEdges(board, playerId);
  const edgeIds = new Set(playerEdges.map((edge) => edge.id));
  let best = 0;

  function dfs(vertexId: string, usedEdges: Set<string>, length: number): void {
    best = Math.max(best, length);
    const vertex = board.vertices[vertexId];
    if (vertex.building && vertex.building.ownerId !== playerId && length > 0) return;
    vertex.edgeIds.forEach((edgeId) => {
      if (!edgeIds.has(edgeId) || usedEdges.has(edgeId)) return;
      const edge = board.edges[edgeId];
      const nextVertex = edge.vertexIds.find((id) => id !== vertexId)!;
      const nextUsed = new Set(usedEdges);
      nextUsed.add(edgeId);
      dfs(nextVertex, nextUsed, length + 1);
    });
  }

  playerEdges.forEach((edge) => {
    edge.vertexIds.forEach((vertexId) => dfs(vertexId, new Set(), 0));
  });
  return best;
}

export function calculateScore(state: GameState, playerId: string): ScoreBreakdown {
  const player = findPlayer(state, playerId);
  const buildings = Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === playerId);
  const camps = buildings.filter((vertex) => vertex.building?.type === "camp").length;
  const fortresses = buildings.filter((vertex) => vertex.building?.type === "fortress").length;
  const secretBases = player.devCards.filter((card) => card.type === "secretBase" && card.revealed).length;
  const newResourceZones = new Set(state.awards.newResourceZones?.[playerId] ?? []).size;
  const breakdown: ScoreBreakdown = {
    camps,
    fortresses: fortresses * 2,
    longestSupply: state.awards.longestSupply?.playerId === playerId ? 2 : 0,
    strongestMilitia: state.awards.strongestMilitia?.playerId === playerId ? 2 : 0,
    secretBases,
    defenderTokens: player.defenderTokens,
    merchant: state.merchant.controllerId === playerId ? 1 : 0,
    newResourceZones,
    total: 0
  };
  breakdown.total =
    breakdown.camps +
    breakdown.fortresses +
    breakdown.longestSupply +
    breakdown.strongestMilitia +
    breakdown.secretBases +
    breakdown.defenderTokens +
    breakdown.merchant +
    breakdown.newResourceZones;
  return breakdown;
}

export function legalInitialCampVertices(state: GameState): string[] {
  if (state.phase !== "setup" || state.pending) return [];
  return Object.values(state.board.vertices)
    .filter((vertex) => !vertex.building)
    .filter((vertex) => !vertexHasAdjacentBuilding(state.board, vertex.id))
    .filter((vertex) => vertexTouchesOnlyRevealed(state.board, vertex.id))
    .filter((vertex) => vertexTouchesResource(state.board, vertex.id, true))
    .filter((vertex) => vertexTouchesInitialResourceZone(state.board, vertex.id))
    .filter((vertex) => !vertexTouchesWarehouse(state.board, vertex.id))
    .map((vertex) => vertex.id);
}

export function legalInitialRouteEdges(state: GameState): string[] {
  if (state.pending?.kind !== "setupRoute") return [];
  const campVertex = state.board.vertices[state.pending.campVertexId];
  return campVertex.edgeIds.filter(
    (edgeId) => !state.board.edges[edgeId].route && routeTypeAllowedOnEdge(state.board, edgeId, "transport")
  );
}

export function legalBuildEdges(state: GameState, routeType: RouteType = "transport"): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  return legalRouteEdgesForPlayer(state.board, player.id, routeType);
}

function legalRouteEdgesForPlayer(board: BoardState, playerId: string, routeType: RouteType): string[] {
  return Object.values(board.edges)
    .filter((edge) => !edge.route)
    .filter((edge) => edgeConnectedToPlayerNetwork(board, edge.id, playerId))
    .filter((edge) => routeTypeAllowedOnEdge(board, edge.id, routeType))
    .map((edge) => edge.id);
}

export function legalDevelopmentRouteEdges(
  state: GameState,
  routeType: RouteType = "transport",
  queuedRoutes: Array<{ edgeId: string; routeType: RouteType }> = []
): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  const board =
    queuedRoutes.length > 0
      ? {
          ...state.board,
          edges: { ...state.board.edges }
        }
      : state.board;

  queuedRoutes.forEach((route) => {
    const edge = board.edges[route.edgeId];
    if (
      !edge ||
      edge.route ||
      !edgeConnectedToPlayerNetwork(board, edge.id, player.id) ||
      !routeTypeAllowedOnEdge(board, edge.id, route.routeType)
    ) {
      return;
    }
    board.edges[edge.id] = { ...edge, route: { ownerId: player.id, type: route.routeType } };
  });

  return legalRouteEdgesForPlayer(board, player.id, routeType);
}

export function legalBuildVertices(state: GameState): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  return Object.values(state.board.vertices)
    .filter((vertex) => !vertex.building)
    .filter((vertex) => !vertexHasAdjacentBuilding(state.board, vertex.id))
    .filter((vertex) => vertexConnectedToPlayerNetwork(state.board, vertex.id, player.id))
    .filter((vertex) => vertexTouchesResource(state.board, vertex.id, false))
    .map((vertex) => vertex.id);
}

export function legalUpgradeVertices(state: GameState): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  return Object.values(state.board.vertices)
    .filter((vertex) => vertex.building?.ownerId === player.id && vertex.building.type === "camp")
    .map((vertex) => vertex.id);
}

export function legalWatchtowerVertices(state: GameState): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  return Object.values(state.board.vertices)
    .filter((vertex) => vertex.building?.ownerId === player.id)
    .filter((vertex) => !vertex.watchtowerOwnerId)
    .map((vertex) => vertex.id);
}

export function legalRecruitVertices(state: GameState): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  return legalRecruitVerticesForPlayer(state, player.id);
}

function legalRecruitVerticesForPlayer(state: GameState, playerId: string): string[] {
  const player = findPlayer(state, playerId);
  return Object.values(state.board.vertices)
    .filter((vertex) => vertex.building?.ownerId === playerId)
    .filter((vertex) => player.militia.filter((militia) => militia.vertexId === vertex.id).length < 2)
    .map((vertex) => vertex.id);
}

export function legalMilitiaMobilizationVertices(state: GameState): string[] {
  if (state.phase !== "action") return [];
  return legalRecruitVerticesForPlayer(state, state.currentPlayerId);
}

export function legalConvoyMoveFromEdges(state: GameState): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  if (player.movedConvoyThisTurn) return [];
  return Object.values(state.board.edges)
    .filter((edge) => isOpenConvoyEdge(state.board, player.id, edge.id))
    .map((edge) => edge.id);
}

export function legalConvoyMoveToEdges(state: GameState, fromEdgeId: string): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  if (player.movedConvoyThisTurn || !isOpenConvoyEdge(state.board, player.id, fromEdgeId)) return [];
  return Object.values(state.board.edges)
    .filter((edge) => !edge.route)
    .filter((edge) => routeTypeAllowedOnEdge(state.board, edge.id, "convoy"))
    .filter((edge) => edgeConnectedToPlayerNetworkExcluding(state.board, edge.id, player.id, fromEdgeId))
    .map((edge) => edge.id);
}

export function legalMilitiaMoveVertices(state: GameState, militiaId: string): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  const militia = player.militia.find((item) => item.id === militiaId);
  if (!militiaCanTakeActiveAction(state, militia)) return [];
  return Object.values(state.board.vertices)
    .filter((vertex) => vertex.building?.ownerId === player.id)
    .filter((vertex) => vertex.id !== militia.vertexId)
    .filter((vertex) => player.militia.filter((item) => item.vertexId === vertex.id).length < 2)
    .filter((vertex) => connectedByOwnRoutes(state.board, player.id, militia.vertexId, vertex.id))
    .map((vertex) => vertex.id);
}

export function legalExpelZombieMilitiaIds(state: GameState): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  return player.militia
    .filter((militia) => militiaCanTakeActiveAction(state, militia))
    .filter((militia) => state.board.vertices[militia.vertexId].tileIds.includes(state.zombieTileId))
    .map((militia) => militia.id);
}

export function legalExpelZombieTiles(state: GameState, militiaId: string): string[] {
  if (!legalExpelZombieMilitiaIds(state).includes(militiaId)) return [];
  return Object.values(state.board.tiles)
    .filter((tile) => tile.revealed && tile.id !== state.zombieTileId)
    .map((tile) => tile.id);
}

export function legalMerchantTiles(state: GameState): string[] {
  if (state.phase !== "action") return [];
  const player = currentPlayer(state);
  return Object.values(state.board.tiles)
    .filter((tile) => tile.revealed && isResourceTile(tile) && tile.hiddenType !== "infected")
    .filter((tile) =>
      Object.values(state.board.vertices).some(
        (vertex) => vertex.tileIds.includes(tile.id) && vertex.building?.ownerId === player.id
      )
    )
    .map((tile) => tile.id);
}

export function applyCommand(baseState: GameState | undefined, command: Command): GameState {
  if (command.type === "createGame") {
    return createGame(command.players, command.seed, command.debugMode ?? false, command.fogEnabled ?? true);
  }
  assertRule(baseState, "请先创建游戏。");
  const actingPlayerId = baseState.currentPlayerId;
  const state = cloneState(baseState);
  try {
    switch (command.type) {
      case "placeInitialCamp":
        placeInitialCamp(state, command.vertexId);
        break;
      case "placeInitialRoute":
        placeInitialRoute(state, command.edgeId);
        break;
      case "rollDice":
        rollDice(state, command.forced);
        break;
      case "moveZombie":
        moveZombie(state, command.tileId);
        break;
      case "stealResource":
        stealResource(state, command.targetPlayerId);
        break;
      case "discardResources":
        resolveDiscard(state, command.resources);
        break;
      case "chooseResource":
        chooseResource(state, command.resources);
        break;
      case "endPhase":
        endPhase(state);
        break;
      case "endTurn":
        endTurn(state);
        break;
      case "timeoutTurn":
        timeoutTurn(state, command.expectedPlayerId, command.expectedTurn);
        break;
      case "bankTrade":
        bankTrade(state, command.give, command.receive, command.rate);
        break;
      case "playerTrade":
        playerTrade(state, command.targetPlayerId, command.offer, command.request);
        break;
      case "confirmPlayerTrade":
        confirmPlayerTrade(state, command.accept);
        break;
      case "buildRoute":
        buildRoute(state, command.edgeId, command.routeType, command.free);
        break;
      case "moveConvoy":
        moveConvoy(state, command.fromEdgeId, command.toEdgeId);
        break;
      case "buildCamp":
        buildCamp(state, command.vertexId, command.free);
        break;
      case "upgradeFortress":
        upgradeFortress(state, command.vertexId, command.free);
        break;
      case "buildWatchtower":
        buildWatchtower(state, command.vertexId, command.free);
        break;
      case "recruitMilitia":
        recruitMilitia(state, command.vertexId, command.free);
        break;
      case "activateMilitia":
        activateMilitia(state, command.militiaId);
        break;
      case "moveMilitia":
        moveMilitia(state, command.militiaId, command.toVertexId);
        break;
      case "expelZombie":
        expelZombie(state, command.militiaId, command.toTileId, command.targetPlayerId);
        break;
      case "buyDevelopmentCard":
        buyDevelopmentCard(state);
        break;
      case "playDevelopmentCard":
        playDevelopmentCard(state, command.cardId, command.payload);
        break;
      case "downgradeFortress":
        resolveDowngrade(state, command.vertexId);
        break;
      case "debugSetResources":
        findPlayer(state, command.playerId).resources = command.resources;
        event(state, "调试：资源已设置。");
        break;
      case "debugJumpPhase":
        state.phase = command.phase;
        event(state, `调试：阶段跳转到 ${command.phase}。`);
        break;
      case "debugAdvanceZombieTrack":
        advanceZombieTrack(state, 1);
        event(state, "调试：已推进尸潮进度。");
        break;
      case "debugRevealAllFog":
        Object.values(state.board.tiles).forEach((tile) => {
          tile.revealed = true;
        });
        event(state, "调试：全部迷雾已解锁。");
        break;
      default:
        command satisfies never;
    }
  } catch (error) {
    if (error instanceof RuleError) throw error;
    throw error;
  }
  updateAwards(state);
  if (
    state.phase !== "setup" &&
    state.phase !== "victory" &&
    state.currentPlayerId === actingPlayerId &&
    !state.pending
  ) {
    maybeCurrentPlayerWins(state);
  }
  return state;
}

export interface SerializeStateForTextOptions {
  mode?: "hot-seat" | "online";
  viewerPlayerId?: string;
  pendingPlayerId?: string;
  playerSummaries?: Array<{
    id: string;
    name: string;
    resourceCount: number;
  }>;
}

export function serializeStateForText(state: GameState, options: SerializeStateForTextOptions = {}): string {
  const activePlayer = currentPlayer(state);
  const viewer = options.viewerPlayerId
    ? state.players.find((item) => item.id === options.viewerPlayerId) ?? activePlayer
    : activePlayer;
  const playerSummaryMap = new Map(options.playerSummaries?.map((summary) => [summary.id, summary]));
  const payload = {
    mode: options.mode ?? "hot-seat",
    debugMode: Boolean(state.debugMode),
    fogEnabled: state.fogEnabled !== false,
    phase: state.phase,
    pending: state.pending?.kind,
    pendingPlayerId: options.pendingPlayerId ?? state.pending?.playerId,
    currentPlayer: activePlayer.name,
    viewerPlayer: viewer.name,
    turn: state.turn,
    dice: state.dice,
    zombie: { tileId: state.zombieTileId, track: state.zombieTrack },
    merchant: state.merchant,
    players: state.players.map((item) => ({
      id: item.id,
      name: item.name,
      resources:
        item.id === viewer.id
          ? item.resources
          : playerSummaryMap.get(item.id)?.resourceCount ?? resourceTotal(item.resources),
      score: calculateScore(state, item.id).total,
      militia: item.militia.map((militia) => ({ vertexId: militia.vertexId, status: militia.status }))
    })),
    board: {
      coordinateSystem: "SVG pixels, origin near upper-left after viewBox normalization, y grows downward.",
      revealedTiles: Object.values(state.board.tiles)
        .filter((tile) => tile.revealed)
        .map((tile) => ({ id: tile.id, type: tile.hiddenType, number: tile.number })),
      buildings: Object.values(state.board.vertices)
        .filter((vertex) => vertex.building)
        .map((vertex) => ({ id: vertex.id, building: vertex.building })),
      routes: Object.values(state.board.edges)
        .filter((edge) => edge.route)
        .map((edge) => ({ id: edge.id, route: edge.route }))
    }
  };
  return JSON.stringify(payload);
}
