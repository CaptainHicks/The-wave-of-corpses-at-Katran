import { isResourceTile } from "../../domain/board";
import { RESOURCE_LABELS } from "../../domain/constants";
import type { BlackMarket, EdgeState, Resource, TileState, VertexState } from "../../domain/types";
import { boardMarkerAssets, resourceIconAssets } from "../art/assetManifest";

export function BlackMarketMarker({
  edge,
  a,
  b,
  tiles
}: {
  edge: EdgeState;
  a: VertexState;
  b: VertexState;
  tiles: TileState[];
}) {
  if (!edge.blackMarket) return null;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const outward = outerSideVector(tiles, x, y);
  const pieceX = x + outward.x * 10;
  const pieceY = y + outward.y * 10;
  const labelX = pieceX + outward.x * 16;
  const labelY = pieceY + outward.y * 16;
  const icon = edge.blackMarket.type === "specific" ? resourceIconAssets[edge.blackMarket.resource].imageUrl : undefined;

  return (
    <g className="market-marker" data-edge-id={edge.id} aria-label={marketAccessibleLabel(edge.blackMarket)}>
      <image
        href={boardMarkerAssets.blackMarket}
        x={pieceX - 22}
        y={pieceY - 7}
        width="44"
        height="14"
        preserveAspectRatio="xMidYMid meet"
        transform={`rotate(${angle} ${pieceX} ${pieceY})`}
        className="market-marker-piece"
        aria-hidden="true"
      />
      <g className="market-marker-label" aria-hidden="true">
        {icon && (
          <image
            href={icon}
            x={labelX - 13}
            y={labelY - 6}
            width="11"
            height="11"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        <text x={labelX + (icon ? 7 : 0)} y={labelY + 4}>
          {marketRatio(edge.blackMarket)}
        </text>
      </g>
    </g>
  );
}

function outerSideVector(tiles: TileState[], edgeX: number, edgeY: number): { x: number; y: number } {
  const emptyTile = tiles.find((tile) => tile.hiddenType === "empty");
  const resourceTile = tiles.find(isResourceTile);
  const vector =
    emptyTile && resourceTile
      ? { x: emptyTile.x - resourceTile.x, y: emptyTile.y - resourceTile.y }
      : { x: edgeX - average(tiles.map((tile) => tile.x)), y: edgeY - average(tiles.map((tile) => tile.y)) };
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.001) return { x: 0, y: -1 };
  return { x: vector.x / length, y: vector.y / length };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function marketRatio(market: BlackMarket): string {
  return market.type === "generic" ? "3:1" : "2:1";
}

function marketAccessibleLabel(market: BlackMarket): string {
  if (market.type === "generic") return "黑市 3:1";
  const labels: Record<Resource, string> = RESOURCE_LABELS;
  return `${labels[market.resource]}黑市 2:1`;
}
