import { boardNumberTokenAssets } from "../art/assetManifest";

export function TileNumberToken({ x, y, number }: { x: number; y: number; number: number }) {
  const imageUrl = boardNumberTokenAssets[number];
  const size = 28;

  if (!imageUrl) return null;

  return (
    <g className={`tile-number-token n-${number}`} aria-hidden="true">
      <image
        href={imageUrl}
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}
