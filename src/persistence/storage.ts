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

// 延迟写入:把昂贵的全量 JSON.stringify 合并到空闲帧,避免每条指令都同步阻塞主线程。
// 页面隐藏/卸载时会把最新状态强制落盘,确保不丢存档。
let pendingSaveState: GameState | undefined;
let pendingSaveHandle: number | undefined;
let pendingSaveIsIdle = false;
let unloadFlushInstalled = false;

interface IdleCapableWindow {
  requestIdleCallback?: (handler: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

function flushPendingSave(): void {
  if (pendingSaveHandle !== undefined) {
    if (pendingSaveIsIdle) {
      (window as Window & IdleCapableWindow).cancelIdleCallback?.(pendingSaveHandle);
    } else {
      window.clearTimeout(pendingSaveHandle);
    }
    pendingSaveHandle = undefined;
  }
  if (pendingSaveState === undefined) return;
  const state = pendingSaveState;
  pendingSaveState = undefined;
  saveGame(state);
}

function ensureUnloadFlush(): void {
  if (unloadFlushInstalled || typeof window === "undefined") return;
  unloadFlushInstalled = true;
  window.addEventListener("pagehide", flushPendingSave);
  window.addEventListener("beforeunload", flushPendingSave);
}

export function scheduleSaveGame(state: GameState): void {
  if (typeof window === "undefined") {
    saveGame(state);
    return;
  }
  ensureUnloadFlush();
  pendingSaveState = state;
  if (pendingSaveHandle !== undefined) return;
  const idleWindow = window as Window & IdleCapableWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    pendingSaveIsIdle = true;
    pendingSaveHandle = idleWindow.requestIdleCallback(() => {
      pendingSaveHandle = undefined;
      flushPendingSave();
    }, { timeout: 1000 });
  } else {
    pendingSaveIsIdle = false;
    pendingSaveHandle = window.setTimeout(() => {
      pendingSaveHandle = undefined;
      flushPendingSave();
    }, 400);
  }
}

export function loadGame(): GameState | undefined {
  // 先把待写入的存档落盘,确保读到的是最新状态。
  flushPendingSave();
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
  // 丢弃尚未落盘的存档,避免清档后又被延迟写入覆盖。
  pendingSaveState = undefined;
  localStorage.removeItem(STORAGE_KEY);
}
