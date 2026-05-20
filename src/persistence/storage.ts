import type { GameState } from "../domain/types";

const STORAGE_KEY = "zombie-catan-hot-seat-state";
const SAVE_VERSION = "action-phase-v10";

interface SaveEnvelope {
  version: string;
  state: GameState;
}

export function saveGame(state: GameState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION, state } satisfies SaveEnvelope));
}

export function loadGame(): GameState | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as GameState | SaveEnvelope;
    if ("version" in parsed && parsed.version === SAVE_VERSION) return parsed.state;
    localStorage.removeItem(STORAGE_KEY);
    return undefined;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return undefined;
  }
}

export function clearSavedGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportGame(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function importGame(raw: string): GameState {
  const parsed = JSON.parse(raw) as GameState | SaveEnvelope;
  return "state" in parsed ? parsed.state : parsed;
}
