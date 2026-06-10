import type { CSSProperties } from "react";
import type { EdgeState, PlayerState, RouteType, VertexState } from "../../domain/types";
import { getRoutePieceAsset } from "../art/assetManifest";
import { routePieceColorStyle, routePieceFilterId } from "./pieceColorStyles";
import { useImmediateBoardActivation } from "./useImmediateBoardActivation";

export function EdgeRoute({
  edge,
  a,
  b,
  owner,
  legal,
  selected,
  queued,
  coarsePointer,
  previewRouteType,
  previewOwner,
  onClick
}: {
  edge: EdgeState;
  a: VertexState;
  b: VertexState;
  owner?: PlayerState;
  legal: boolean;
  selected: boolean;
  queued: boolean;
  coarsePointer?: boolean;
  previewRouteType?: RouteType;
  previewOwner?: PlayerState;
  onClick: () => void;
}) {
  const routeStyle = edge.route
    ? routePieceColorStyle(owner?.color, { stroke: owner?.color } as CSSProperties)
    : undefined;
  const routeAsset =
    edge.route && owner
      ? getRoutePieceAsset({
          playerId: owner.id,
          factionId: owner.factionId,
          color: owner.color,
          routeType: edge.route.type
        })
      : undefined;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const routeLength = Math.hypot(b.x - a.x, b.y - a.y);
  const routeBoxHeight = 20;
  const routeAngle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const previewAsset =
    !edge.route && previewRouteType && previewOwner
      ? getRoutePieceAsset({
          playerId: previewOwner.id,
          factionId: previewOwner.factionId,
          color: previewOwner.color,
          routeType: previewRouteType
        })
      : undefined;
  const previewStyle =
    previewRouteType && previewOwner
      ? routePieceColorStyle(previewOwner.color)
      : undefined;
  const hasRouteSelectionOutline = Boolean(edge.route && routeAsset && (legal || selected || queued));
  const activationHandlers = useImmediateBoardActivation(onClick);

  if (edge.route && routeAsset && owner) {
    return (
      <g
        className={`edge-route-group route-${edge.route.type} ${legal ? "legal" : ""} ${
          selected || queued ? "selected-edge" : ""
        }`}
        data-edge-id={edge.id}
        style={routeStyle}
        {...activationHandlers}
      >
        {hasRouteSelectionOutline && (
          <image
            href={routeAsset}
            x={midX - routeLength / 2}
            y={midY - routeBoxHeight / 2}
            width={routeLength}
            height={routeBoxHeight}
            preserveAspectRatio="xMidYMid meet"
            transform={`rotate(${routeAngle} ${midX} ${midY})`}
            className={`route-piece-legal-outline ${selected || queued ? "is-selected" : ""}`}
            filter={selected || queued ? "url(#selection-gold-outline)" : "url(#selection-white-outline)"}
            aria-hidden="true"
          />
        )}
        <image
          href={routeAsset}
          x={midX - routeLength / 2}
          y={midY - routeBoxHeight / 2}
          width={routeLength}
          height={routeBoxHeight}
          preserveAspectRatio="xMidYMid meet"
          transform={`rotate(${routeAngle} ${midX} ${midY})`}
          className={`route-piece route-piece-${edge.route.type}`}
          filter={`url(#${routePieceFilterId(owner.id, edge.route.type)})`}
          aria-hidden="true"
        />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge edge-hitbox ${coarsePointer ? "coarse-hitbox" : ""}`} />
      </g>
    );
  }

  if (previewAsset && previewRouteType) {
    return (
      <g
        className={`edge-route-group route-preview-group route-${previewRouteType} ${legal ? "legal" : ""} ${
          selected || queued ? "selected-edge" : ""
        }`}
        data-edge-id={edge.id}
        style={previewStyle}
        {...activationHandlers}
      >
        <image
          href={previewAsset}
          x={midX - routeLength / 2}
          y={midY - routeBoxHeight / 2}
          width={routeLength}
          height={routeBoxHeight}
          preserveAspectRatio="xMidYMid meet"
          transform={`rotate(${routeAngle} ${midX} ${midY})`}
          className={`route-piece route-piece-${previewRouteType} route-piece-preview ${
            selected || queued ? "is-selected" : ""
          }`}
          filter={selected || queued ? "url(#selection-gold-preview)" : "url(#selection-white-preview)"}
          aria-hidden="true"
        />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge edge-hitbox ${coarsePointer ? "coarse-hitbox" : ""}`} />
      </g>
    );
  }

  return (
    <g
      className="edge-route-group"
      style={routeStyle}
      data-edge-id={edge.id}
      {...activationHandlers}
    >
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        className={`edge ${edge.route ? `route-${edge.route.type}` : ""} ${legal ? "legal" : ""} ${
          selected || queued ? "selected-edge" : ""
        }`}
      />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge edge-hitbox ${coarsePointer ? "coarse-hitbox" : ""}`} />
    </g>
  );
}
