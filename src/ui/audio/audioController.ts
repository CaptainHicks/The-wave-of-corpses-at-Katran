import type { GameAnimationInput } from "../animation/animationTypes";
import { gameplayMusic, menuMusic, settlementMusic, soundEffects, type AudioAssetSource } from "./audioAssets";
import type { AudioSettings } from "./audioSettings";
import { loadAudioSettings, normalizeAudioSettings } from "./audioSettings";

type MusicMode = "menu" | "gameplay" | "settlement-clear" | "settlement-over";

const MUSIC_CHANNEL_KEY = "__zombieCatanMusicChannel";
const MUSIC_UNLOAD_STOPPER_KEY = "__zombieCatanMusicUnloadStopper";
const HTML_SFX_POOL_SIZE = 6;

type BufferedSfxKey = keyof typeof soundEffects;

type SfxPlaybackOptions = {
  gain?: number;
  throttleMs?: number;
  delayMs?: number;
  throttleKey?: string;
};

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
  private unlocked = false;
  private currentMode?: MusicMode;
  private musicTracks: string[] = [];
  private musicIndex = 0;
  private sfxLastPlayed = new Map<string, number>();
  private sfxElements = new Map<BufferedSfxKey, HTMLAudioElement[]>();
  private sfxElementIndex = new Map<BufferedSfxKey, number>();
  private sfxSources = new Map<BufferedSfxKey, AudioAssetSource>();
  private sfxContext?: AudioContext;
  private sfxBuffers = new Map<BufferedSfxKey, AudioBuffer>();
  private sfxBufferLoads = new Map<BufferedSfxKey, Promise<void>>();
  private settings: AudioSettings = loadAudioSettings();

  constructor() {
    if (!this.enabled) return;
    this.music = getSharedMusicChannel();
    this.bindMusicEnded();
    this.resolveSfxSources();
    this.prepareHtmlSfxElements();
  }

  unlock(): void {
    if (!this.enabled || this.unlocked) return;
    this.unlocked = true;
    this.resumeSfxContext();
    this.scheduleSfxWarmup();
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
    this.playBufferedSfx("uiHover", { gain: 0.8, throttleMs: 90 });
  }

  playSlotTick(): void {
    this.playBufferedSfx("uiHover", { gain: 0.7, throttleKey: "slotTick" });
  }

  playClick(): void {
    this.playBufferedSfx("uiClick", { gain: 1, throttleMs: 55 });
  }

  playAnimationEvents(events: GameAnimationInput[]): void {
    if (events.some((event) => event.kind === "zombieMove")) {
      this.playBufferedSfx("zombieMove", { gain: 1, throttleMs: 240 });
    }
    if (events.some((event) => event.kind === "zombieTrackAdvance" && (event.amount ?? 0) < 0)) {
      this.playBufferedSfx("zombieCrowd", { gain: 1.25, throttleMs: 600, delayMs: 160 });
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
    this.music.volume = this.settings.muted ? 0 : this.settings.musicVolume / 100;
  }

  private playBufferedSfx(key: BufferedSfxKey, options: SfxPlaybackOptions = {}): void {
    if (!this.enabled) return;

    if (options.delayMs && options.delayMs > 0) {
      window.setTimeout(() => {
        void this.playBufferedSfxNow(key, options);
      }, options.delayMs);
    } else {
      void this.playBufferedSfxNow(key, options);
    }
  }

  private async playBufferedSfxNow(key: BufferedSfxKey, options: SfxPlaybackOptions): Promise<void> {
    const volume = this.effectiveSfxVolume(options.gain ?? 1);
    if (volume <= 0) return;

    const now = performance.now();
    const throttleMs = options.throttleMs ?? 0;
    const throttleKey = options.throttleKey ?? key;
    const lastPlayed = this.sfxLastPlayed.get(throttleKey) ?? Number.NEGATIVE_INFINITY;
    if (now - lastPlayed < throttleMs) return;
    this.sfxLastPlayed.set(throttleKey, now);

    if (!this.unlocked) {
      this.playHtmlSfx(key, volume);
      return;
    }

    const context = this.getSfxContext();
    if (!context) {
      this.playHtmlSfx(key, volume);
      return;
    }

    let buffer = this.sfxBuffers.get(key);
    if (!buffer) {
      this.playHtmlSfx(key, volume);
      void this.primeSfxBuffer(key);
      return;
    }

    if (!this.isSfxContextRunning(context)) {
      await this.resumeSfxContext();
      if (!this.isSfxContextRunning(context)) {
        this.playHtmlSfx(key, volume);
        return;
      }
    }

    this.startBufferedSfx(context, buffer, volume);
  }

  private startBufferedSfx(context: AudioContext, buffer: AudioBuffer, volume: number): void {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(context.currentTime);
  }

  private effectiveSfxVolume(gainScale: number): number {
    return this.settings.muted ? 0 : Math.min(1, Math.max(0, (this.settings.sfxVolume / 100) * gainScale));
  }

  private getSfxContext(): AudioContext | undefined {
    if (this.sfxContext) return this.sfxContext;
    const AudioContextCtor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return undefined;
    this.sfxContext = new AudioContextCtor();
    return this.sfxContext;
  }

  private resumeSfxContext(): Promise<void> {
    const context = this.getSfxContext();
    if (!context || context.state === "running") return Promise.resolve();
    return context.resume().catch(() => undefined);
  }

  private isSfxContextRunning(context: AudioContext): boolean {
    return context.state === "running";
  }

  private primeSfxBuffers(): void {
    (Object.keys(soundEffects) as BufferedSfxKey[]).forEach((key) => {
      void this.primeSfxBuffer(key);
    });
  }

  private scheduleSfxWarmup(): void {
    const warmup = () => this.primeSfxBuffers();
    const requestIdle = (
      window as Window & {
        requestIdleCallback?: (handler: () => void, options?: { timeout?: number }) => number;
      }
    ).requestIdleCallback;

    if (requestIdle) {
      requestIdle(warmup, { timeout: 2500 });
      return;
    }

    window.setTimeout(warmup, 1200);
  }

  private prepareHtmlSfxElements(): void {
    (Object.keys(soundEffects) as BufferedSfxKey[]).forEach((key) => {
      const source = this.sfxSources.get(key);
      if (!source) return;
      const elements = Array.from({ length: HTML_SFX_POOL_SIZE }, () => {
        const element = new Audio(source.src);
        element.preload = "none";
        return element;
      });
      this.sfxElements.set(key, elements);
      this.sfxElementIndex.set(key, 0);
    });
  }

  private playHtmlSfx(key: BufferedSfxKey, volume: number): void {
    const elements = this.sfxElements.get(key);
    if (!elements || elements.length === 0) return;
    const index = this.sfxElementIndex.get(key) ?? 0;
    const element = elements[index % elements.length];
    if (!element) return;
    this.sfxElementIndex.set(key, (index + 1) % elements.length);
    element.volume = volume;
    try {
      element.currentTime = 0;
    } catch {
      element.load();
    }
    const result = element.play();
    if (result) result.catch(() => undefined);
  }

  private primeSfxBuffer(key: BufferedSfxKey): Promise<void> {
    if (this.sfxBuffers.has(key)) return Promise.resolve();
    const existing = this.sfxBufferLoads.get(key);
    if (existing) return existing;
    const context = this.getSfxContext();
    if (!context) return Promise.resolve();
    const source = this.sfxSources.get(key);
    if (!source) return Promise.resolve();

    const load = fetch(source.src)
      .then((response) => response.arrayBuffer())
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        this.sfxBuffers.set(key, buffer);
      })
      .catch(() => undefined)
      .then(() => {
        this.sfxBufferLoads.delete(key);
      });
    this.sfxBufferLoads.set(key, load);
    return load;
  }

  private resolveSfxSources(): void {
    const probe = new Audio();
    (Object.keys(soundEffects) as BufferedSfxKey[]).forEach((key) => {
      const sources = soundEffects[key];
      const supported = sources.find((source) => probe.canPlayType(source.type) !== "");
      this.sfxSources.set(key, supported ?? sources[0]);
    });
  }
}

export const gameAudio = new AudioController();

declare global {
  interface Window {
    [MUSIC_CHANNEL_KEY]?: HTMLAudioElement;
    [MUSIC_UNLOAD_STOPPER_KEY]?: () => void;
  }
}
