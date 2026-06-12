import { COSTS, RESOURCES, TILE_RESOURCE, VICTORY_POINTS_TO_WIN, createResources } from "./constants";
import { adjacentPlayersToTile, hiddenTileIdsAroundRoute, tileResource } from "./board";
import {
  addResources,
  applyCommand,
  calculateScore,
  hasResources,
  legalBuildEdges,
  legalBuildVertices,
  legalConvoyMoveFromEdges,
  legalConvoyMoveToEdges,
  legalDevelopmentRouteEdges,
  legalExpelZombieMilitiaIds,
  legalExpelZombieTiles,
  legalInitialCampVertices,
  legalInitialRouteEdges,
  legalMerchantTiles,
  legalMilitiaMobilizationVertices,
  legalMilitiaMoveVertices,
  legalRecruitVertices,
  legalUpgradeVertices,
  legalWatchtowerVertices,
  longestSupplyLength,
  resourceTotal,
  subtractResources,
  tradeOfferSignature
} from "./rules";
import type { AiStrategyKind, AiStrategyPlan, Command, GameState, PlayerState, Resource, Resources } from "./types";

const NUMBER_WEIGHTS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1
};

const ACTION_THRESHOLD = 4;
const STRATEGY_COMMITMENT_ROUNDS = 2;
const STRATEGY_SWITCH_MARGIN = 70;
const STRATEGY_COMMITTED_SWITCH_MARGIN = 155;
const MAX_TRADE_OFFERS_PER_TURN = 2;

interface Candidate {
  command: Command;
  bonus?: number;
  strategies?: AiStrategyKind[];
}

interface ResourcePlan {
  cost: Partial<Resources>;
  priority: number;
}

export function isAiPlayer(player: PlayerState | undefined): boolean {
  return player?.controller === "ai";
}

export function activeDecisionPlayer(state: GameState): PlayerState | undefined {
  const playerId = state.pending?.playerId ?? state.currentPlayerId;
  return state.players.find((player) => player.id === playerId);
}

export function chooseAiCommand(state: GameState): Command | undefined {
  const player = activeDecisionPlayer(state);
  if (!player || !isAiPlayer(player) || state.phase === "victory") return undefined;

  if (state.pending) return choosePendingCommand(state, player);
  if (state.phase === "setup") return chooseBestCommand(state, initialCampCandidates(state), player.id)?.command;
  if (state.phase === "prepare" || state.phase === "dice") return { type: "rollDice" };
  if (state.phase !== "action") return { type: "timeoutTurn", expectedPlayerId: player.id, expectedTurn: state.turn };

  const best = chooseBestCommand(state, actionCandidates(state, player), player.id);
  return best && best.value > ACTION_THRESHOLD ? best.command : { type: "endTurn" };
}

export function runAiUntilHuman(state: GameState, limit = 500): { state: GameState; lastCommand?: Command } {
  let nextState = state;
  let lastCommand: Command | undefined;
  for (let step = 0; step < limit && isAiPlayer(activeDecisionPlayer(nextState)); step += 1) {
    nextState = refreshActiveAiStrategy(nextState);
    const command = chooseAiCommand(nextState);
    if (!command) break;
    nextState = applyCommand(nextState, command);
    lastCommand = command;
  }
  return { state: nextState, lastCommand };
}

// 只推进当前 AI 的一个决策,供 UI 逐步播放动画(掷骰轮盘、建造等)使用,
// 避免把整个 AI 回合一次性算完后直接闪到下一个玩家。
export function stepAiOnce(state: GameState): { state: GameState; command?: Command } {
  if (!isAiPlayer(activeDecisionPlayer(state))) return { state };
  const refreshed = refreshActiveAiStrategy(state);
  const command = chooseAiCommand(refreshed);
  if (!command) return { state: refreshed };
  return { state: applyCommand(refreshed, command), command };
}

export function refreshActiveAiStrategy(state: GameState): GameState {
  const player = activeDecisionPlayer(state);
  if (!player || !isAiPlayer(player) || player.id !== state.currentPlayerId || state.phase === "setup" || state.phase === "victory") {
    return state;
  }
  if (player.aiStrategy?.reviewedTurn === state.turn) return state;

  const next = structuredClone(state);
  const nextPlayer = playerById(next, player.id);
  nextPlayer.aiStrategy = chooseStrategyPlan(next, nextPlayer);
  return next;
}

function choosePendingCommand(state: GameState, player: PlayerState): Command | undefined {
  const pending = state.pending;
  if (!pending) return undefined;

  switch (pending.kind) {
    case "setupRoute":
      return chooseBestCommand(state, initialRouteCandidates(state), player.id)?.command;
    case "chooseResource":
      return { type: "chooseResource", resources: chooseResources(state, player, pending.amount) };
    case "discard":
      return { type: "discardResources", resources: chooseDiscard(state, player, pending.amount) };
    case "moveZombie":
      return { type: "moveZombie", tileId: bestZombieTile(state, player) };
    case "stealResource":
      return {
        type: "stealResource",
        targetPlayerId: [...pending.targetPlayerIds].sort(
          (a, b) =>
            calculateScore(state, b).total - calculateScore(state, a).total ||
            resourceTotal(playerById(state, b).resources) - resourceTotal(playerById(state, a).resources) ||
            a.localeCompare(b)
        )[0]
      };
    case "confirmTrade":
      return { type: "confirmPlayerTrade", accept: shouldAcceptTrade(state, player) };
    case "downgradeFortress":
      return {
        type: "downgradeFortress",
        vertexId: [...pending.vertexIds].sort(
          (a, b) => vertexProductionValue(state, a) - vertexProductionValue(state, b) || a.localeCompare(b)
        )[0]
      };
  }
}

function initialCampCandidates(state: GameState): Candidate[] {
  return legalInitialCampVertices(state).map((vertexId) => ({
    command: { type: "placeInitialCamp", vertexId },
    bonus: scoreVertex(state, vertexId) * 4,
    strategies: ["expansion"]
  }));
}

function initialRouteCandidates(state: GameState): Candidate[] {
  const campVertexId = state.pending?.kind === "setupRoute" ? state.pending.campVertexId : undefined;
  return legalInitialRouteEdges(state).map((edgeId) => ({
    command: { type: "placeInitialRoute", edgeId },
    bonus: routeExpansionValue(state, edgeId, campVertexId) + hiddenTileIdsAroundRoute(state.board, edgeId).length * 35,
    strategies: ["expansion", "supply"]
  }));
}

function actionCandidates(state: GameState, player: PlayerState): Candidate[] {
  const candidates: Candidate[] = [...developmentCardCandidates(state, player)];

  if (player.pieces.fortresses > 0 && hasResources(player.resources, COSTS.fortress)) {
    legalUpgradeVertices(state).forEach((vertexId) => {
      candidates.push({
        command: { type: "upgradeFortress", vertexId },
        bonus: vertexProductionValue(state, vertexId) * 8,
        strategies: ["fortification"]
      });
    });
  }

  if (player.pieces.camps > 0 && hasResources(player.resources, COSTS.camp)) {
    legalBuildVertices(state).forEach((vertexId) => {
      candidates.push({
        command: { type: "buildCamp", vertexId },
        bonus: scoreVertex(state, vertexId) * 6,
        strategies: ["expansion"]
      });
    });
  }

  if (player.pieces.transports > 0 && hasResources(player.resources, COSTS.transport)) {
    legalBuildEdges(state, "transport").forEach((edgeId) => {
      candidates.push({
        command: { type: "buildRoute", edgeId, routeType: "transport" },
        bonus: routeExpansionValue(state, edgeId),
        strategies: ["expansion", "supply"]
      });
    });
  }

  if (player.pieces.convoys > 0 && hasResources(player.resources, COSTS.convoy)) {
    legalBuildEdges(state, "convoy").forEach((edgeId) => {
      candidates.push({
        command: { type: "buildRoute", edgeId, routeType: "convoy" },
        bonus: routeExpansionValue(state, edgeId) + hiddenTileIdsAroundRoute(state.board, edgeId).length * 45,
        strategies: ["expansion", "supply"]
      });
    });
  }

  legalConvoyMoveFromEdges(state).forEach((fromEdgeId) => {
    legalConvoyMoveToEdges(state, fromEdgeId).forEach((toEdgeId) => {
      candidates.push({
        command: { type: "moveConvoy", fromEdgeId, toEdgeId },
        bonus: routeExpansionValue(state, toEdgeId) + hiddenTileIdsAroundRoute(state.board, toEdgeId).length * 55,
        strategies: ["expansion", "supply"]
      });
    });
  });

  if (player.pieces.militia > 0 && hasResources(player.resources, COSTS.militia)) {
    legalRecruitVertices(state).forEach((vertexId) => {
      candidates.push({
        command: { type: "recruitMilitia", vertexId },
        bonus: militiaVertexValue(state, vertexId),
        strategies: ["militia"]
      });
    });
  }

  if (hasResources(player.resources, COSTS.activateMilitia)) {
    player.militia
      .filter((militia) => militia.status === "inactive")
      .forEach((militia) => {
        candidates.push({
          command: { type: "activateMilitia", militiaId: militia.id },
          bonus: 35 + siegeUrgency(state),
          strategies: ["militia"]
        });
      });
  }

  player.militia.forEach((militia) => {
    legalMilitiaMoveVertices(state, militia.id).forEach((toVertexId) => {
      candidates.push({
        command: { type: "moveMilitia", militiaId: militia.id, toVertexId },
        bonus: militiaVertexValue(state, toVertexId) - militiaVertexValue(state, militia.vertexId),
        strategies: ["militia"]
      });
    });
  });

  if (player.pieces.watchtowers > 0 && hasResources(player.resources, COSTS.watchtower)) {
    legalWatchtowerVertices(state).forEach((vertexId) => {
      candidates.push({
        command: { type: "buildWatchtower", vertexId },
        bonus: Math.max(0, resourceTotal(player.resources) - 6) * 12 + vertexProductionValue(state, vertexId),
        strategies: ["fortification"]
      });
    });
  }

  if (state.devDeck.length > 0 && hasResources(player.resources, COSTS.devCard)) {
    candidates.push({ command: { type: "buyDevelopmentCard" }, bonus: 95, strategies: ["development"] });
  }

  legalExpelZombieMilitiaIds(state).forEach((militiaId) => {
    legalExpelZombieTiles(state, militiaId).forEach((toTileId) => {
      const targetPlayerId = strongestAdjacentOpponent(state, player.id, toTileId);
      candidates.push({
        command: { type: "expelZombie", militiaId, toTileId, targetPlayerId },
        bonus: zombieTileValue(state, player, toTileId) + 70,
        strategies: ["militia"]
      });
    });
  });

  candidates.push(...bankTradeCandidates(state, player));
  candidates.push(...playerTradeCandidates(state, player));
  return candidates;
}

function developmentCardCandidates(state: GameState, player: PlayerState): Candidate[] {
  if (player.usedDevCardThisTurn) return [];
  const candidates: Candidate[] = [];
  player.devCards
    .filter((card) => card.type !== "secretBase" && card.purchasedTurn !== state.turn)
    .forEach((card) => {
      if (card.type === "airdrop") {
        candidates.push({ command: { type: "playDevelopmentCard", cardId: card.id }, bonus: 180, strategies: ["development"] });
      } else if (card.type === "zombieApproaches") {
        candidates.push({
          command: { type: "playDevelopmentCard", cardId: card.id },
          bonus: 70 + siegeAdvantage(state, player.id),
          strategies: ["development", "militia"]
        });
      } else if (card.type === "requisition") {
        RESOURCES.forEach((resource) => {
          candidates.push({
            command: { type: "playDevelopmentCard", cardId: card.id, payload: { resource } },
            bonus: opponentResourceTotal(state, player.id, resource) * 18,
            strategies: ["development"]
          });
        });
      } else if (card.type === "merchant") {
        legalMerchantTiles(state).forEach((tileId) => {
          candidates.push({
            command: { type: "playDevelopmentCard", cardId: card.id, payload: { tileId } },
            bonus: merchantTileValue(state, player, tileId),
            strategies: ["development"]
          });
        });
      } else if (card.type === "militiaMobilization") {
        const vertexIds = legalMilitiaMobilizationVertices(state)
          .sort((a, b) => militiaVertexValue(state, b) - militiaVertexValue(state, a) || a.localeCompare(b))
          .slice(0, Math.min(2, player.pieces.militia));
        if (vertexIds.length > 0) {
          candidates.push({
            command: { type: "playDevelopmentCard", cardId: card.id, payload: { vertexIds } },
            bonus: vertexIds.length * 90 + siegeUrgency(state),
            strategies: ["militia", "development"]
          });
        }
      } else if (card.type === "roadCrew") {
        const routes = bestRoadCrewRoutes(state);
        if (routes.length > 0) {
          candidates.push({
            command: { type: "playDevelopmentCard", cardId: card.id, payload: { routes } },
            bonus: routes.reduce((total, route) => total + routeExpansionValue(state, route.edgeId), 0),
            strategies: ["supply", "development"]
          });
        }
      }
    });
  return candidates;
}

function bestRoadCrewRoutes(state: GameState): Array<{ edgeId: string; routeType: "transport" }> {
  const first = legalDevelopmentRouteEdges(state)
    .map((edgeId) => ({ edgeId, value: routeExpansionValue(state, edgeId) }))
    .sort((a, b) => b.value - a.value || a.edgeId.localeCompare(b.edgeId))[0];
  if (!first) return [];
  const firstRoute = { edgeId: first.edgeId, routeType: "transport" as const };
  const second = legalDevelopmentRouteEdges(state, "transport", [firstRoute])
    .map((edgeId) => ({ edgeId, value: routeExpansionValue(state, edgeId) }))
    .sort((a, b) => b.value - a.value || a.edgeId.localeCompare(b.edgeId))[0];
  return second ? [firstRoute, { edgeId: second.edgeId, routeType: "transport" }] : [firstRoute];
}

function bankTradeCandidates(state: GameState, player: PlayerState): Candidate[] {
  const before = resourcePositionValue(state, player);
  const candidates: Candidate[] = [];
  RESOURCES.forEach((give) => {
    RESOURCES.filter((receive) => receive !== give).forEach((receive) => {
      ([2, 3, 4] as const).forEach((rate) => {
        if (player.resources[give] < rate) return;
        const command: Command = { type: "bankTrade", give, receive, rate };
        const next = safelyApply(state, command);
        if (!next) return;
        const nextPlayer = playerById(next, player.id);
        const improvement = resourcePositionValue(next, nextPlayer) - before;
        if (improvement > 0) candidates.push({ command, bonus: improvement * 0.55, strategies: [player.aiStrategy?.kind ?? "expansion"] });
      });
    });
  });
  return candidates;
}

// AI 主动向其他玩家(含人类)提议换资源:用自己冗余的资源换取战略计划所缺的资源。
// 只生成"对手有理由接受"的报价,并按预计成交概率给候选打分。
function playerTradeCandidates(state: GameState, player: PlayerState): Candidate[] {
  const opponents = state.players.filter((item) => item.id !== player.id);
  if (opponents.length === 0) return [];
  const alreadyOffered = player.tradeOffersThisTurn ?? [];
  if (alreadyOffered.length >= MAX_TRADE_OFFERS_PER_TURN) return [];

  const needed = neededResources(state, player);
  const surplus = surplusResources(state, player);
  if (needed.length === 0 || surplus.length === 0) return [];

  const baseValue = evaluateState(state, player.id);
  const basePosition = resourcePositionValue(state, player);
  const candidates: Candidate[] = [];

  needed.forEach((receive) => {
    surplus.forEach((give) => {
      if (give === receive) return;
      // 1:1 更划算,2:1 更容易被接受;两种都生成,交由打分权衡。
      ([1, 2] as const).forEach((giveAmount) => {
        if (player.resources[give] < giveAmount) return;
        const offer = { [give]: giveAmount } as Partial<Resources>;
        const request = { [receive]: 1 } as Partial<Resources>;
        if (alreadyOffered.includes(tradeOfferSignature(undefined, offer, request))) return;

        // playerTrade 只会先生成待确认状态,资源不会立即变动,evaluateState 几乎无差异;
        // 因此按"交易达成后"的假想状态评估完整收益,并比照银行交易的加成结构补偿待确认带来的折损。
        const settled = simulateCompletedTrade(state, player.id, offer, request);
        if (!settled) return;
        const settledPlayer = playerById(settled, player.id);
        const evalImprovement = evaluateState(settled, player.id) - baseValue;
        const positionImprovement = resourcePositionValue(settled, settledPlayer) - basePosition;
        if (evalImprovement <= 0) return;

        // 估计成交概率:任何对手愿意接受即可成交;偏向不显著资敌领先者。
        const willingOpponents = opponents.filter((opponent) =>
          opponent.controller === "ai"
            ? wouldAcceptTrade(state, opponent, player.id, offer, request)
            : hasResources(opponent.resources, request)
        );
        if (willingOpponents.length === 0) return;
        const aiWilling = willingOpponents.some((opponent) => opponent.controller === "ai");
        // AI 对手会接受 => 高把握;只有人类"有资源"=> 中性把握(人类可能拒绝)。
        const dealConfidence = aiWilling ? 0.92 : 0.55;
        // 给出 2 个资源换 1 个会略微削弱手牌厚度,轻微惩罚。
        const thicknessPenalty = (giveAmount - 1) * 18;

        candidates.push({
          command: { type: "playerTrade", offer, request },
          bonus: (evalImprovement + positionImprovement * 0.55) * dealConfidence - thicknessPenalty,
          strategies: [player.aiStrategy?.kind ?? "expansion"]
        });
      });
    });
  });

  return candidates;
}

// 构造"交易达成"后的假想状态:回应方按 offer/request 换给当前玩家,
// 用于评估玩家交易对自身的完整收益(不修改真实状态)。
function simulateCompletedTrade(
  state: GameState,
  playerId: string,
  offer: Partial<Resources>,
  request: Partial<Resources>
): GameState | undefined {
  const responder = state.players.find(
    (item) => item.id !== playerId && hasResources(item.resources, request)
  );
  if (!responder) return undefined;
  const next = structuredClone(state);
  const actor = playerById(next, playerId);
  const counterparty = playerById(next, responder.id);
  actor.resources = addResources(subtractResources(actor.resources, offer), request);
  counterparty.resources = addResources(subtractResources(counterparty.resources, request), offer);
  return next;
}

// 战略计划当前最缺、且自己持有为 0 或不足的资源(按需求强度排序,取前若干种)。
function neededResources(state: GameState, player: PlayerState): Resource[] {
  const plans = strategicResourcePlans(state, player).sort((a, b) => b.priority - a.priority);
  const topPlans = plans.slice(0, 2);
  const deficit = new Map<Resource, number>();
  topPlans.forEach((plan) => {
    RESOURCES.forEach((resource) => {
      const required = plan.cost[resource] ?? 0;
      const missing = Math.max(0, required - player.resources[resource]);
      if (missing > 0) deficit.set(resource, (deficit.get(resource) ?? 0) + missing * plan.priority);
    });
  });
  return [...deficit.entries()].sort((a, b) => b[1] - a[1]).map(([resource]) => resource);
}

// 对当前战略计划没有用处、且持有量较多的冗余资源。
function surplusResources(state: GameState, player: PlayerState): Resource[] {
  const plans = strategicResourcePlans(state, player);
  const requiredFor = new Map<Resource, number>();
  plans.forEach((plan) => {
    RESOURCES.forEach((resource) => {
      const required = plan.cost[resource] ?? 0;
      if (required > 0) requiredFor.set(resource, Math.max(requiredFor.get(resource) ?? 0, required));
    });
  });
  return RESOURCES.filter((resource) => {
    const keep = requiredFor.get(resource) ?? 0;
    return player.resources[resource] > keep;
  }).sort((a, b) => player.resources[b] - player.resources[a]);
}

function chooseBestCommand(
  state: GameState,
  candidates: Candidate[],
  playerId: string
): { command: Command; value: number } | undefined {
  const before = evaluateState(state, playerId);
  return candidates
    .map((candidate) => {
      const next = safelyApply(state, candidate.command);
      return next
        ? {
            command: candidate.command,
            value:
              evaluateState(next, playerId) -
              before +
              (candidate.bonus ?? 0) +
              strategyCandidateBonus(state, playerId, candidate)
          }
        : undefined;
    })
    .filter((candidate): candidate is { command: Command; value: number } => Boolean(candidate))
    .sort((a, b) => b.value - a.value || commandKey(a.command).localeCompare(commandKey(b.command)))[0];
}

function chooseStrategyPlan(state: GameState, player: PlayerState): AiStrategyPlan {
  const scores = strategyOpportunityScores(state, player);
  const ranked = (Object.entries(scores) as Array<[AiStrategyKind, number]>).sort(
    ([kindA, scoreA], [kindB, scoreB]) => scoreB - scoreA || kindA.localeCompare(kindB)
  );
  const [bestKind, bestScore] = ranked[0];
  const current = player.aiStrategy;
  if (!current) return newStrategyPlan(state, player, bestKind);

  const currentProgress = strategyProgress(state, player, current.kind);
  const progressed = currentProgress > current.progress + 0.5;
  const lastProgressTurn = progressed ? state.turn : current.lastProgressTurn;
  const stalled = state.turn - lastProgressTurn >= state.players.length * STRATEGY_COMMITMENT_ROUNDS;
  const currentScore = scores[current.kind];
  const currentInvalid = currentScore < -5_000;
  const committed = state.turn < current.commitmentUntilTurn && !stalled;
  const leaderScore = Math.max(...state.players.filter((item) => item.id !== player.id).map((item) => calculateScore(state, item.id).total));
  const emergency = leaderScore >= VICTORY_POINTS_TO_WIN - 2 || state.zombieTrack >= 5;
  const switchMargin = currentInvalid ? -Infinity : stalled || emergency ? 20 : committed ? STRATEGY_COMMITTED_SWITCH_MARGIN : STRATEGY_SWITCH_MARGIN;

  if (bestKind !== current.kind && bestScore > currentScore + switchMargin) {
    return newStrategyPlan(state, player, bestKind);
  }

  return {
    ...current,
    reviewedTurn: state.turn,
    progress: currentProgress,
    lastProgressTurn
  };
}

function newStrategyPlan(state: GameState, player: PlayerState, kind: AiStrategyKind): AiStrategyPlan {
  return {
    kind,
    chosenTurn: state.turn,
    reviewedTurn: state.turn,
    commitmentUntilTurn: state.turn + state.players.length * STRATEGY_COMMITMENT_ROUNDS,
    progress: strategyProgress(state, player, kind),
    lastProgressTurn: state.turn
  };
}

function strategyOpportunityScores(state: GameState, player: PlayerState): Record<AiStrategyKind, number> {
  const score = calculateScore(state, player.id).total;
  const buildings = Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === player.id);
  const camps = buildings.filter((vertex) => vertex.building?.type === "camp").length;
  const fortresses = buildings.length - camps;
  const supply = longestSupplyLength(state.board, player.id);
  const strongestOpponentMilitia = Math.max(
    0,
    ...state.players.filter((item) => item.id !== player.id).map((item) => item.militia.length)
  );
  const resourcePlanValue = (cost: Partial<Resources>) => costProgress(player.resources, cost) * 100;
  const nearVictory = score >= VICTORY_POINTS_TO_WIN - 4 ? 100 : 0;

  return {
    expansion:
      player.pieces.camps > 0
        ? 190 + countReachableCampSpots(state, player.id) * 32 + resourcePlanValue(COSTS.camp) + (score < 7 ? 55 : 0)
        : -10_000,
    fortification:
      player.pieces.fortresses > 0 && camps > 0
        ? 165 + camps * 38 + resourcePlanValue(COSTS.fortress) + fortresses * 18 + nearVictory
        : -10_000,
    supply:
      player.pieces.transports > 0 || player.pieces.convoys > 0
        ? 145 + Math.max(0, 6 - supply) * 42 + resourcePlanValue(COSTS.transport) + (state.awards.longestSupply?.playerId === player.id ? 70 : 0)
        : -10_000,
    militia:
      player.pieces.militia > 0 || player.militia.length > 0
        ? 135 +
          Math.max(0, strongestOpponentMilitia + 1 - player.militia.length) * 55 +
          resourcePlanValue(COSTS.militia) +
          siegeUrgency(state) * 2 +
          (state.awards.strongestMilitia?.playerId === player.id ? 70 : 0)
        : -10_000,
    development:
      state.devDeck.length > 0 || player.devCards.some((card) => card.type !== "secretBase")
        ? 125 +
          resourcePlanValue(COSTS.devCard) +
          player.devCards.length * 20 +
          (score >= VICTORY_POINTS_TO_WIN - 3 ? 90 : 0)
        : -10_000
  };
}

function strategyProgress(state: GameState, player: PlayerState, kind: AiStrategyKind): number {
  const buildings = Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === player.id);
  const routes = Object.values(state.board.edges).filter((edge) => edge.route?.ownerId === player.id).length;
  switch (kind) {
    case "expansion":
      return buildings.length * 100 + routes * 8 + countReachableCampSpots(state, player.id) * 12;
    case "fortification":
      return (
        buildings.filter((vertex) => vertex.building?.type === "fortress").length * 120 +
        buildings.filter((vertex) => vertex.watchtowerOwnerId === player.id).length * 25 +
        buildings.reduce((total, vertex) => total + vertexProductionValue(state, vertex.id), 0)
      );
    case "supply":
      return longestSupplyLength(state.board, player.id) * 100 + routes * 10;
    case "militia":
      return (
        player.militia.length * 100 +
        player.militia.filter((militia) => militia.status === "active").length * 25 +
        player.defenderTokens * 160
      );
    case "development":
      return (
        player.devCards.length * 35 +
        player.devCards.filter((card) => card.type === "secretBase").length * 120 +
        (state.merchant.controllerId === player.id ? 100 : 0)
      );
  }
}

function strategyCandidateBonus(state: GameState, playerId: string, candidate: Candidate): number {
  const plan = playerById(state, playerId).aiStrategy;
  if (!plan || !candidate.strategies?.includes(plan.kind)) return 0;
  const committed = state.turn < plan.commitmentUntilTurn;
  return committed ? 125 : 75;
}

function safelyApply(state: GameState, command: Command): GameState | undefined {
  try {
    return applyCommand(state, command);
  } catch {
    return undefined;
  }
}

function evaluateState(state: GameState, playerId: string): number {
  const player = playerById(state, playerId);
  const score = calculateScore(state, playerId);
  const opponentScore = Math.max(
    0,
    ...state.players.filter((item) => item.id !== playerId).map((item) => calculateScore(state, item.id).total)
  );
  const ownBuildings = Object.values(state.board.vertices).filter((vertex) => vertex.building?.ownerId === playerId);
  const watchtowers = ownBuildings.filter((vertex) => vertex.watchtowerOwnerId === playerId).length;
  const hiddenSecretBases = player.devCards.filter((card) => card.type === "secretBase" && !card.revealed).length;
  const production = ownBuildings.reduce((total, vertex) => total + vertexProductionValue(state, vertex.id), 0);
  const resourceDiversity = new Set(
    ownBuildings.flatMap((vertex) => vertex.tileIds.map((tileId) => tileResource(state.board.tiles[tileId])).filter(Boolean))
  ).size;
  const activeMilitia = player.militia.filter((militia) => militia.status === "active").length;
  const readyMilitia = player.militia.filter((militia) => militia.status === "readying").length;
  const supplyLength = longestSupplyLength(state.board, playerId);
  const reachableCampSpots = countReachableCampSpots(state, playerId);

  if (state.winnerId === playerId) return 1_000_000;
  if (state.winnerId && state.winnerId !== playerId) return -1_000_000;

  return (
    score.total * 1_200 +
    hiddenSecretBases * 950 +
    production * 18 +
    resourceDiversity * 32 +
    supplyLength * 48 +
    Math.max(0, 5 - supplyLength) * -4 +
    player.militia.length * 54 +
    activeMilitia * 28 +
    readyMilitia * 12 +
    watchtowers * 28 +
    reachableCampSpots * 20 +
    resourcePositionValue(state, player) +
    resourceTotal(player.resources) * 3 -
    opponentScore * 95
  );
}

function resourcePositionValue(state: GameState, player: PlayerState): number {
  const plans = strategicResourcePlans(state, player);
  const progress = plans
    .map((plan) => plan.priority * costProgress(player.resources, plan.cost))
    .sort((a, b) => b - a);
  return (progress[0] ?? 0) + (progress[1] ?? 0) * 0.3;
}

function strategicResourcePlans(state: GameState, player: PlayerState): ResourcePlan[] {
  const hasCamp = Object.values(state.board.vertices).some(
    (vertex) => vertex.building?.ownerId === player.id && vertex.building.type === "camp"
  );
  return [
    ...(player.pieces.camps > 0 ? [{ cost: COSTS.camp, priority: strategyResourcePriority(player, "expansion", 330) }] : []),
    ...(player.pieces.fortresses > 0 && hasCamp
      ? [{ cost: COSTS.fortress, priority: strategyResourcePriority(player, "fortification", 300) }]
      : []),
    ...(player.pieces.transports > 0
      ? [{ cost: COSTS.transport, priority: strategyResourcePriority(player, "supply", 155) }]
      : []),
    ...(player.pieces.militia > 0 ? [{ cost: COSTS.militia, priority: strategyResourcePriority(player, "militia", 145) }] : []),
    ...(player.militia.some((militia) => militia.status === "inactive")
      ? [{ cost: COSTS.activateMilitia, priority: strategyResourcePriority(player, "militia", 115 + siegeUrgency(state)) }]
      : []),
    ...(state.devDeck.length > 0 ? [{ cost: COSTS.devCard, priority: strategyResourcePriority(player, "development", 135) }] : []),
    ...(player.pieces.convoys > 0 ? [{ cost: COSTS.convoy, priority: strategyResourcePriority(player, "expansion", 105) }] : []),
    ...(player.pieces.watchtowers > 0
      ? [{ cost: COSTS.watchtower, priority: strategyResourcePriority(player, "fortification", 70) }]
      : [])
  ];
}

function strategyResourcePriority(player: PlayerState, kind: AiStrategyKind, base: number): number {
  return player.aiStrategy?.kind === kind ? base + 150 : base;
}

function costProgress(resources: Resources, cost: Partial<Resources>): number {
  const total = resourceTotal(cost);
  if (total === 0) return 0;
  const covered = RESOURCES.reduce((sum, resource) => sum + Math.min(resources[resource], cost[resource] ?? 0), 0);
  return covered / total + (hasResources(resources, cost) ? 0.22 : 0);
}

function chooseResources(state: GameState, player: PlayerState, amount: number): Resources {
  const result = createResources();
  let virtualPlayer = { ...player, resources: { ...player.resources } };
  for (let index = 0; index < amount; index += 1) {
    const resource = [...RESOURCES].sort((a, b) => {
      const withA = { ...virtualPlayer, resources: addResources(virtualPlayer.resources, { [a]: 1 }) };
      const withB = { ...virtualPlayer, resources: addResources(virtualPlayer.resources, { [b]: 1 }) };
      return resourcePositionValue(state, withB) - resourcePositionValue(state, withA) || a.localeCompare(b);
    })[0];
    result[resource] += 1;
    virtualPlayer = { ...virtualPlayer, resources: addResources(virtualPlayer.resources, { [resource]: 1 }) };
  }
  return result;
}

function chooseDiscard(state: GameState, player: PlayerState, amount: number): Resources {
  const result = createResources();
  let virtualPlayer = { ...player, resources: { ...player.resources } };
  for (let index = 0; index < amount; index += 1) {
    const resource = [...RESOURCES]
      .filter((item) => virtualPlayer.resources[item] > 0)
      .sort((a, b) => {
        const withoutA = { ...virtualPlayer, resources: subtractResources(virtualPlayer.resources, { [a]: 1 }) };
        const withoutB = { ...virtualPlayer, resources: subtractResources(virtualPlayer.resources, { [b]: 1 }) };
        return resourcePositionValue(state, withoutB) - resourcePositionValue(state, withoutA) || virtualPlayer.resources[b] - virtualPlayer.resources[a] || a.localeCompare(b);
      })[0];
    if (!resource) break;
    result[resource] += 1;
    virtualPlayer = { ...virtualPlayer, resources: subtractResources(virtualPlayer.resources, { [resource]: 1 }) };
  }
  return result;
}

function shouldAcceptTrade(state: GameState, player: PlayerState): boolean {
  const pending = state.pending;
  if (pending?.kind !== "confirmTrade") return false;
  return wouldAcceptTrade(state, player, pending.actorId, pending.offer, pending.request);
}

// 从回应方角度评估一笔交易是否值得接受:收到 offer、付出 request。
// 同时被 AI 用来预判对手会不会接受自己将要提出的交易。
function wouldAcceptTrade(
  state: GameState,
  responder: PlayerState,
  actorId: string,
  offer: Partial<Resources>,
  request: Partial<Resources>
): boolean {
  if (!hasResources(responder.resources, request)) return false;
  const nextResources = addResources(subtractResources(responder.resources, request), offer);
  const before = resourcePositionValue(state, responder) + resourceTotal(responder.resources) * 3;
  const afterPlayer = { ...responder, resources: nextResources };
  const after = resourcePositionValue(state, afterPlayer) + resourceTotal(nextResources) * 3;
  const actorThreat = calculateScore(state, actorId).total - calculateScore(state, responder.id).total;
  return after >= before + Math.max(4, actorThreat * 8);
}

function bestZombieTile(state: GameState, player: PlayerState): string {
  return (
    Object.values(state.board.tiles)
      .filter((tile) => tile.revealed && tile.id !== state.zombieTileId)
      .map((tile) => ({ tileId: tile.id, score: zombieTileValue(state, player, tile.id) }))
      .sort((a, b) => b.score - a.score || a.tileId.localeCompare(b.tileId))[0]?.tileId ?? state.zombieTileId
  );
}

function zombieTileValue(state: GameState, player: PlayerState, tileId: string): number {
  const opponents = state.players.filter((item) => item.id !== player.id);
  const opponentPressure = opponents.reduce((total, opponent) => {
    const production = playerProductionAtTile(state, opponent.id, tileId);
    const threat = calculateScore(state, opponent.id).total;
    return total + production * 22 + (production > 0 ? threat * 16 : 0);
  }, 0);
  const ownPenalty = playerProductionAtTile(state, player.id, tileId) * 34;
  const stealValue = adjacentPlayersToTile(state.board, tileId)
    .filter((id) => id !== player.id)
    .reduce((total, id) => total + Math.min(12, resourceTotal(playerById(state, id).resources) * 2), 0);
  return opponentPressure + stealValue - ownPenalty;
}

function scoreVertex(state: GameState, vertexId: string): number {
  const tiles = state.board.vertices[vertexId].tileIds.map((tileId) => state.board.tiles[tileId]);
  const resources = new Set(tiles.map((tile) => TILE_RESOURCE[tile.hiddenType]).filter(Boolean));
  return (
    tiles.reduce((score, tile) => score + (tile.revealed ? NUMBER_WEIGHTS[tile.number ?? 0] ?? 0 : 1), 0) +
    resources.size * 3 +
    tiles.filter((tile) => tile.hiddenType === "warehouse").length * 3 +
    tiles.length
  );
}

function vertexProductionValue(state: GameState, vertexId: string): number {
  const vertex = state.board.vertices[vertexId];
  if (!vertex) return 0;
  return vertex.tileIds.reduce((total, tileId) => {
    const tile = state.board.tiles[tileId];
    if (!tile.revealed || tile.id === state.zombieTileId) return total;
    if (tile.hiddenType === "warehouse") return total + 4;
    return total + (NUMBER_WEIGHTS[tile.number ?? 0] ?? 0);
  }, 0);
}

function playerProductionAtTile(state: GameState, playerId: string, tileId: string): number {
  const tile = state.board.tiles[tileId];
  const weight = tile.hiddenType === "warehouse" ? 4 : NUMBER_WEIGHTS[tile.number ?? 0] ?? 0;
  return Object.values(state.board.vertices)
    .filter((vertex) => vertex.tileIds.includes(tileId) && vertex.building?.ownerId === playerId)
    .reduce((total, vertex) => total + weight * (vertex.building?.type === "fortress" ? 2 : 1), 0);
}

function routeExpansionValue(state: GameState, edgeId: string, ignoredVertexId?: string): number {
  const edge = state.board.edges[edgeId];
  if (!edge) return 0;
  const endpointValue = edge.vertexIds
    .filter((vertexId) => vertexId !== ignoredVertexId)
    .reduce((total, vertexId) => total + (state.board.vertices[vertexId].building ? 0 : scoreVertex(state, vertexId) * 2), 0);
  return endpointValue + hiddenTileIdsAroundRoute(state.board, edgeId).length * 35;
}

function militiaVertexValue(state: GameState, vertexId: string): number {
  const vertex = state.board.vertices[vertexId];
  if (!vertex) return 0;
  return vertexProductionValue(state, vertexId) * 3 + (vertex.tileIds.includes(state.zombieTileId) ? 55 : 0);
}

function merchantTileValue(state: GameState, player: PlayerState, tileId: string): number {
  const resource = tileResource(state.board.tiles[tileId]);
  if (!resource) return 0;
  const scarcity = Math.max(0, 3 - player.resources[resource]) * 12;
  return playerProductionAtTile(state, player.id, tileId) * 8 + scarcity;
}

function siegeUrgency(state: GameState): number {
  return state.zombieTrack * 14;
}

function siegeAdvantage(state: GameState, playerId: string): number {
  const ownActive = playerById(state, playerId).militia.filter((militia) => militia.status === "active").length;
  const bestOpponent = Math.max(
    0,
    ...state.players.filter((player) => player.id !== playerId).map((player) => player.militia.filter((militia) => militia.status === "active").length)
  );
  return (ownActive - bestOpponent) * 40 - (state.zombieTrack >= 5 && ownActive === 0 ? 180 : 0);
}

function countReachableCampSpots(state: GameState, playerId: string): number {
  return Object.values(state.board.vertices).filter(
    (vertex) =>
      !vertex.building &&
      vertex.edgeIds.some((edgeId) => state.board.edges[edgeId].route?.ownerId === playerId) &&
      vertex.tileIds.some((tileId) => Boolean(tileResource(state.board.tiles[tileId])))
  ).length;
}

function strongestAdjacentOpponent(state: GameState, playerId: string, tileId: string): string | undefined {
  return adjacentPlayersToTile(state.board, tileId)
    .filter((id) => id !== playerId)
    .sort(
      (a, b) =>
        calculateScore(state, b).total - calculateScore(state, a).total ||
        resourceTotal(playerById(state, b).resources) - resourceTotal(playerById(state, a).resources) ||
        a.localeCompare(b)
    )[0];
}

function playerById(state: GameState, playerId: string): PlayerState {
  return state.players.find((player) => player.id === playerId)!;
}

function opponentResourceTotal(state: GameState, playerId: string, resource: Resource): number {
  return state.players
    .filter((player) => player.id !== playerId)
    .reduce((total, player) => total + player.resources[resource], 0);
}

function commandKey(command: Command): string {
  return JSON.stringify(command);
}
