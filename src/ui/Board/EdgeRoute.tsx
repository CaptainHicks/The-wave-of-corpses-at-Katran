import type { CSSProperties, MouseEvent } from "react";
import type { EdgeState, PlayerState, RouteType, VertexState } from "../../domain/types";
import { getRoutePieceAsset } from "../art/assetManifest";

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
    ? ({ stroke: owner?.color, "--route-color": owner?.color ?? "#f2c14e" } as CSSProperties)
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
      ? ({ "--route-color": previewOwner.color } as CSSProperties)
      : undefined;
  const hasRouteSelectionOutline = Boolean(edge.route && routeAsset && (legal || selected || queued));

  if (edge.route && routeAsset) {
    return (
      <g
        className={`edge-route-group route-${edge.route.type} ${legal ? "legal" : ""} ${
          selected || queued ? "selected-edge" : ""
        }`}
        data-edge-id={edge.id}
        style={routeStyle}
        onClick={(event: MouseEvent<SVGGElement>) => {
          event.stopPropagation();
          onClick();
        }}
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
        onClick={(event: MouseEvent<SVGGElement>) => {
          event.stopPropagation();
          onClick();
        }}
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
          aria-hidden="true"
        />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge edge-hitbox ${coarsePointer ? "coarse-hitbox" : ""}`} />
      </g>
    );
  }

  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      className={`edge ${edge.route ? `route-${edge.route.type}` : ""} ${legal ? "legal" : ""} ${
        selected || queued ? "selected-edge" : ""
      } ${coarsePointer ? "coarse-hitbox" : ""}`}
      style={routeStyle}
      data-edge-id={edge.id}
      onClick={(event: MouseEvent<SVGLineElement>) => {
        event.stopPropagation();
        onClick();
      }}
    />
  );
}
