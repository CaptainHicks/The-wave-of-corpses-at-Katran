import type { CSSProperties } from "react";
import type { BuildingType, RouteType } from "../../domain/types";

const FALLBACK_PIECE_COLOR = "#f2c14e";

function parseHexColor(color?: string) {
  const normalized = color?.trim();
  const match = normalized?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return parseHexColor(FALLBACK_PIECE_COLOR);
  }

  const hex = match[1].length === 3 ? match[1].replace(/./g, (value) => value + value) : match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbaFromColor(color: string | undefined, alpha: number) {
  const { r, g, b } = parseHexColor(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function safeFilterIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function routePieceColorStyle(color?: string, baseStyle: CSSProperties = {}) {
  const pieceColor = color ?? FALLBACK_PIECE_COLOR;
  return {
    ...baseStyle,
    "--route-color": pieceColor,
    "--route-glow-edge": rgbaFromColor(pieceColor, 0.42),
    "--route-glow": rgbaFromColor(pieceColor, 0.48),
    "--route-glow-transport": rgbaFromColor(pieceColor, 0.5),
    "--route-glow-convoy": rgbaFromColor(pieceColor, 0.56)
  } as CSSProperties;
}

export function routePieceFilterId(playerId: string, routeType: RouteType) {
  return `route-vivid-${safeFilterIdPart(playerId)}-${routeType}`;
}

export function buildingPieceColorStyle(color?: string, baseStyle: CSSProperties = {}) {
  const pieceColor = color ?? FALLBACK_PIECE_COLOR;
  return {
    ...baseStyle,
    "--piece-color": pieceColor,
    "--piece-glow-marker": rgbaFromColor(pieceColor, 0.42),
    "--piece-glow": rgbaFromColor(pieceColor, 0.44),
    "--piece-glow-fortress": rgbaFromColor(pieceColor, 0.48)
  } as CSSProperties;
}

export function buildingPieceFilterId(playerId: string, buildingType: BuildingType) {
  return `building-vivid-${safeFilterIdPart(playerId)}-${buildingType}`;
}
