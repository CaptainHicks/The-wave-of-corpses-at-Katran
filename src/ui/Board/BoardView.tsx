import { memo, useMemo, type Dispatch, type SetStateAction } from "react";
import { COSTS } from "../../domain/constants";
import {
  adjacentTileIds,
  edgeConnectedToPlayerNetwork,
  isBlackMarketVisible,
  isResourceTile,
  routeTypeAllowedOnEdge,
  vertexConnectedToPlayerNetwork,
  vertexHasAdjacentBuilding,
  vertexTouchesInitialResourceZone,
  vertexTouchesOnlyRevealed,
  vertexTouchesResource,
  vertexTouchesWarehouse
} from "../../domain/board";
import {
  legalBuildEdges,
  legalBuildVertices,
  legalConvoyMoveFromEdges,
  legalConvoyMoveToEdges,
  legalDevelopmentRouteEdges,
  legalExpelZombieTiles,
  legalInitialCampVertices,
  legalInitialRouteEdges,
  legalMerchantTiles,
  legalMilitiaMobilizationVertices,
  legalMilitiaMoveVertices,
  legalRecruitVertices,
  legalUpgradeVertices,
  legalWatchtowerVertices
} from "../../domain/rules";
import type { BoardState, Command, GameState, Resources, RouteType, TileState } from "../../domain/types";
import type { GameAnimationEvent } from "../animation/animationTypes";
import type { UiSelection, UiTool } from "../gameUiTypes";
import { BlackMarketMarker } from "./BlackMarketMarker";
import { BoardAnimationLayer } from "./BoardAnimationLayer";
import { EdgeRoute } from "./EdgeRoute";
import { HexTile } from "./HexTile";
import { PieceVividFilters } from "./PieceVividFilters";
import { VertexToken } from "./VertexToken";
import { useCoarsePointer } from "../useCoarsePointer";

type LargeResourceZoneSide = "left" | "center" | "right";

function largeResourceZoneComponents(board: BoardState): TileState[][] {
  const remaining = new Set(
    Object.values(board.tiles)
      .filter((tile) => tile.cluster === "large")
      .map((tile) => tile.id)
  );
  const components: TileState[][] = [];

  while (remaining.size > 0) {
    const start = [...remaining][0]!;
    const stack = [start];
    const component: TileState[] = [];
    remaining.delete(start);

    while (stack.length > 0) {
      const tileId = stack.pop()!;
      component.push(board.tiles[tileId]);
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

function classifyLargeResourceZone(component: TileState[], boardCenterX: number): LargeResourceZoneSide {
  const xs = component.map((tile) => tile.x);
  if (Math.max(...xs) < boardCenterX) return "left";
  if (Math.min(...xs) > boardCenterX) return "right";
  return "center";
}

export function describeInitialCampResourceZone(board: BoardState): string {
  const components = largeResourceZoneComponents(board);
  if (components.length === 0) return "任意资源区";

  const occupiedTiles = Object.values(board.tiles).filter((tile) => tile.cluster !== "empty");
  const occupiedXs = occupiedTiles.map((tile) => tile.x);
  const boardCenterX = (Math.min(...occupiedXs) + Math.max(...occupiedXs)) / 2;
  const sides = [...new Set(components.map((component) => classifyLargeResourceZone(component, boardCenterX)))];

  if (sides.includes("left") && sides.includes("right") && !sides.includes("center")) {
    return "左右两侧的大资源区";
  }

  if (sides.length > 1) {
    const orderedSides = ["left", "center", "right"].filter((side): side is LargeResourceZoneSide =>
      sides.includes(side as LargeResourceZoneSide)
    );
    const sideLabels: Record<LargeResourceZoneSide, string> = {
      left: "左侧",
      center: "中部",
      right: "右侧"
    };
    return `${orderedSides.map((side) => sideLabels[side]).join("和")}的大资源区`;
  }

  if (sides[0] === "left") return "左侧大资源区";
  if (sides[0] === "right") return "右侧大资源区";
  return "中部大资源区";
}

function BoardViewImpl({
  state,
  tool,
  selection,
  canInteract = true,
  animationEvents = [],
  setSelection,
  reportError,
  submit
}: {
  state: GameState;
  tool: UiTool;
  selection?: UiSelection;
  canInteract?: boolean;
  animationEvents?: GameAnimationEvent[];
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  reportError?: (message: string) => void;
  submit: (command: Command) => void;
}) {
  const isCoarsePointer = useCoarsePointer();
  const bounds = useMemo(() => {
    const vertices = Object.values(state.board.vertices);
    const xs = vertices.map((vertex) => vertex.x);
    const ys = vertices.map((vertex) => vertex.y);
    const minX = Math.min(...xs) - 30;
    const minY = Math.min(...ys) - 30;
    const maxX = Math.max(...xs) + 30;
    const maxY = Math.max(...ys) + 30;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [state.board.vertices]);

  const legalInitialCamps = new Set(canInteract ? legalInitialCampVertices(state) : []);
  const legalInitialRoutes = new Set(canInteract ? legalInitialRouteEdges(state) : []);
  const legalTransportEdges = new Set(canInteract ? legalBuildEdges(state, "transport") : []);
  const legalConvoyEdges = new Set(canInteract ? legalBuildEdges(state, "convoy") : []);
  const legalCampVertices = new Set(canInteract ? legalBuildVertices(state) : []);
  const legalUpgradeVertexSet = new Set(canInteract ? legalUpgradeVertices(state) : []);
  const legalWatchtowerVertexSet = new Set(canInteract ? legalWatchtowerVertices(state) : []);
  const legalRecruitVertexSet = new Set(canInteract ? legalRecruitVertices(state) : []);
  const legalMoveConvoyFromSet = new Set(canInteract ? legalConvoyMoveFromEdges(state) : []);
  const legalMoveConvoyToSet = new Set(
    canInteract && selection?.kind === "moveConvoy" && selection.fromEdgeId
      ? legalConvoyMoveToEdges(state, selection.fromEdgeId)
      : []
  );
  const legalMoveMilitiaVertexSet = new Set(
    canInteract && selection?.kind === "moveMilitia" && selection.militiaId
      ? legalMilitiaMoveVertices(state, selection.militiaId)
      : []
  );
  const legalExpelZombieTileSet = new Set(
    canInteract && selection?.kind === "expelZombie" ? legalExpelZombieTiles(state, selection.militiaId) : []
  );
  const legalMerchantTileSet = new Set(
    canInteract && selection?.kind === "devMerchant" ? legalMerchantTiles(state) : []
  );
  const legalDevMilitiaVertexSet = new Set(
    canInteract && selection?.kind === "devMilitia" ? legalMilitiaMobilizationVertices(state) : []
  );
  const legalDevRouteEdgeSet = new Set(
    canInteract && selection?.kind === "devRoadCrew"
      ? legalDevelopmentRouteEdges(state, selection.routeType, selection.routes)
      : []
  );
  const legalDowngradeFortressVertexSet = new Set(
    canInteract && state.pending?.kind === "downgradeFortress" ? state.pending.vertexIds : []
  );
  const selectedDevRouteEdgeSet = new Set(
    selection?.kind === "devRoadCrew" ? selection.routes.map((route) => route.edgeId) : []
  );
  const selectedDevMilitiaVertexIds = selection?.kind === "devMilitia" ? selection.vertexIds : [];
  const canUseNormalBoardTools = canInteract && !state.pending && state.phase === "action";
  const actingPlayerId = canInteract ? state.pending?.playerId ?? state.currentPlayerId : undefined;
  const actingPlayer = state.players.find((player) => player.id === actingPlayerId);
  const legalActivateMilitiaVertexSet = new Set(
    canUseNormalBoardTools && tool === "activateMilitia" && actingPlayer
      ? actingPlayer.militia.filter((militia) => militia.status === "inactive").map((militia) => militia.vertexId)
      : []
  );
  const selectableMoveMilitiaByVertex = new Map<string, string>();
  if (canInteract && selection?.kind === "moveMilitia" && !selection.militiaId && actingPlayer) {
    actingPlayer.militia
      .filter((militia) => legalMilitiaMoveVertices(state, militia.id).length > 0)
      .forEach((militia) => {
        if (!selectableMoveMilitiaByVertex.has(militia.vertexId)) {
          selectableMoveMilitiaByVertex.set(militia.vertexId, militia.id);
        }
      });
  }
  const selectableMoveMilitiaVertexSet = new Set(selectableMoveMilitiaByVertex.keys());
  const legalTileOutlineIds = [...legalMerchantTileSet].filter((tileId) => state.board.tiles[tileId]);
  const hasCost = (cost: Partial<Resources>) =>
    Boolean(
      actingPlayer &&
        Object.entries(cost).every(([resource, amount]) => actingPlayer.resources[resource as keyof Resources] >= (amount ?? 0))
    );
  const explainInvalidInitialCampPlacement = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!vertex) return "这个交叉点不存在。";
    if (vertex.building) return "这里已经有建筑了。";
    if (vertexHasAdjacentBuilding(state.board, vertexId)) return "营地之间必须至少间隔一个空交叉点。";
    if (!vertexTouchesOnlyRevealed(state.board, vertexId)) return "初始营地不能接触迷雾地块。";
    if (!vertexTouchesResource(state.board, vertexId, true)) return "初始营地必须相邻至少一个公开资源地块。";
    if (!vertexTouchesInitialResourceZone(state.board, vertexId)) return "初始营地只能放在最大资源区。";
    if (vertexTouchesWarehouse(state.board, vertexId)) return "初始营地不能直接相邻废弃仓库。";
    return "这里不能放置初始营地。";
  };
  const explainInvalidRoutePlacement = (edgeId: string, routeType: RouteType) => {
    const edge = state.board.edges[edgeId];
    if (!edge) return "这条边不存在。";
    if (edge.route) return "这条边已经有路线了。";
    if (!actingPlayer) return "当前还不能建造路线。";
    if (!edgeConnectedToPlayerNetwork(state.board, edgeId, actingPlayer.id)) return "路线必须连接自己的网络。";
    if (!routeTypeAllowedOnEdge(state.board, edgeId, routeType)) {
      return routeType === "transport" ? "运输线只能放在资源地块边缘。" : "装甲车队必须放在有效地块边缘。";
    }
    if (routeType === "transport" && actingPlayer.pieces.transports <= 0) return "运输线棋子不足。";
    if (routeType === "convoy" && actingPlayer.pieces.convoys <= 0) return "装甲车队棋子不足。";
    if (!hasCost(routeType === "transport" ? COSTS.transport : COSTS.convoy)) {
      return routeType === "transport" ? "资源不足，无法建造运输线。" : "资源不足，无法建造装甲车队。";
    }
    return routeType === "transport" ? "这里不能建造运输线。" : "这里不能建造装甲车队。";
  };
  const explainInvalidCampConstruction = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!vertex) return "这个交叉点不存在。";
    if (vertex.building) return "这里已经有建筑了。";
    if (vertexHasAdjacentBuilding(state.board, vertexId)) return "营地必须遵守距离规则。";
    if (!actingPlayer) return "当前还不能建造营地。";
    if (!vertexConnectedToPlayerNetwork(state.board, vertexId, actingPlayer.id)) return "新营地必须连接自己的路线。";
    if (!vertexTouchesResource(state.board, vertexId, false)) return "营地必须至少相邻一个资源地块。";
    if (actingPlayer.pieces.camps <= 0) return "营地棋子不足。";
    if (!hasCost(COSTS.camp)) return "资源不足，无法建造营地。";
    return "这里不能建造营地。";
  };
  const explainInvalidFortressUpgrade = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!actingPlayer) return "当前还不能升级堡垒。";
    if (vertex?.building?.ownerId !== actingPlayer.id || vertex.building.type !== "camp") return "只能升级自己的营地。";
    if (actingPlayer.pieces.fortresses <= 0) return "堡垒棋子不足。";
    if (!hasCost(COSTS.fortress)) return "资源不足，无法升级堡垒。";
    return "这里不能升级堡垒。";
  };
  const explainInvalidWatchtowerBuild = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!actingPlayer) return "当前还不能建造哨塔。";
    if (vertex?.building?.ownerId !== actingPlayer.id) return "哨塔必须建在自己的营地或堡垒旁。";
    if (vertex.watchtowerOwnerId) return "该建筑旁已经有哨塔了。";
    if (actingPlayer.pieces.watchtowers <= 0) return "哨塔棋子不足。";
    if (!hasCost(COSTS.watchtower)) return "资源不足，无法建造哨塔。";
    return "这里不能建造哨塔。";
  };
  const explainInvalidRecruit = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!actingPlayer) return "当前还不能征召民兵。";
    if (vertex?.building?.ownerId !== actingPlayer.id) return "民兵必须驻守在自己的营地或堡垒上。";
    const stationed = actingPlayer.militia.filter((militia) => militia.vertexId === vertexId).length;
    if (stationed >= 2) return "每个营地或堡垒最多驻守 2 个民兵。";
    if (actingPlayer.pieces.militia <= 0) return "民兵棋子不足。";
    if (!hasCost(COSTS.militia)) return "资源不足，无法征召民兵。";
    return "这里不能征召民兵。";
  };
  const explainInvalidMilitiaActivation = (vertexId: string) => {
    if (!actingPlayer) return "当前还不能激活民兵。";
    const militiaAtVertex = actingPlayer.militia.filter((item) => item.vertexId === vertexId);
    if (militiaAtVertex.length === 0) return "这里没有可激活的己方民兵。";
    if (!militiaAtVertex.some((item) => item.status === "inactive")) return "这里只有已激活或不可再次激活的民兵。";
    if (!hasCost(COSTS.activateMilitia)) return "资源不足，无法激活民兵。";
    return "这里不能激活民兵。";
  };
  const explainInvalidZombieMove = (tileId: string) => {
    const tile = state.board.tiles[tileId];
    if (!tile) return "目标地块不存在。";
    if (!tile.revealed) return "尸潮不能移动到迷雾地块。";
    return "这里不能移动尸潮。";
  };

  const detailedInitialCampZoneLabel = useMemo(() => describeInitialCampResourceZone(state.board), [state.board]);
  const detailedDistanceRuleHint = "这里离其他建筑太近了，营地之间至少要隔 1 个空交叉点。";
  const explainInitialCampRuleHint = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!vertex) return "这个交叉点不存在。";
    if (vertex.building) return "这里已经有建筑了，初始营地要放在空交叉点。";
    if (vertexHasAdjacentBuilding(state.board, vertexId)) return detailedDistanceRuleHint;
    if (!vertexTouchesOnlyRevealed(state.board, vertexId)) return "这里挨着未翻开的迷雾地块，初始营地不能贴着迷雾放。";
    if (!vertexTouchesResource(state.board, vertexId, true)) return "初始营地必须挨着至少 1 个已翻开的资源地块。";
    if (!vertexTouchesInitialResourceZone(state.board, vertexId)) return `初始营地只能放在${detailedInitialCampZoneLabel}。`;
    if (vertexTouchesWarehouse(state.board, vertexId)) return "初始营地不能紧挨废弃仓库。";
    return "这里不能放置初始营地。";
  };
  const explainInitialRouteRuleHint = (edgeId: string) => {
    const edge = state.board.edges[edgeId];
    const pending = state.pending;
    if (!edge) return "这条边不存在。";
    if (edge.route) return "这里已经有路线了，初始运输线要放在空边上。";
    if (pending?.kind !== "setupRoute") return "当前还不能放置初始运输线。";
    if (!edge.vertexIds.includes(pending.campVertexId)) return "初始运输线必须从刚放下的初始营地伸出。";
    if (!routeTypeAllowedOnEdge(state.board, edgeId, "transport")) return "初始运输线只能沿资源地块边缘铺设。";
    return "这里不能放置初始运输线。";
  };
  const explainRouteRuleHint = (edgeId: string, routeType: RouteType) => {
    const edge = state.board.edges[edgeId];
    if (!edge) return "这条边不存在。";
    if (edge.route) return "这条边已经有路线了。";
    if (!actingPlayer) return routeType === "transport" ? "当前还不能修建运输线。" : "当前还不能部署装甲车队。";
    if (!edgeConnectedToPlayerNetwork(state.board, edgeId, actingPlayer.id)) {
      return routeType === "transport"
        ? "运输线必须从你现有的营地、堡垒或己方路线继续修出去。"
        : "装甲车队必须接在你现有的路线网络上。";
    }
    if (!routeTypeAllowedOnEdge(state.board, edgeId, routeType)) {
      return routeType === "transport"
        ? "运输线只能铺在资源地块边缘，不能铺在纯荒地边。"
        : "装甲车队只能放在棋盘内部的地块边缘。";
    }
    if (routeType === "transport" && actingPlayer.pieces.transports <= 0) return "你的运输线棋子已经用完了。";
    if (routeType === "convoy" && actingPlayer.pieces.convoys <= 0) return "你的装甲车队棋子已经用完了。";
    if (!hasCost(routeType === "transport" ? COSTS.transport : COSTS.convoy)) {
      return routeType === "transport" ? "资源不够，无法修建运输线。" : "资源不够，无法部署装甲车队。";
    }
    return routeType === "transport" ? "这里不能修建运输线。" : "这里不能部署装甲车队。";
  };
  const explainCampRuleHint = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!vertex) return "这个交叉点不存在。";
    if (vertex.building) return "这里已经有建筑了，不能再建营地。";
    if (vertexHasAdjacentBuilding(state.board, vertexId)) return detailedDistanceRuleHint;
    if (!actingPlayer) return "当前还不能建造营地。";
    if (!vertexConnectedToPlayerNetwork(state.board, vertexId, actingPlayer.id)) {
      return "新营地必须连到你自己的路线，不能隔空建造。";
    }
    if (!vertexTouchesResource(state.board, vertexId, false)) {
      return "营地必须挨着至少 1 个资源地块，不能建在纯荒地交叉点。";
    }
    if (actingPlayer.pieces.camps <= 0) return "你的营地棋子已经用完了。";
    if (!hasCost(COSTS.camp)) return "资源不够，无法建造营地。";
    return "这里不能建造营地。";
  };
  const explainFortressRuleHint = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!actingPlayer) return "当前还不能升级堡垒。";
    if (vertex?.building?.ownerId !== actingPlayer.id || vertex.building.type !== "camp") return "只能把自己的营地升级成堡垒。";
    if (actingPlayer.pieces.fortresses <= 0) return "你的堡垒棋子已经用完了。";
    if (!hasCost(COSTS.fortress)) return "资源不够，无法升级堡垒。";
    return "这里不能升级堡垒。";
  };
  const explainWatchtowerRuleHint = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!actingPlayer) return "当前还不能建造哨塔。";
    if (vertex?.building?.ownerId !== actingPlayer.id) return "哨塔只能建在自己的营地或堡垒上。";
    if (vertex.watchtowerOwnerId) return "这处建筑已经有哨塔了。";
    if (actingPlayer.pieces.watchtowers <= 0) return "你的哨塔棋子已经用完了。";
    if (!hasCost(COSTS.watchtower)) return "资源不够，无法建造哨塔。";
    return "这里不能建造哨塔。";
  };
  const explainRecruitRuleHint = (vertexId: string) => {
    const vertex = state.board.vertices[vertexId];
    if (!actingPlayer) return "当前还不能招募民兵。";
    if (vertex?.building?.ownerId !== actingPlayer.id) return "民兵只能招募在自己的营地或堡垒上。";
    const stationed = actingPlayer.militia.filter((militia) => militia.vertexId === vertexId).length;
    if (stationed >= 2) return "每个营地或堡垒最多只能驻守 2 名民兵。";
    if (actingPlayer.pieces.militia <= 0) return "你的民兵棋子已经用完了。";
    if (!hasCost(COSTS.militia)) return "资源不够，无法招募民兵。";
    return "这里不能招募民兵。";
  };
  const explainActivateMilitiaRuleHint = (vertexId: string) => {
    if (!actingPlayer) return "当前还不能激活民兵。";
    const militiaAtVertex = actingPlayer.militia.filter((item) => item.vertexId === vertexId);
    if (militiaAtVertex.length === 0) return "这里没有你的民兵，无法激活。";
    if (!militiaAtVertex.some((item) => item.status === "inactive")) return "这里只有已激活或不可再次激活的民兵。";
    if (!hasCost(COSTS.activateMilitia)) return "资源不够，无法激活民兵。";
    return "这里不能激活民兵。";
  };
  const explainZombieMoveRuleHint = (tileId: string) => {
    const tile = state.board.tiles[tileId];
    if (!tile) return "目标地块不存在。";
    if (!tile.revealed) return "尸潮不能移到未翻开的地块。";
    return "这里不能移动尸潮。";
  };

  const polygonForTile = (tileId: string) => {
    const vertexIds = Object.values(state.board.edges)
      .filter((edge) => edge.tileIds.includes(tileId))
      .flatMap((edge) => edge.vertexIds);
    const unique = [...new Set(vertexIds)]
      .map((id) => state.board.vertices[id])
      .sort(
        (a, b) =>
          Math.atan2(a.y - state.board.tiles[tileId].y, a.x - state.board.tiles[tileId].x) -
          Math.atan2(b.y - state.board.tiles[tileId].y, b.x - state.board.tiles[tileId].x)
      );
    return unique.map((vertex) => `${vertex.x},${vertex.y}`).join(" ");
  };

  const clickTile = (tileId: string) => {
    if (!canInteract) return;
    if (selection?.kind === "expelZombie") {
      if (!legalExpelZombieTileSet.has(tileId)) {
        reportError?.("只能把尸潮赶到另一块已翻开的合法地块。");
        return;
      }
      submit({ type: "expelZombie", militiaId: selection.militiaId, toTileId: tileId });
      return;
    }
    if (selection?.kind === "devMerchant") {
      if (!legalMerchantTileSet.has(tileId)) {
        reportError?.("商人只能移动到与己方建筑相邻的已翻开资源地块。");
        return;
      }
      submit({ type: "playDevelopmentCard", cardId: selection.cardId, payload: { tileId } });
      return;
    }
    if (state.pending?.kind === "moveZombie" || tool === "zombie") {
      if (!state.board.tiles[tileId]?.revealed) {
        reportError?.(explainZombieMoveRuleHint(tileId));
        return;
      }
      submit({ type: "moveZombie", tileId });
    }
  };

  const clickEdge = (edgeId: string) => {
    if (!canInteract) return;
    if (selection?.kind === "moveConvoy") {
      if (!selection.fromEdgeId) {
        if (legalMoveConvoyFromSet.has(edgeId)) {
          setSelection({ kind: "moveConvoy", fromEdgeId: edgeId });
        } else {
          reportError?.("先点一个位于己方路线末端的装甲车队。");
        }
        return;
      }
      if (legalMoveConvoyToSet.has(edgeId)) {
        submit({ type: "moveConvoy", fromEdgeId: selection.fromEdgeId, toEdgeId: edgeId });
      } else {
        reportError?.("装甲车队只能移动到保持路线连通的合法边。");
      }
      return;
    }
    if (selection?.kind === "devRoadCrew") {
      if (!legalDevRouteEdgeSet.has(edgeId) || selectedDevRouteEdgeSet.has(edgeId)) {
        reportError?.("这里只能选尚未占用的合法边。");
        return;
      }
      const routes = [...selection.routes, { edgeId, routeType: selection.routeType }];
      if (routes.length >= 2) {
        submit({ type: "playDevelopmentCard", cardId: selection.cardId, payload: { routes } });
      } else {
        setSelection({ ...selection, routes });
      }
      return;
    }
    if (state.pending?.kind === "setupRoute") {
      if (!legalInitialRoutes.has(edgeId)) {
        reportError?.(explainInitialRouteRuleHint(edgeId));
        return;
      }
      submit({ type: "placeInitialRoute", edgeId });
      return;
    }
    if (canUseNormalBoardTools && (tool === "transport" || tool === "convoy")) {
      const routeType = tool as RouteType;
      const legalRouteSet = routeType === "transport" ? legalTransportEdges : legalConvoyEdges;
      if (!legalRouteSet.has(edgeId)) {
        reportError?.(explainRouteRuleHint(edgeId, routeType));
        return;
      }
      submit({ type: "buildRoute", edgeId, routeType: tool as RouteType });
    }
  };

  const clickVertex = (vertexId: string) => {
    if (!canInteract) return;
    if (selection?.kind === "moveMilitia") {
      if (!selection.militiaId) {
        const militiaId = selectableMoveMilitiaByVertex.get(vertexId);
        if (!militiaId) {
          reportError?.("先选择一个驻有可移动已激活民兵的己方营地或堡垒。");
          return;
        }
        setSelection({ kind: "moveMilitia", militiaId });
        return;
      }
      if (!legalMoveMilitiaVertexSet.has(vertexId)) {
        reportError?.("民兵只能沿你的路线移动到可驻守且未满员的己方建筑。");
        return;
      }
      submit({ type: "moveMilitia", militiaId: selection.militiaId, toVertexId: vertexId });
      return;
    }
    if (selection?.kind === "devMilitia") {
      if (!legalDevMilitiaVertexSet.has(vertexId)) {
        reportError?.("这张卡只能把民兵部署到自己的营地或堡垒。");
        return;
      }
      const stationedCount = actingPlayer?.militia.filter((militia) => militia.vertexId === vertexId).length ?? 0;
      const selectedCount = selectedDevMilitiaVertexIds.filter((selectedVertexId) => selectedVertexId === vertexId).length;
      if (stationedCount + selectedCount >= 2) {
        reportError?.("每处营地或堡垒最多驻守 2 个民兵。");
        return;
      }
      const vertexIds = [...selection.vertexIds, vertexId];
      if (vertexIds.length >= 2) {
        submit({ type: "playDevelopmentCard", cardId: selection.cardId, payload: { vertexIds } });
      } else {
        setSelection({ ...selection, vertexIds });
      }
      return;
    }
    if (state.pending?.kind === "downgradeFortress") {
      if (!legalDowngradeFortressVertexSet.has(vertexId)) {
        reportError?.("这里只能选择待降级的己方堡垒。");
        return;
      }
      submit({ type: "downgradeFortress", vertexId });
      return;
    }
    if (state.phase === "setup" && !state.pending) {
      if (!legalInitialCamps.has(vertexId)) {
        reportError?.(explainInitialCampRuleHint(vertexId));
        return;
      }
      submit({ type: "placeInitialCamp", vertexId });
      return;
    }
    if (canUseNormalBoardTools) {
      if (tool === "activateMilitia") {
        const militia = actingPlayer?.militia.find(
          (item) => item.vertexId === vertexId && item.status === "inactive"
        );
        if (militia) {
          submit({ type: "activateMilitia", militiaId: militia.id });
        } else {
          reportError?.(explainActivateMilitiaRuleHint(vertexId));
        }
        return;
      }
      if (tool === "camp") {
        if (!legalCampVertices.has(vertexId)) {
          reportError?.(explainCampRuleHint(vertexId));
          return;
        }
        submit({ type: "buildCamp", vertexId });
      }
      if (tool === "fortress") {
        if (!legalUpgradeVertexSet.has(vertexId)) {
          reportError?.(explainFortressRuleHint(vertexId));
          return;
        }
        submit({ type: "upgradeFortress", vertexId });
      }
      if (tool === "watchtower") {
        if (!legalWatchtowerVertexSet.has(vertexId)) {
          reportError?.(explainWatchtowerRuleHint(vertexId));
          return;
        }
        submit({ type: "buildWatchtower", vertexId });
      }
      if (tool === "recruit") {
        if (!legalRecruitVertexSet.has(vertexId)) {
          reportError?.(explainRecruitRuleHint(vertexId));
          return;
        }
        submit({ type: "recruitMilitia", vertexId });
      }
    }
  };

  return (
    <svg
      className="board-svg"
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      onClick={(event) => {
        if (event.target !== event.currentTarget || !selection) return;
        setSelection(undefined);
      }}
    >
      <defs>
        <PieceVividFilters players={state.players} />
        <pattern id="fog" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#60666a" />
          <path d="M0 10L10 0" stroke="#7c858a" strokeWidth="1" />
        </pattern>
        <filter id="selection-white-outline" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="expanded" />
          <feFlood floodColor="#ffffff" floodOpacity="0.96" result="outlineColor" />
          <feComposite in="outlineColor" in2="expanded" operator="in" result="expandedColor" />
          <feComposite in="expandedColor" in2="SourceAlpha" operator="out" result="outline" />
          <feGaussianBlur in="outline" stdDeviation="0.35" result="softOutline" />
          <feMerge>
            <feMergeNode in="softOutline" />
            <feMergeNode in="outline" />
          </feMerge>
        </filter>
        <filter id="selection-gold-outline" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.65" result="expanded" />
          <feFlood floodColor="#fff0a2" floodOpacity="0.98" result="outlineColor" />
          <feComposite in="outlineColor" in2="expanded" operator="in" result="expandedColor" />
          <feComposite in="expandedColor" in2="SourceAlpha" operator="out" result="outline" />
          <feGaussianBlur in="outline" stdDeviation="0.45" result="softOutline" />
          <feMerge>
            <feMergeNode in="softOutline" />
            <feMergeNode in="outline" />
          </feMerge>
        </filter>
        <filter id="selection-white-preview" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="expanded" />
          <feFlood floodColor="#ffffff" floodOpacity="0.96" result="outlineColor" />
          <feComposite in="outlineColor" in2="expanded" operator="in" result="expandedColor" />
          <feComposite in="expandedColor" in2="SourceAlpha" operator="out" result="outline" />
          <feGaussianBlur in="outline" stdDeviation="0.35" result="softOutline" />
          <feMerge>
            <feMergeNode in="softOutline" />
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="selection-gold-preview" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.65" result="expanded" />
          <feFlood floodColor="#fff0a2" floodOpacity="0.98" result="outlineColor" />
          <feComposite in="outlineColor" in2="expanded" operator="in" result="expandedColor" />
          <feComposite in="expandedColor" in2="SourceAlpha" operator="out" result="outline" />
          <feGaussianBlur in="outline" stdDeviation="0.45" result="softOutline" />
          <feMerge>
            <feMergeNode in="softOutline" />
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {Object.values(state.board.tiles).map((tile) => (
        <HexTile
          key={tile.id}
          tile={tile}
          points={polygonForTile(tile.id)}
          hasZombie={state.zombieTileId === tile.id}
          hasMerchant={state.merchant.tileId === tile.id}
          legal={legalMerchantTileSet.has(tile.id)}
          onClick={() => clickTile(tile.id)}
        />
      ))}

      {Object.values(state.board.edges).map((edge) => {
        const a = state.board.vertices[edge.vertexIds[0]];
        const b = state.board.vertices[edge.vertexIds[1]];
        const queuedRouteType =
          selection?.kind === "devRoadCrew"
            ? selection.routes.find((route) => route.edgeId === edge.id)?.routeType
            : undefined;
        const previewRouteType: RouteType | undefined =
          edge.route
            ? undefined
            : state.pending?.kind === "setupRoute" && legalInitialRoutes.has(edge.id)
              ? "transport"
              : canUseNormalBoardTools && tool === "transport" && legalTransportEdges.has(edge.id)
                ? "transport"
                : canUseNormalBoardTools && tool === "convoy" && legalConvoyEdges.has(edge.id)
                  ? "convoy"
                  : selection?.kind === "moveConvoy" && selection.fromEdgeId && legalMoveConvoyToSet.has(edge.id)
                    ? "convoy"
                    : queuedRouteType ??
                      (selection?.kind === "devRoadCrew" && legalDevRouteEdgeSet.has(edge.id)
                        ? selection.routeType
                        : undefined);
        const isLegal =
          legalInitialRoutes.has(edge.id) ||
          (canUseNormalBoardTools && tool === "transport" && legalTransportEdges.has(edge.id)) ||
          (canUseNormalBoardTools && tool === "convoy" && legalConvoyEdges.has(edge.id)) ||
          (selection?.kind === "moveConvoy" &&
            (!selection.fromEdgeId ? legalMoveConvoyFromSet.has(edge.id) : legalMoveConvoyToSet.has(edge.id))) ||
          (selection?.kind === "devRoadCrew" &&
            legalDevRouteEdgeSet.has(edge.id) &&
            !selectedDevRouteEdgeSet.has(edge.id));
        const isSelected = selection?.kind === "moveConvoy" && selection.fromEdgeId === edge.id;
        const isQueued = selectedDevRouteEdgeSet.has(edge.id);
        return (
          <EdgeRoute
            key={edge.id}
            edge={edge}
            a={a}
            b={b}
            owner={state.players.find((player) => player.id === edge.route?.ownerId)}
            legal={isLegal}
            selected={isSelected}
            queued={isQueued}
            coarsePointer={isCoarsePointer}
            previewRouteType={previewRouteType}
            previewOwner={actingPlayer}
            onClick={() => clickEdge(edge.id)}
          />
        );
      })}

      {Object.values(state.board.edges)
        .filter((edge) => isBlackMarketVisible(state.board, edge.id))
        .map((edge) => (
          <BlackMarketMarker
            key={`market-${edge.id}`}
            edge={edge}
            a={state.board.vertices[edge.vertexIds[0]]}
            b={state.board.vertices[edge.vertexIds[1]]}
            tiles={edge.tileIds.map((id) => state.board.tiles[id]).filter(Boolean)}
          />
        ))}

      {Object.values(state.board.vertices).map((vertex) => {
        const player = state.players.find((item) => item.id === vertex.building?.ownerId);
        const hasInitialCampHotspot = !vertex.building && state.phase === "setup" && !state.pending && legalInitialCamps.has(vertex.id);
        const previewBuildingType =
          !vertex.building &&
          (canUseNormalBoardTools && tool === "camp" && legalCampVertices.has(vertex.id))
            ? "camp"
            : undefined;
        const isLegal =
          (canUseNormalBoardTools && tool === "camp" && legalCampVertices.has(vertex.id)) ||
          (canUseNormalBoardTools && tool === "fortress" && legalUpgradeVertexSet.has(vertex.id)) ||
          (canUseNormalBoardTools && tool === "watchtower" && legalWatchtowerVertexSet.has(vertex.id)) ||
          (canUseNormalBoardTools && tool === "recruit" && legalRecruitVertexSet.has(vertex.id)) ||
          legalActivateMilitiaVertexSet.has(vertex.id) ||
          selectableMoveMilitiaVertexSet.has(vertex.id) ||
          legalMoveMilitiaVertexSet.has(vertex.id) ||
          legalDevMilitiaVertexSet.has(vertex.id) ||
          legalDowngradeFortressVertexSet.has(vertex.id);
        const stationedMilitia = state.players.flatMap((item) =>
          item.militia.filter((militia) => militia.vertexId === vertex.id)
        );
        return (
          <VertexToken
            key={vertex.id}
            vertex={vertex}
            legal={isLegal}
            buildingOwner={player}
            previewBuildingOwner={actingPlayer}
            previewBuildingType={previewBuildingType}
            expandedHitArea={hasInitialCampHotspot}
            coarsePointer={isCoarsePointer}
            militia={stationedMilitia}
            players={state.players}
            onClick={() => clickVertex(vertex.id)}
          />
        );
      })}

      {legalTileOutlineIds.length > 0 && (
        <g className="tile-selection-outline-layer" aria-hidden="true">
          {legalTileOutlineIds.map((tileId) => (
            <polygon
              key={`tile-outline-${tileId}`}
              data-tile-outline-id={tileId}
              points={polygonForTile(tileId)}
              className="tile-art-selection-outline"
            />
          ))}
        </g>
      )}

      <BoardAnimationLayer board={state.board} events={animationEvents} />
    </svg>
  );
}

// 回合计时器每 250ms 触发一次 GameShell 重渲染。棋盘本身只在游戏状态/选择/工具变化时才需要重画,
// 用 memo 跳过计时器 tick 带来的整块棋盘重渲染(随着棋子增多,这部分开销会越来越大)。
export const BoardView = memo(BoardViewImpl);
