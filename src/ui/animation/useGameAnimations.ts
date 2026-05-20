import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameAnimationEvent, GameAnimationInput } from "./animationTypes";
import { useReducedMotion } from "./motionPrefs";

const DEFAULT_DURATION_MS = 880;
const REDUCED_DURATION_MS = 260;

export function useGameAnimations() {
  const reducedMotion = useReducedMotion();
  const [events, setEvents] = useState<GameAnimationEvent[]>([]);

  const pushEvents = useCallback(
    (nextEvents: GameAnimationInput[]) => {
      if (nextEvents.length === 0) return;
      const now = Date.now();
      setEvents((current) => [
        ...current,
        ...nextEvents.map((event) => ({
          ...event,
          createdAt: event.createdAt ?? now,
          durationMs: reducedMotion
            ? Math.min(event.durationMs ?? DEFAULT_DURATION_MS, REDUCED_DURATION_MS)
            : event.durationMs ?? DEFAULT_DURATION_MS
        }))
      ]);
    },
    [reducedMotion]
  );

  useEffect(() => {
    if (events.length === 0) return undefined;
    const now = Date.now();
    const nextExpiry = Math.min(...events.map((event) => event.createdAt + event.durationMs));
    const timeout = window.setTimeout(() => {
      const currentTime = Date.now();
      setEvents((current) => current.filter((event) => event.createdAt + event.durationMs > currentTime));
    }, Math.max(40, nextExpiry - now + 20));
    return () => window.clearTimeout(timeout);
  }, [events]);

  const isAnimating = useMemo(() => events.length > 0, [events.length]);

  return { events, pushEvents, isAnimating, reducedMotion };
}
