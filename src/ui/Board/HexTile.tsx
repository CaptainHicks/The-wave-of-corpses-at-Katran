import type { CSSProperties } from "react";
import type { TileState } from "../../domain/types";
import { boardMarkerAssets, tileAssets } from "../art/assetManifest";
import { TileNumberToken } from "./TileNumberToken";

function boundsForPoints(points: string): { x: number; y: number; width: number; height: number } {
  const parsed = points
    .trim()
    .split(/\s+/)
    .map((point) => point.split(",").map(Number))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const xs = parsed.map(([x]) => x);
  const ys = parsed.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

export function HexTile({
  tile,
  points,
  legal,
  hasZombie,
  hasMerchant,
  onClick
}: {
  tile: TileState;
  points: string;
  legal: boolean;
  hasZombie: boolean;
  hasMerchant: boolean;
  onClick: () => void;
}) {
  const visualType = tile.revealed ? tile.hiddenType : "fog";
  const asset = tileAssets[visualType];
  const style = { "--tile-fill": asset.fallbackColor } as CSSProperties;
  const tileClassName = `tile tile-${visualType} ${hasZombie ? "zombie-tile" : ""} ${
    hasMerchant ? "merchant-tile" : ""
  } ${legal ? "legal" : ""} ${legal && !asset.imageUrl ? "legal-tile-target" : ""}`;
  const imageBounds = boundsForPoints(points);
  const imageClipId = `tile-clip-${tile.id}`;
  const outlineStyle = {
    ...style,
    fill: "transparent",
    pointerEvents: "all"
  } as CSSProperties;
  const visibleNumber = tile.revealed && tile.number !== undefined && !hasZombie ? tile.number : undefined;
  const shouldShowNumber = visibleNumber !== undefined;
  const numberX = shouldShowNumber && hasMerchant ? tile.x - 17 : tile.x;
  const zombieCenterX = hasZombie && hasMerchant ? tile.x - 17 : tile.x;
  const merchantCenterX = hasZombie || shouldShowNumber ? tile.x + 17 : tile.x;

  return (
    <g onClick={onClick} className="tile-group" data-tile-id={tile.id} aria-label={asset.alt}>
      {asset.imageUrl && (
        <defs>
          <clipPath id={imageClipId}>
            <polygon points={points} />
          </clipPath>
        </defs>
      )}
      {asset.imageUrl && (
        <>
          <polygon points={points} className={`tile tile-backdrop tile-${visualType}`} style={style} />
          <image
            href={asset.imageUrl}
            x={imageBounds.x}
            y={imageBounds.y}
            width={imageBounds.width}
            height={imageBounds.height}
            preserveAspectRatio="none"
            clipPath={`url(#${imageClipId})`}
            className="tile-art"
            aria-hidden="true"
          />
        </>
      )}
      <polygon
        points={points}
        className={asset.imageUrl ? `${tileClassName} tile-outline` : tileClassName}
        style={asset.imageUrl ? outlineStyle : style}
      />
      {visibleNumber !== undefined && <TileNumberToken x={numberX} y={tile.y} number={visibleNumber} />}
      {hasZombie && (
        <image
          href={boardMarkerAssets.zombieHorde}
          x={zombieCenterX - 17}
          y={tile.y - 17}
          width="34"
          height="34"
          preserveAspectRatio="xMidYMid meet"
          className="map-marker-token zombie"
          aria-hidden="true"
        />
      )}
      {hasMerchant && (
        <image
          href={boardMarkerAssets.merchant}
          x={merchantCenterX - 15}
          y={tile.y - 15}
          width="30"
          height="30"
          preserveAspectRatio="xMidYMid meet"
          className="map-marker-token merchant"
          aria-hidden="true"
        />
      )}
    </g>
  );
}
