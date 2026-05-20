const ONLINE_SESSION_STORAGE_KEY = "zombie-catan-online-session";

export interface SavedOnlineSession {
  roomCode: string;
  sessionToken: string;
}

export function loadSavedOnlineSession(): SavedOnlineSession | undefined {
  if (!canUseStorage()) return undefined;
  try {
    const raw = window.localStorage.getItem(ONLINE_SESSION_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SavedOnlineSession;
    if (!parsed.roomCode || !parsed.sessionToken) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveOnlineSession(session: SavedOnlineSession): SavedOnlineSession {
  if (canUseStorage()) {
    window.localStorage.setItem(ONLINE_SESSION_STORAGE_KEY, JSON.stringify(session));
  }
  return session;
}

export function clearOnlineSession(): void {
  if (canUseStorage()) {
    window.localStorage.removeItem(ONLINE_SESSION_STORAGE_KEY);
  }
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
