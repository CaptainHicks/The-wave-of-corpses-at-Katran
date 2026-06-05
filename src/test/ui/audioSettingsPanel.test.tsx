import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSettingsPanel } from "../../ui/audio/AudioSettingsPanel";

const audioMocks = vi.hoisted(() => ({
  setAudioSettings: vi.fn(),
  unlock: vi.fn(),
  playClick: vi.fn()
}));

vi.mock("../../ui/audio/audioController", () => ({
  gameAudio: audioMocks
}));

const AUDIO_SETTINGS_KEY = "zombie-catan-audio-settings";

describe("AudioSettingsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    audioMocks.setAudioSettings.mockClear();
    audioMocks.unlock.mockClear();
    audioMocks.playClick.mockClear();
  });

  it("applies slider changes immediately and previews sfx volume", () => {
    render(<AudioSettingsPanel showActions />);

    fireEvent.change(screen.getByLabelText("游戏背景音乐音量"), { target: { value: "40" } });
    expect(JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toMatchObject({
      musicVolume: 40,
      muted: false
    });

    fireEvent.change(screen.getByLabelText("游戏音效音量"), { target: { value: "30" } });

    expect(JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toMatchObject({
      musicVolume: 40,
      sfxVolume: 30,
      muted: false
    });
    expect(audioMocks.unlock).toHaveBeenCalled();
    expect(audioMocks.playClick).toHaveBeenCalled();
  });

  it("offers mute and restore without losing the slider values", () => {
    render(<AudioSettingsPanel showActions />);

    fireEvent.change(screen.getByLabelText("游戏背景音乐音量"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("游戏音效音量"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /一键静音/ }));

    expect(JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toMatchObject({
      musicVolume: 35,
      sfxVolume: 45,
      muted: true
    });
    expect(screen.getByRole("button", { name: /一键恢复音量/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /一键恢复音量/ }));

    expect(JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toMatchObject({
      musicVolume: 35,
      sfxVolume: 45,
      muted: false
    });
  });
});
