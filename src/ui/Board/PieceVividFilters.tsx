import type { PlayerState } from "../../domain/types";
import { buildingPieceFilterId, routePieceFilterId } from "./pieceColorStyles";

interface VividFilterProps {
  id: string;
  color: string;
  saturation: number;
  contrast: number;
  brightness: number;
  glowOpacity: number;
  glowBlur: number;
}

function VividFilter({
  id,
  color,
  saturation,
  contrast,
  brightness,
  glowOpacity,
  glowBlur
}: VividFilterProps) {
  const slope = contrast * brightness;
  const intercept = (0.5 - 0.5 * contrast) * brightness;

  return (
    <filter id={id} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="saturate" values={String(saturation)} result="saturated" />
      <feComponentTransfer in="saturated" result="vivid">
        <feFuncR type="linear" slope={slope} intercept={intercept} />
        <feFuncG type="linear" slope={slope} intercept={intercept} />
        <feFuncB type="linear" slope={slope} intercept={intercept} />
        <feFuncA type="identity" />
      </feComponentTransfer>
      <feGaussianBlur in="SourceAlpha" stdDeviation={glowBlur} result="glowBlur" />
      <feFlood floodColor={color} floodOpacity={glowOpacity} result="glowColor" />
      <feComposite in="glowColor" in2="glowBlur" operator="in" result="glow" />
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" result="shadowBlur" />
      <feOffset in="shadowBlur" dy="2" result="shadowOffset" />
      <feFlood floodColor="#14100a" floodOpacity="0.54" result="shadowColor" />
      <feComposite in="shadowColor" in2="shadowOffset" operator="in" result="shadow" />
      <feMerge>
        <feMergeNode in="shadow" />
        <feMergeNode in="glow" />
        <feMergeNode in="vivid" />
      </feMerge>
    </filter>
  );
}

export function PieceVividFilters({ players }: { players: PlayerState[] }) {
  return (
    <>
      {players.flatMap((player) => [
        <VividFilter
          key={routePieceFilterId(player.id, "transport")}
          id={routePieceFilterId(player.id, "transport")}
          color={player.color}
          saturation={1.82}
          contrast={1.22}
          brightness={1.15}
          glowOpacity={0.5}
          glowBlur={2.25}
        />,
        <VividFilter
          key={routePieceFilterId(player.id, "convoy")}
          id={routePieceFilterId(player.id, "convoy")}
          color={player.color}
          saturation={1.9}
          contrast={1.24}
          brightness={1.16}
          glowOpacity={0.56}
          glowBlur={2.5}
        />,
        <VividFilter
          key={buildingPieceFilterId(player.id, "camp")}
          id={buildingPieceFilterId(player.id, "camp")}
          color={player.color}
          saturation={1.74}
          contrast={1.18}
          brightness={1.13}
          glowOpacity={0.44}
          glowBlur={2}
        />,
        <VividFilter
          key={buildingPieceFilterId(player.id, "fortress")}
          id={buildingPieceFilterId(player.id, "fortress")}
          color={player.color}
          saturation={1.82}
          contrast={1.2}
          brightness={1.14}
          glowOpacity={0.48}
          glowBlur={2.25}
        />
      ])}
    </>
  );
}
