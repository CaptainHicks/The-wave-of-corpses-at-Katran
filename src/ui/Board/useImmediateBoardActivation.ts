import { useRef, type MouseEvent, type PointerEvent } from "react";

const SYNTHETIC_CLICK_GUARD_MS = 750;

export function useImmediateBoardActivation(onActivate: () => void) {
  const lastPointerActivationAt = useRef(Number.NEGATIVE_INFINITY);

  return {
    onPointerUp: (event: PointerEvent<SVGGElement>) => {
      if (event.pointerType === "mouse") return;
      event.preventDefault();
      lastPointerActivationAt.current = performance.now();
      onActivate();
    },
    onClick: (event: MouseEvent<SVGGElement>) => {
      event.stopPropagation();
      if (performance.now() - lastPointerActivationAt.current < SYNTHETIC_CLICK_GUARD_MS) return;
      onActivate();
    }
  };
}
