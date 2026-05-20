import { useMemo, type Dispatch, type SetStateAction } from "react";
import { isBlackMarketVisible } from "../../domain/board";
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
import type { Command, GameState, RouteType } from "../../domain/types";
import type { GameAnimationEvent } from "../animation/animationTypes";
import type { UiSelection, UiTool } from "../gameUiTypes";
import { BlackMarketMarker } from "./BlackMarketMarker";
import { BoardAnimationLayer } from "./BoardAnimationLayer";
import { EdgeRoute } from "./EdgeRoute";
import { HexTile } from "./HexTile";
import { VertexToken } from "./VertexToken";

export function BoardView({
  state,
  tool,
  selection,
  canInteract = true,
  animationEvents = [],
  setSelection,
  submit
}: {
  state: GameState;
  tool: UiTool;
  selection?: UiSelection;
  canInteract?: boolean;
  animationEvents?: GameAnimationEvent[];
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  submit: (command: Command) => void;
}) {
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
    canInteract && selection?.kind === "moveMilitia" ? legalMilitiaMoveVertices(state, selection.militiaId) : []
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
    canInteract && selection?.kind === "devRoadCrew" ? legalDevelopmentRouteEdges(state, selection.routeType) : []
  );
  const legalDowngradeFortressVertexSet = new Set(
    canInteract && state.pending?.kind === "downgradeFortress" ? state.pending.vertexIds : []
  );
  const selectedDevRouteEdgeSet = new Set(
    selection?.kind === "devRoadCrew" ? selection.routes.map((route) => route.edgeId) : []
  );
  const canUseNormalBoardTools = canInteract && !state.pending && state.phase === "action";
  const actingPlayerId = canInteract ? state.pending?.playerId ?? state.currentPlayerId : undefined;
  const actingPlayer = state.players.find((player) => player.id === actingPlayerId);
  const legalActivateMilitiaVertexSet = new Set(
    canUseNormalBoardTools && tool === "activateMilitia" && actingPlayer
      ? actingPlayer.militia.filter((militia) => militia.status === "inactive").map((militia) => militia.vertexId)
      : []
  );
  const legalTileOutlineIds = [...new Set([...legalExpelZombieTileSet, ...legalMerchantTileSet])].filter(
    (tileId) => state.board.tiles[tileId]
  );

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
      if (!legalExpelZombieTileSet.has(tileId)) return;
      submit({ type: "expelZombie", militiaId: selection.militiaId, toTileId: tileId });
      return;
    }
    if (selection?.kind === "devMerchant") {
      if (!legalMerchantTileSet.has(tileId)) return;
      submit({ type: "playDevelopmentCard", cardId: selection.cardId, payload: { tileId } });
      return;
    }
    if (state.pending?.kind === "moveZombie" || tool === "zombie") submit({ type: "moveZombie", tileId });
  };

  const clickEdge = (edgeId: string) => {
    if (!canInteract) return;
    if (selection?.kind === "moveConvoy") {
      if (!selection.fromEdgeId) {
        if (legalMoveConvoyFromSet.has(edgeId)) {
          setSelection({ kind: "moveConvoy", fromEdgeId: edgeId });
        }
        return;
      }
      if (legalMoveConvoyToSet.has(edgeId)) {
        submit({ type: "moveConvoy", fromEdgeId: selection.fromEdgeId, toEdgeId: edgeId });
      }
      return;
    }
    if (selection?.kind === "devRoadCrew") {
      if (!legalDevRouteEdgeSet.has(edgeId) || selectedDevRouteEdgeSet.has(edgeId)) return;
      const routes = [...selection.routes, { edgeId, routeType: selection.routeType }];
      if (routes.length >= 2) {
        submit({ type: "playDevelopmentCard", cardId: selection.cardId, payload: { routes } });
      } else {
        setSelection({ ...selection, routes });
      }
      return;
    }
    if (state.pending?.kind === "setupRoute") {
      submit({ type: "placeInitialRoute", edgeId });
      return;
    }
    if (canUseNormalBoardTools && (tool === "transport" || tool === "convoy")) {
      submit({ type: "buildRoute", edgeId, routeType: tool as RouteType });
    }
  };

  const clickVertex = (vertexId: string) => {
    if (!canInteract) return;
    if (selection?.kind === "moveMilitia") {
      if (!legalMoveMilitiaVertexSet.has(vertexId)) return;
      submit({ type: "moveMilitia", militiaId: selection.militiaId, toVertexId: vertexId });
      return;
    }
    if (selection?.kind === "devMilitia") {
      if (!legalDevMilitiaVertexSet.has(vertexId)) return;
      submit({ type: "playDevelopmentCard", cardId: selection.cardId, payload: { vertexId } });
      return;
    }
    if (state.pending?.kind === "downgradeFortress") {
      if (!legalDowngradeFortressVertexSet.has(vertexId)) return;
      submit({ type: "downgradeFortress", vertexId });
      return;
    }
    if (state.phase === "setup" && !state.pending) submit({ type: "placeInitialCamp", vertexId });
    if (canUseNormalBoardTools) {
      if (tool === "activateMilitia") {
        const militia = actingPlayer?.militia.find(
          (item) => item.vertexId === vertexId && item.status === "inactive"
        );
        if (militia) submit({ type: "activateMilitia", militiaId: militia.id });
        return;
      }
      if (tool === "camp") submit({ type: "buildCamp", vertexId });
      if (tool === "fortress") submit({ type: "upgradeFortress", vertexId });
      if (tool === "watchtower") submit({ type: "buildWatchtower", vertexId });
      if (tool === "recruit") submit({ type: "recruitMilitia", vertexId });
    }
  };

  return (
    <svg className="board-svg" viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}>
      <defs>
        <pattern id="fog" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#60666a" />
          <path d="M0 10L10 0" stroke="#7c858a" strokeWidth="1" />
        </pattern>
      </defs>

      {Object.values(state.board.tiles).map((tile) => (
        <HexTile
          key={tile.id}
          tile={tile}
          points={polygonForTile(tile.id)}
          hasZombie={state.zombieTileId === tile.id}
          hasMerchant={state.merchant.tileId === tile.id}
          legal={legalExpelZombieTileSet.has(tile.id) || legalMerchantTileSet.has(tile.id)}
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
        const previewBuildingType =
          !vertex.building &&
          (legalInitialCamps.has(vertex.id) || (canUseNormalBoardTools && tool === "camp" && legalCampVertices.has(vertex.id)))
            ? "camp"
            : undefined;
        const isLegal =
          legalInitialCamps.has(vertex.id) ||
          (canUseNormalBoardTools && tool === "camp" && legalCampVertices.has(vertex.id)) ||
          (canUseNormalBoardTools && tool === "fortress" && legalUpgradeVertexSet.has(vertex.id)) ||
          (canUseNormalBoardTools && tool === "watchtower" && legalWatchtowerVertexSet.has(vertex.id)) ||
          (canUseNormalBoardTools && tool === "recruit" && legalRecruitVertexSet.has(vertex.id)) ||
          legalActivateMilitiaVertexSet.has(vertex.id) ||
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
