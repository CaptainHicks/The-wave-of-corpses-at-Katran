import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioSettings } from "./audioSettings";
import { listenAudioSettings, loadAudioSettings, updateAudioSettings } from "./audioSettings";
import { gameAudio } from "./audioController";

const HOVER_SELECTOR = [
  "button:not(:disabled)",
  "a[href]",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]:not([aria-disabled="true"])'
].join(",");

const BOARD_CLICK_SELECTOR = [
  "[data-tile-id]",
  "[data-edge-id]",
  "[data-vertex-id]"
].join(",");

function closestInteractive(target: EventTarget | null, selector: string): Element | undefined {
  if (!(target instanceof Element)) return undefined;
  const element = target.closest(selector);
  if (!element) return undefined;
  if (element.getAttribute("aria-disabled") === "true") return undefined;
  return element;
}

export function useMusicMode(mode: "menu" | "gameplay" | "settlement-clear" | "settlement-over"): void {
  useEffect(() => {
    gameAudio.setMusic(mode);
  }, [mode]);
}

export function useAudioUnlock(): void {
  useEffect(() => {
    const unlock = () => gameAudio.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("mousedown", unlock, { capture: true });
    window.addEventListener("touchstart", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("mousedown", unlock, { capture: true });
      window.removeEventListener("touchstart", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);
}

export function useInteractiveAudioFeedback(): void {
  const lastHoverTarget = useRef<Element>();
  const lastPointerDownAt = useRef(Number.NEGATIVE_INFINITY);
  const lastPointerOverAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    const handleHoverStart = (event: PointerEvent | MouseEvent) => {
      if (event.type === "pointerover") lastPointerOverAt.current = performance.now();
      if (event.type === "mouseover" && performance.now() - lastPointerOverAt.current < 80) return;
      const element = closestInteractive(event.target, HOVER_SELECTOR);
      if (!element) {
        lastHoverTarget.current = undefined;
        return;
      }
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      if (element === lastHoverTarget.current) return;
      lastHoverTarget.current = element;
      gameAudio.playHover();
    };

    const handleHoverEnd = (event: PointerEvent | MouseEvent) => {
      const element = closestInteractive(event.target, HOVER_SELECTOR);
      if (!element || element !== lastHoverTarget.current) return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      lastHoverTarget.current = undefined;
    };

    const handlePressStart = (event: PointerEvent | MouseEvent | TouchEvent) => {
      if (event.type === "pointerdown") lastPointerDownAt.current = performance.now();
      if ((event.type === "mousedown" || event.type === "touchstart") && performance.now() - lastPointerDownAt.current < 80) {
        return;
      }
      const element = closestInteractive(event.target, HOVER_SELECTOR);
      if (!element) return;
      gameAudio.unlock();
      gameAudio.playClick();
    };

    const handleClick = (event: MouseEvent) => {
      const element = closestInteractive(event.target, BOARD_CLICK_SELECTOR);
      if (!element) return;
      gameAudio.unlock();
      gameAudio.playClick();
    };

    document.addEventListener("pointerover", handleHoverStart, true);
    document.addEventListener("pointerout", handleHoverEnd, true);
    document.addEventListener("mouseover", handleHoverStart, true);
    document.addEventListener("mouseout", handleHoverEnd, true);
    document.addEventListener("pointerdown", handlePressStart, true);
    document.addEventListener("mousedown", handlePressStart, true);
    document.addEventListener("touchstart", handlePressStart, true);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("pointerover", handleHoverStart, true);
      document.removeEventListener("pointerout", handleHoverEnd, true);
      document.removeEventListener("mouseover", handleHoverStart, true);
      document.removeEventListener("mouseout", handleHoverEnd, true);
      document.removeEventListener("pointerdown", handlePressStart, true);
      document.removeEventListener("mousedown", handlePressStart, true);
      document.removeEventListener("touchstart", handlePressStart, true);
      document.removeEventListener("click", handleClick);
    };
  }, []);
}

export function useAudioSettings(): {
  settings: AudioSettings;
  updateSettings: (settings: Partial<AudioSettings>) => void;
} {
  const [settings, setSettings] = useState<AudioSettings>(() => loadAudioSettings());

  useEffect(() => {
    const loadedSettings = loadAudioSettings();
    setSettings(loadedSettings);
    gameAudio.setAudioSettings(loadedSettings);
    return listenAudioSettings((nextSettings) => {
      setSettings(nextSettings);
      gameAudio.setAudioSettings(nextSettings);
    });
  }, []);

  const updateSettings = useCallback((nextSettings: Partial<AudioSettings>) => {
    const updated = updateAudioSettings(nextSettings);
    setSettings(updated);
    gameAudio.setAudioSettings(updated);
  }, []);

  return { settings, updateSettings };
}
