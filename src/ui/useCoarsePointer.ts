import { useEffect, useState } from "react";

const COARSE_POINTER_QUERY = "(pointer: coarse), (any-pointer: coarse), (hover: none)";

function detectCoarsePointer() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

export function useCoarsePointer() {
  const [isCoarsePointer, setIsCoarsePointer] = useState(detectCoarsePointer);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(COARSE_POINTER_QUERY);
    const sync = () => setIsCoarsePointer(mediaQuery.matches);
    sync();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync);
      return () => mediaQuery.removeEventListener("change", sync);
    }
    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, []);

  return isCoarsePointer;
}
