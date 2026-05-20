import { RESOURCES } from "../../domain/constants";
import type { PlayerState, Resource } from "../../domain/types";
import type { GameAnimationEvent } from "../animation/animationTypes";
import { ResourceCardStack } from "./ResourceCardStack";

export function ResourceHand({
  player,
  animationEvents = []
}: {
  player: PlayerState;
  animationEvents?: GameAnimationEvent[];
}) {
  const changedResources = new Set<Resource>(
    animationEvents
      .filter((event) => event.playerId === player.id && (event.kind === "resourceGain" || event.kind === "resourceSpend"))
      .flatMap((event) => (event.resource ? [event.resource] : []))
  );

  return (
    <div className="resource-hand" aria-label="资源手牌">
      {RESOURCES.map((resource) => (
        <ResourceCardStack
          key={resource}
          resource={resource}
          amount={player.resources[resource]}
          changed={changedResources.has(resource)}
        />
      ))}
    </div>
  );
}
