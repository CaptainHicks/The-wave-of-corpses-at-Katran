import type { GameAnimationInput } from "../animation/animationTypes";
import { gameplayMusic, menuMusic, settlementMusic, soundEffects } from "./audioAssets";
import type { AudioSettings } from "./audioSettings";
import { loadAudioSettings, normalizeAudioSettings } from "./audioSettings";

type MusicMode = "menu" | "gameplay" | "settlement-clear" | "settlement-over";

const MUSIC_CHANNEL_KEY = "__zombieCatanMusicChannel";
const MUSIC_UNLOAD_STOPPER_KEY = "__zombieCatanMusicUnloadStopper";

function hasAudioRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Audio !== "undefined" &&
    !(typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("jsdom"))
  );
}

function getSharedMusicChannel(): HTMLAudioElement | undefined {
  if (!hasAudioRuntime()) return undefined;
  const existing = window[MUSIC_CHANNEL_KEY];
  const music = existing ?? new Audio();
  if (existing) resetMusicElement(existing);
  music.preload = "auto";
  window[MUSIC_CHANNEL_KEY] = music;
  installUnloadStopper(music);
  return music;
}

function resetMusicElement(music: HTMLAudioElement): void {
  music.pause();
  music.onended = null;
  music.loop = false;
  try {
    music.currentTime = 0;
  } catch {
    // Some browsers reject seeking an unloaded media element.
  }
  music.removeAttribute("src");
  music.load();
}

function installUnloadStopper(music: HTMLAudioElement): void {
  const existingStopper = window[MUSIC_UNLOAD_STOPPER_KEY];
  if (existingStopper) {
    window.removeEventListener("pagehide", existingStopper);
    window.removeEventListener("beforeunload", existingStopper);
  }
  const stop = () => resetMusicElement(music);
  window[MUSIC_UNLOAD_STOPPER_KEY] = stop;
  window.addEventListener("pagehide", stop);
  window.addEventListener("beforeunload", stop);
}

function nextPlaylistIndex(currentIndex: number, playlistLength: number): number {
  if (playlistLength <= 1) return 0;
  return (currentIndex + 1) % playlistLength;
}

class AudioController {
  private readonly enabled = hasAudioRuntime();
  private readonly music?: HTMLAudioElement;
  private currentMode?: MusicMode;
  private musicTracks: string[] = [];
  private musicIndex = 0;
  private sfxLastPlayed = new Map<string, number>();
  private settings: AudioSettings = loadAudioSettings();

  constructor() {
    if (!this.enabled) return;
    this.music = getSharedMusicChannel();
    this.bindMusicEnded();
  }

  unlock(): void {
    if (!this.enabled) return;
    this.playMusic();
  }

  setMusic(mode: MusicMode): void {
    if (!this.enabled || !this.music) return;
    if (this.currentMode === mode) {
      this.applyMusicVolume();
      return;
    }
    const tracks = this.tracksForMode(mode);
    if (tracks.length === 0) return;

    this.stopMusic();
    this.bindMusicEnded();
    this.currentMode = mode;
    this.musicTracks = tracks;
    this.musicIndex = mode === "gameplay" ? Math.floor(Math.random() * tracks.length) : 0;
    this.music.src = tracks[this.musicIndex];
    this.music.loop = mode !== "gameplay" || tracks.length === 1;
    this.applyMusicVolume();
    this.music.load();
    this.playMusic();
  }

  setAudioSettings(settings: Partial<AudioSettings>): void {
    this.settings = normalizeAudioSettings(settings);
    this.applyMusicVolume();
  }

  playHover(): void {
    this.playSfx(soundEffects.uiHover, { gain: 0.58, throttleMs: 90 });
  }

  playClick(): void {
    this.playSfx(soundEffects.uiClick, { gain: 0.8, throttleMs: 55 });
  }

  playAnimationEvents(events: GameAnimationInput[]): void {
    if (events.some((event) => event.kind === "zombieMove")) {
      this.playSfx(soundEffects.zombieMove, { gain: 1, throttleMs: 240 });
    }
    if (events.some((event) => event.kind === "zombieTrackAdvance" && (event.amount ?? 0) < 0)) {
      this.playSfx(soundEffects.zombieCrowd, { gain: 1.25, throttleMs: 600, delayMs: 160 });
    }
  }

  private tracksForMode(mode: MusicMode): string[] {
    if (mode === "menu") return [menuMusic];
    if (mode === "gameplay") return gameplayMusic;
    if (mode === "settlement-clear") return [settlementMusic.clear];
    return [settlementMusic.over];
  }

  private handleMusicEnded(): void {
    if (!this.enabled || !this.music || this.currentMode !== "gameplay") return;
    this.musicIndex = nextPlaylistIndex(this.musicIndex, this.musicTracks.length);
    this.stopMusic();
    this.bindMusicEnded();
    this.music.src = this.musicTracks[this.musicIndex];
    this.applyMusicVolume();
    this.music.load();
    this.playMusic();
  }

  private playMusic(): void {
    if (!this.enabled || !this.music || !this.music.src) return;
    const result = this.music.play();
    if (result) result.catch(() => undefined);
  }

  private stopMusic(): void {
    if (!this.music) return;
    resetMusicElement(this.music);
  }

  private bindMusicEnded(): void {
    if (!this.music) return;
    this.music.onended = () => this.handleMusicEnded();
  }

  private applyMusicVolume(): void {
    if (!this.music) return;
    this.music.volume = this.settings.musicVolume / 100;
  }

  private playSfx(
    src: string,
    options: { gain?: number; throttleMs?: number; delayMs?: number } = {}
  ): void {
    if (!this.enabled) return;

    const play = () => {
      const now = performance.now();
      const throttleMs = options.throttleMs ?? 0;
      const lastPlayed = this.sfxLastPlayed.get(src) ?? 0;
      if (now - lastPlayed < throttleMs) return;
      this.sfxLastPlayed.set(src, now);

      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = Math.min(1, Math.max(0, (this.settings.sfxVolume / 100) * (options.gain ?? 1)));
      const result = audio.play();
      if (result) result.catch(() => undefined);
    };

    if (options.delayMs && options.delayMs > 0) {
      window.setTimeout(play, options.delayMs);
    } else {
      play();
    }
  }
}

export const gameAudio = new AudioController();

declare global {
  interface Window {
    [MUSIC_CHANNEL_KEY]?: HTMLAudioElement;
    [MUSIC_UNLOAD_STOPPER_KEY]?: () => void;
  }
}
