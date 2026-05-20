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

const CLICK_SELECTOR = [
  HOVER_SELECTOR,
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
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);
}

export function useInteractiveAudioFeedback(): void {
  const lastHoverTarget = useRef<Element>();

  useEffect(() => {
    const handlePointerOver = (event: PointerEvent) => {
      const element = closestInteractive(event.target, HOVER_SELECTOR);
      if (!element || element === lastHoverTarget.current) return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      lastHoverTarget.current = element;
      gameAudio.playHover();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const element = closestInteractive(event.target, CLICK_SELECTOR);
      if (!element) return;
      gameAudio.unlock();
      gameAudio.playClick();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);
}

export function useAudioSettings(): {
  settings: AudioSettings;
  updateSettings: (settings: Partial<AudioSettings>) => void;
} {
  const [settings, setSettings] = useState<AudioSettings>(() => loadAudioSettings());

  useEffect(() => {
    gameAudio.setAudioSettings(settings);
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
