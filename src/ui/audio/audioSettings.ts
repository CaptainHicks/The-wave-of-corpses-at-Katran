export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  lastMusicVolume: number;
  lastSfxVolume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 70,
  sfxVolume: 80,
  muted: false,
  lastMusicVolume: 70,
  lastSfxVolume: 80
};

const AUDIO_SETTINGS_KEY = "zombie-catan-audio-settings";
const AUDIO_SETTINGS_EVENT = "zombie-catan-audio-settings-changed";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clampPercent(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function normalizeAudioSettings(settings: Partial<AudioSettings> = {}): AudioSettings {
  let musicVolume = clampPercent(settings.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume);
  let sfxVolume = clampPercent(settings.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume);
  let lastMusicVolume = clampPercent(settings.lastMusicVolume, musicVolume);
  let lastSfxVolume = clampPercent(settings.lastSfxVolume, sfxVolume);

  if (lastMusicVolume === 0 && lastSfxVolume === 0) {
    lastMusicVolume = DEFAULT_AUDIO_SETTINGS.lastMusicVolume;
    lastSfxVolume = DEFAULT_AUDIO_SETTINGS.lastSfxVolume;
  }

  if (!settings.muted && (musicVolume > 0 || sfxVolume > 0)) {
    lastMusicVolume = musicVolume;
    lastSfxVolume = sfxVolume;
  }

  if (musicVolume === 0 && sfxVolume === 0) {
    musicVolume = lastMusicVolume;
    sfxVolume = lastSfxVolume;
  }

  return {
    musicVolume,
    sfxVolume,
    muted: settings.muted === true,
    lastMusicVolume,
    lastSfxVolume
  };
}

export function loadAudioSettings(): AudioSettings {
  if (!canUseStorage()) return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const normalized = normalizeAudioSettings(JSON.parse(raw) as Partial<AudioSettings>);
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function saveAudioSettings(settings: AudioSettings): AudioSettings {
  const normalized = normalizeAudioSettings(settings);
  if (canUseStorage()) {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent<AudioSettings>(AUDIO_SETTINGS_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function updateAudioSettings(nextSettings: Partial<AudioSettings>): AudioSettings {
  return saveAudioSettings({ ...loadAudioSettings(), ...nextSettings });
}

export function listenAudioSettings(listener: (settings: AudioSettings) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handleChange = (event: Event) => {
    listener(event instanceof CustomEvent ? normalizeAudioSettings(event.detail) : loadAudioSettings());
  };
  window.addEventListener(AUDIO_SETTINGS_EVENT, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(AUDIO_SETTINGS_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}
