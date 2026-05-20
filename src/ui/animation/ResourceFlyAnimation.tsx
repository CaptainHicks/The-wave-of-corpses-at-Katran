import type { CSSProperties } from "react";
import { RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import type { Resource } from "../../domain/types";
import type { GameAnimationEvent } from "./animationTypes";

const RESOURCE_EVENT_KINDS = new Set<GameAnimationEvent["kind"]>(["resourceGain", "resourceSpend"]);

export function ResourceFlyAnimation({
  events = [],
  playerId
}: {
  events?: GameAnimationEvent[];
  playerId: string;
}) {
  const visibleEvents = events
    .filter((event) => event.playerId === playerId && RESOURCE_EVENT_KINDS.has(event.kind))
    .slice(-6);

  if (visibleEvents.length === 0) return null;

  return (
    <div className="resource-fly-layer" aria-hidden="true">
      {visibleEvents.map((event) => {
        const resource = event.resource;
        const index = resource ? RESOURCES.indexOf(resource) : 2;
        return (
          <span
            key={event.id}
            className={`resource-fly-token ${event.kind} ${resource ? `resource-${resource}` : "resource-private"}`}
            style={{ "--resource-index": index } as CSSProperties}
          >
            {labelForResourceEvent(event, resource)}
          </span>
        );
      })}
    </div>
  );
}

function labelForResourceEvent(event: GameAnimationEvent, resource?: Resource): string {
  const sign = event.kind === "resourceGain" ? "+" : "-";
  const label = resource ? RESOURCE_LABELS[resource] : "资源";
  return `${label} ${sign}${event.amount ?? 1}`;
}
