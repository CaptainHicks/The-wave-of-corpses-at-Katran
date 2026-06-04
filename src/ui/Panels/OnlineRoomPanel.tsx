import { Ban, Copy, LogOut, Music, Play, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { GameState } from "../../domain/types";
import { useAudioSettings } from "../audio/useAudio";
import { SystemMenuInfoSection } from "./PersistencePanel";

export function OnlineRoomPanel({
  state,
  roomCode,
  connectionState,
  onClose,
  onReconnect,
  onLeaveRoom
}: {
  state: GameState;
  roomCode: string;
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";
  onClose: () => void;
  onReconnect?: () => void;
  onLeaveRoom: () => void;
}) {
  const { settings, updateSettings } = useAudioSettings();
  const [copied, setCopied] = useState(false);
  const isMuted = settings.muted || (settings.musicVolume === 0 && settings.sfxVolume === 0);
  const canReconnect = connectionState === "disconnected" || connectionState === "reconnecting";

  const copyRoomCode = () => {
    void navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const toggleMute = () => {
    if (isMuted) {
      const hasCurrentVolume = settings.musicVolume > 0 || settings.sfxVolume > 0;
      updateSettings({
        musicVolume: hasCurrentVolume ? settings.musicVolume : settings.lastMusicVolume,
        sfxVolume: hasCurrentVolume ? settings.sfxVolume : settings.lastSfxVolume,
        muted: false
      });
      return;
    }

    updateSettings({ muted: true });
  };

  return (
    <section className="online-pause-menu system-menu-content" aria-label="联机暂停菜单内容">
      <div className="online-pause-section online-pause-actions-section">
        <div className="online-pause-section-heading">
          <span>
            <Ban size={22} />
            本局操作
          </span>
        </div>
        <div className="online-pause-action-grid">
          <button type="button" className="online-pause-action online-pause-action-danger" onClick={onLeaveRoom}>
            <LogOut size={42} />
            <span>
              <strong>离开在线房间</strong>
              <small>离开后将退出当前对局，其他玩家仍可继续游戏</small>
            </span>
          </button>
          <button type="button" className="online-pause-action online-pause-action-return" onClick={onClose}>
            <Play size={42} fill="currentColor" />
            <span>
              <strong>回到战局</strong>
            </span>
            <i aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="online-pause-section online-pause-room-section">
        <div className="online-pause-section-heading">
          <span>房间状态</span>
          <button
            type="button"
            className={canReconnect ? "online-pause-reconnect active" : "online-pause-reconnect"}
            disabled={!onReconnect || connectionState === "connected" || connectionState === "connecting"}
            onClick={onReconnect}
          >
            <RefreshCw size={19} />
            {connectionLabel(connectionState)}
          </button>
        </div>
        <div className="online-pause-room-code-row">
          <span>房间码</span>
          <strong>{roomCode}</strong>
          <button
            type="button"
            className="online-pause-copy-button"
            aria-label={`复制房间码 ${roomCode}`}
            onClick={copyRoomCode}
          >
            <Copy size={21} />
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>

      <SystemMenuInfoSection state={state} modeLabel="在线联机" />

      <div className="online-pause-section online-pause-audio-section">
        <div className="online-pause-section-heading">
          <span>声音设置</span>
          <small>本机偏好</small>
        </div>
        <div className="online-pause-audio-console">
          <OnlinePauseVolumeRow
            icon={Music}
            label="游戏背景音乐音量"
            value={settings.musicVolume}
            onChange={(value) => updateSettings({ musicVolume: value, muted: false })}
          />
          <OnlinePauseVolumeRow
            icon={Volume2}
            label="游戏音效音量"
            value={settings.sfxVolume}
            onChange={(value) => updateSettings({ sfxVolume: value, muted: false })}
          />
          <button
            type="button"
            className={isMuted ? "online-pause-mute-button muted" : "online-pause-mute-button"}
            aria-pressed={isMuted}
            onClick={toggleMute}
          >
            {isMuted ? <Volume2 size={31} /> : <VolumeX size={31} />}
            <span>
              <strong>{isMuted ? "一键恢复音量" : "一键静音"}</strong>
              <small>{isMuted ? "恢复静音前音量" : "关闭所有声音"}</small>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

function connectionLabel(state: "disconnected" | "connecting" | "connected" | "reconnecting") {
  switch (state) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中";
    case "reconnecting":
      return "重连中";
    default:
      return "未连接";
  }
}

function OnlinePauseVolumeRow({
  icon: Icon,
  label,
  value,
  onChange
}: {
  icon: typeof Volume2;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="online-pause-volume-row">
      <Icon size={30} />
      <span>{label}</span>
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
      <strong>{value}%</strong>
      <Volume2 size={31} />
    </label>
  );
}
