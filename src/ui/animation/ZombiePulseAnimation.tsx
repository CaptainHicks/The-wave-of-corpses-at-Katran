import type { GameAnimationEvent } from "./animationTypes";

interface BoardMotionPoint {
  x: number;
  y: number;
}

export function ZombiePulseAnimation({
  event,
  point
}: {
  event: GameAnimationEvent;
  point?: BoardMotionPoint;
}) {
  if (!point) return null;

  return (
    <g className="zombie-pulse-animation" transform={`translate(${point.x} ${point.y})`}>
      <circle r="14" className="zombie-pulse-core" />
      <circle r="23" className="zombie-pulse-ring" />
      <circle r="34" className="zombie-pulse-ring delayed" />
      {event.kind === "zombieTrackAdvance" && <text y="5">{event.publicLabel ?? "!"}</text>}
    </g>
  );
}
