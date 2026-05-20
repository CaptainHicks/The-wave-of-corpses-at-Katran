import type { GameAnimationEvent } from "./animationTypes";

const DEV_EVENT_KINDS = new Set<GameAnimationEvent["kind"]>(["devCardDraw", "devCardPlay"]);

export function DevCardPlayAnimation({
  events = [],
  playerId
}: {
  events?: GameAnimationEvent[];
  playerId: string;
}) {
  const visibleEvents = events
    .filter((event) => event.playerId === playerId && DEV_EVENT_KINDS.has(event.kind))
    .slice(-3);

  if (visibleEvents.length === 0) return null;

  return (
    <div className="dev-card-play-layer" aria-hidden="true">
      {visibleEvents.map((event) => (
        <div key={event.id} className={`dev-card-burst ${event.kind}`}>
          <span>{event.kind === "devCardDraw" ? "抽牌" : "打出"}</span>
        </div>
      ))}
    </div>
  );
}
