import type { CSSProperties } from "react";
import type { GameAnimationEvent } from "./animationTypes";

export function ZombieSiegeAlert({ events }: { events: GameAnimationEvent[] }) {
  const siegeEvent = [...events].reverse().find((event) => event.kind === "zombieSiege");
  if (!siegeEvent) return null;

  return (
    <div
      className="zombie-siege-alert"
      role="status"
      aria-live="assertive"
      style={{ "--siege-alert-duration": `${siegeEvent.durationMs}ms` } as CSSProperties}
    >
      <div className="zombie-siege-alert__flare" aria-hidden="true" />
      <div className="zombie-siege-alert__panel">
        <img src="/assets/board/markers/zombie-horde.v1.webp" alt="" aria-hidden="true" />
        <div>
          <span>警报</span>
          <strong>{siegeEvent.publicLabel ?? "尸潮围城"}</strong>
          <p>所有防线接受尸潮冲击</p>
        </div>
      </div>
    </div>
  );
}
