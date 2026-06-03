import { Disc3 } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import type { GameState } from "../../domain/types";
import { gameAudio } from "../audio/audioController";
import type { TurnUiMode } from "../selectors/turnUiMode";

const DIE_REEL_CYCLE = [1, 5, 2, 6, 3, 4];
const TOTAL_REEL_CYCLE = [8, 3, 11, 5, 10, 2, 12, 4, 9, 6, 7];
const REEL_SPIN_STEPS = 18;
const DIE_REEL_VALUES = buildReelValues(DIE_REEL_CYCLE);
const TOTAL_REEL_VALUES = buildReelValues(TOTAL_REEL_CYCLE);
const REEL_SPIN_DURATION_MS = 1800;
const REEL_STEP_DURATION_MS = REEL_SPIN_DURATION_MS / REEL_SPIN_STEPS;

function buildReelValues(cycle: readonly number[]): number[] {
  return Array.from({ length: REEL_SPIN_STEPS }, (_, index) => cycle[index % cycle.length]);
}

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
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
    if (prefersReducedMotion()) {
      setIsSpinning(false);
      return undefined;
    }
    setIsSpinning(true);

    const startedAt = performance.now();
    let lastSoundStep = 0;
    let frameId = 0;

    const syncSlotTicks = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const currentStep = Math.min(REEL_SPIN_STEPS, Math.floor(elapsed / REEL_STEP_DURATION_MS));
      if (lastSoundStep < currentStep) {
        lastSoundStep = currentStep;
        gameAudio.playSlotTick();
      }

      if (elapsed >= REEL_SPIN_DURATION_MS) {
        setIsSpinning(false);
        return;
      }

      frameId = window.requestAnimationFrame(syncSlotTicks);
    };

    frameId = window.requestAnimationFrame(syncSlotTicks);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [diceA, diceB]);

  return (
    <section className="panel compact rail-section dice-slot-panel">
      <h2>
        <Disc3 size={18} />
        掷骰结果
      </h2>
      <div className={isSpinning ? "slot-machine is-spinning" : "slot-machine"}>
        <SlotReel
          value={diceA ?? "?"}
          spinKey={spinKey}
          spinning={isSpinning}
          reelValues={DIE_REEL_VALUES}
        />
        <span className="slot-operator">+</span>
        <SlotReel
          value={diceB ?? "?"}
          spinKey={spinKey + 1}
          spinning={isSpinning}
          reelValues={DIE_REEL_VALUES}
        />
        <span className="slot-operator">=</span>
        <SlotReel
          value={total ?? "?"}
          spinKey={spinKey + 2}
          spinning={isSpinning}
          reelValues={TOTAL_REEL_VALUES}
        />
      </div>
    </section>
  );
}

function SlotReel({
  value,
  spinKey,
  spinning,
  reelValues
}: {
  value: number | string;
  spinKey: number;
  spinning: boolean;
  reelValues: readonly number[];
}) {
  const values = spinning ? [...reelValues, value] : [value];
  const animationStyle = spinning
    ? ({
        "--slot-spin-duration": `${REEL_SPIN_DURATION_MS}ms`,
        "--slot-spin-steps": REEL_SPIN_STEPS
      } as CSSProperties)
    : undefined;
  return (
    <div className="slot-reel" aria-label={`点数 ${value}`}>
      <div
        key={`${spinKey}-${value}-${spinning}`}
        className={spinning ? "slot-reel-strip spin" : "slot-reel-strip"}
        style={animationStyle}
      >
        {values.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}
