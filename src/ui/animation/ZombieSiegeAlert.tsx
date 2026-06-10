import type { CSSProperties } from "react";
import type { GameAnimationEvent } from "./animationTypes";

export function ZombieSiegeAlert({ events }: { events: GameAnimationEvent[] }) {
  const siegeEvent = [...events].reverse().find((event) => event.kind === "zombieSiege");
  if (!siegeEvent) return null;
  const resolution = siegeEvent.zombieSiegeResolution;

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
        <div className="zombie-siege-alert__content">
          <span>尸潮围城结算</span>
          <strong className={resolution?.successful === false ? "is-failure" : "is-success"}>
            {siegeEvent.publicLabel ?? "尸潮围城"}
          </strong>
          {resolution ? (
            <>
              <div className="zombie-siege-alert__comparison">
                <p>
                  <small>尸潮强度</small>
                  <b>{resolution.strength}</b>
                </p>
                <i aria-hidden="true">VS</i>
                <p>
                  <small>玩家防御</small>
                  <b>{resolution.defense}</b>
                </p>
              </div>
              <p className="zombie-siege-alert__outcome">{outcomeText(resolution)}</p>
            </>
          ) : (
            <p>所有防线接受尸潮冲击</p>
          )}
        </div>
      </div>
    </div>
  );
}

function outcomeText(resolution: NonNullable<GameAnimationEvent["zombieSiegeResolution"]>): string {
  const names = resolution.playerNames.join("、");
  if (resolution.outcome === "defenderPoint") return `${names} 获得卡坦保卫者得分牌`;
  if (resolution.outcome === "developmentCards") return `${names} 各获得 1 张发展卡`;
  if (resolution.outcome === "fortressDowngrade") return `${names} 的 1 座堡垒将被破坏并降级为营地`;
  return "无事发生";
}
