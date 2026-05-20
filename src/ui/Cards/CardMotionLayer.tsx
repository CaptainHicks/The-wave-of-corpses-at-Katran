import { RESOURCE_LABELS } from "../../domain/constants";
import type { GameAnimationEvent } from "../animation/animationTypes";

const HAND_EVENT_KINDS = new Set<GameAnimationEvent["kind"]>([
  "devCardDraw",
  "devCardPlay"
]);

export function CardMotionLayer({ events = [], playerId }: { events?: GameAnimationEvent[]; playerId: string }) {
  const visibleEvents = events
    .filter((event) => event.playerId === playerId && HAND_EVENT_KINDS.has(event.kind))
    .slice(-4);

  if (visibleEvents.length === 0) return null;

  return (
    <div className="card-motion-layer" aria-hidden="true">
      {visibleEvents.map((event) => (
        <span key={event.id} className={`card-motion-chip ${event.kind}`}>
          {labelForEvent(event)}
        </span>
      ))}
    </div>
  );
}

function labelForEvent(event: GameAnimationEvent): string {
  if (event.kind === "devCardDraw") return `发展卡 +${event.amount ?? 1}`;
  if (event.kind === "devCardPlay") return "发展卡打出";
  const resourceLabel = event.resource ? RESOURCE_LABELS[event.resource] : "资源";
  return `${resourceLabel} ${event.amount ?? 1}`;
}
