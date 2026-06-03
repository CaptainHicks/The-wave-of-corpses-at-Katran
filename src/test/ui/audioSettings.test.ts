import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDIO_SETTINGS, loadAudioSettings, updateAudioSettings } from "../../ui/audio/audioSettings";

const AUDIO_SETTINGS_KEY = "zombie-catan-audio-settings";

describe("audio settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("migrates old one-click mute storage back to audible defaults", () => {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ musicVolume: 0, sfxVolume: 0 }));

    expect(loadAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("keeps the mute flag while restoring audible slider values from broken mute storage", () => {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ musicVolume: 0, sfxVolume: 0, muted: true }));

    expect(loadAudioSettings()).toEqual({ ...DEFAULT_AUDIO_SETTINGS, muted: true });
  });

  it("restores broken zero volumes from the player's last saved volume", () => {
    window.localStorage.setItem(
      AUDIO_SETTINGS_KEY,
      JSON.stringify({ musicVolume: 0, sfxVolume: 0, muted: true, lastMusicVolume: 35, lastSfxVolume: 45 })
    );

    expect(loadAudioSettings()).toEqual({
      musicVolume: 35,
      sfxVolume: 45,
      muted: true,
      lastMusicVolume: 35,
      lastSfxVolume: 45
    });
  });

  it("keeps mute as a separate flag without losing slider volumes", () => {
    const muted = updateAudioSettings({ muted: true });

    expect(muted).toEqual({ ...DEFAULT_AUDIO_SETTINGS, muted: true });
    expect(loadAudioSettings()).toEqual({ ...DEFAULT_AUDIO_SETTINGS, muted: true });
  });
});
