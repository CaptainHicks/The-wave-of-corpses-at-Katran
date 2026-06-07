import { Skull } from "lucide-react";
import type { GameState } from "../../domain/types";

export function ZombieInfoPanel({ state }: { state: GameState }) {
  return (
    <section className="panel compact rail-section zombie-info-panel zombie-progress-panel">
      <h2>
        <Skull size={18} />
        尸潮围城进度
      </h2>
      <strong className="zombie-progress-value">{state.zombieTrack}/6</strong>
    </section>
  );
}
