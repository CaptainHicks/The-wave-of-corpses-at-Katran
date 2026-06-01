import { Disc3 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GameState } from "../../domain/types";
import { gameAudio } from "../audio/audioController";
import type { TurnUiMode } from "../selectors/turnUiMode";

const REEL_VALUES = [8, 3, 11, 5, 10, 2, 12];
const REEL_SPIN_DURATION_MS = 920;
const REEL_TICK_DELAYS_MS = [0, 92, 176, 262, 364, 496, 664, 850] as const;
const REEL_START_DELAYS_MS = [0, 70, 130] as const;

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function scheduleSlotTicks(): number[] {
  if (prefersReducedMotion()) return [];
  return REEL_START_DELAYS_MS.flatMap((reelDelay) =>
    REEL_TICK_DELAYS_MS.map((tickDelay) => window.setTimeout(() => gameAudio.playSlotTick(), reelDelay + tickDelay))
  );
}

export function DiceResultPanel({ state }: { state: GameState; mode: TurnUiMode }) {
  const diceA = state.dice?.[0];
  const diceB = state.dice?.[1];
  const total = diceA && diceB ? diceA + diceB : undefined;
  const [spinKey, setSpinKey] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    if (diceA == null || diceB == null) {
      setIsSpinning(false);
      return undefined;
    }
    setSpinKey((key) => key + 1);
    setIsSpinning(true);
    const tickTimeouts = scheduleSlotTicks();
    const timeout = window.setTimeout(() => setIsSpinning(false), REEL_SPIN_DURATION_MS);
    return () => {
      window.clearTimeout(timeout);
      tickTimeouts.forEach((tickTimeout) => window.clearTimeout(tickTimeout));
    };
  }, [diceA, diceB]);

  return (
    <section className="panel compact rail-section dice-slot-panel">
      <h2>
        <Disc3 size={18} />
        掷骰结果
      </h2>
      <div className={isSpinning ? "slot-machine is-spinning" : "slot-machine"}>
        <SlotReel value={diceA ?? "?"} spinKey={spinKey} spinning={isSpinning} />
        <span className="slot-operator">+</span>
        <SlotReel value={diceB ?? "?"} spinKey={spinKey + 1} spinning={isSpinning} />
        <span className="slot-operator">=</span>
        <SlotReel value={total ?? "?"} spinKey={spinKey + 2} spinning={isSpinning} />
      </div>
    </section>
  );
}

function SlotReel({
  value,
  spinKey,
  spinning
}: {
  value: number | string;
  spinKey: number;
  spinning: boolean;
}) {
  const values = spinning ? [...REEL_VALUES, value] : [value];
  return (
    <div className="slot-reel" aria-label={`点数 ${value}`}>
      <div key={`${spinKey}-${value}-${spinning}`} className={spinning ? "slot-reel-strip spin" : "slot-reel-strip"}>
        {values.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}
