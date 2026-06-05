import { Music, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { DEFAULT_AUDIO_SETTINGS } from "./audioSettings";
import { gameAudio } from "./audioController";
import { useAudioSettings } from "./useAudio";

interface AudioSettingsPanelProps {
  className?: string;
  deferApply?: boolean;
  showActions?: boolean;
  onApply?: () => void;
}

const AUDIO_VOLUME_CONTROLS = [
  {
    key: "musicVolume",
    label: "游戏背景音乐音量",
    description: "调整游戏背景音乐的音量大小",
    icon: Music
  },
  {
    key: "sfxVolume",
    label: "游戏音效音量",
    description: "调整游戏音效的音量大小",
    icon: Volume2
  }
] as const;

type AudioVolumeKey = (typeof AUDIO_VOLUME_CONTROLS)[number]["key"];

export function AudioSettingsPanel({ className = "", deferApply = false, showActions = false, onApply }: AudioSettingsPanelProps) {
  const { settings, updateSettings } = useAudioSettings();
  const [draftSettings, setDraftSettings] = useState(settings);

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  const visibleSettings = deferApply ? draftSettings : settings;
  const isMuted = visibleSettings.muted || (visibleSettings.musicVolume === 0 && visibleSettings.sfxVolume === 0);

  const handleVolumeChange = (key: AudioVolumeKey, value: number) => {
    if (deferApply) {
      setDraftSettings((currentSettings) => ({ ...currentSettings, [key]: value, muted: false }));
      return;
    }

    updateSettings({ [key]: value, muted: false });
    if (key === "sfxVolume") {
      gameAudio.unlock();
      gameAudio.playClick();
    }
  };

  const handleReset = () => {
    if (deferApply) {
      setDraftSettings(DEFAULT_AUDIO_SETTINGS);
      return;
    }

    updateSettings(DEFAULT_AUDIO_SETTINGS);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      const hasCurrentVolume = visibleSettings.musicVolume > 0 || visibleSettings.sfxVolume > 0;
      const nextSettings = {
        musicVolume: hasCurrentVolume ? visibleSettings.musicVolume : visibleSettings.lastMusicVolume,
        sfxVolume: hasCurrentVolume ? visibleSettings.sfxVolume : visibleSettings.lastSfxVolume,
        muted: false
      };
      if (deferApply) {
        setDraftSettings((currentSettings) => ({ ...currentSettings, ...nextSettings }));
        return;
      }
      updateSettings(nextSettings);
      return;
    }

    if (deferApply) {
      setDraftSettings((currentSettings) => ({ ...currentSettings, muted: true }));
      return;
    }
    updateSettings({ muted: true });
  };

  const handleApply = () => {
    updateSettings(visibleSettings);
    onApply?.();
  };

  return (
    <div className={["audio-settings-panel", className].filter(Boolean).join(" ")}>
      {AUDIO_VOLUME_CONTROLS.map((control) => (
        <VolumeControl
          key={control.key}
          icon={control.icon}
          label={control.label}
          description={control.description}
          value={visibleSettings[control.key]}
          onChange={(value) => handleVolumeChange(control.key, value)}
        />
      ))}
      {showActions ? (
        <div className="audio-settings-actions">
          <button type="button" className="audio-settings-reset-button" onClick={handleReset}>
            <RotateCcw size={18} />
            恢复默认
          </button>
          <button
            type="button"
            className={isMuted ? "audio-settings-mute-button muted" : "audio-settings-mute-button"}
            aria-pressed={isMuted}
            onClick={handleToggleMute}
          >
            {isMuted ? <Volume2 size={18} /> : <VolumeX size={18} />}
            {isMuted ? "一键恢复音量" : "一键静音"}
          </button>
          {deferApply ? (
            <button type="button" className="audio-settings-apply-button" onClick={handleApply}>
              应用设置
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function VolumeControl({
  icon: Icon,
  label,
  description,
  value,
  onChange
}: {
  icon: typeof Volume2;
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="audio-volume-control">
      <span className="audio-volume-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="audio-volume-body">
        <span className="audio-volume-label-row">
          <span>
            <span className="audio-volume-label">{label}</span>
            <small>{description}</small>
          </span>
          <strong>{value}%</strong>
        </span>
        <span className="audio-volume-slider-wrap">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={value}
            aria-label={label}
            style={{ "--audio-volume-percent": `${value}%` } as CSSProperties}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </span>
        <span className="audio-volume-scale" aria-hidden="true">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </span>
      </span>
    </label>
  );
}
