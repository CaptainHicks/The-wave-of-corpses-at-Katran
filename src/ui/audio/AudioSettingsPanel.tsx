import { Volume2 } from "lucide-react";
import { useAudioSettings } from "./useAudio";

interface AudioSettingsPanelProps {
  className?: string;
}

export function AudioSettingsPanel({ className = "" }: AudioSettingsPanelProps) {
  const { settings, updateSettings } = useAudioSettings();

  return (
    <div className={["audio-settings-panel", className].filter(Boolean).join(" ")}>
      <VolumeControl
        label="游戏背景音乐音量"
        value={settings.musicVolume}
        onChange={(musicVolume) => updateSettings({ musicVolume })}
      />
      <VolumeControl
        label="游戏音效音量"
        value={settings.sfxVolume}
        onChange={(sfxVolume) => updateSettings({ sfxVolume })}
      />
    </div>
  );
}

function VolumeControl({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="audio-volume-control">
      <span className="audio-volume-icon" aria-hidden="true">
        <Volume2 size={18} />
      </span>
      <span className="audio-volume-label">{label}</span>
      <strong>{value}%</strong>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
