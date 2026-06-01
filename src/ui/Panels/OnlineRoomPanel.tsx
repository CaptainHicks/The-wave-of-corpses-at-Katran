import { Copy, LogOut, Radio } from "lucide-react";
import { AudioSettingsPanel } from "../audio/AudioSettingsPanel";

export function OnlineRoomPanel({
  roomCode,
  connectionState,
  onLeaveRoom
}: {
  roomCode: string;
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";
  onLeaveRoom: () => void;
}) {
  return (
    <section className="panel compact system-menu-content">
      <h2>
        <Radio size={18} />
        在线联机
      </h2>

      <div className="system-menu-section">
        <div className="system-menu-section-heading">
          <span>房间状态</span>
          <small>{connectionLabel(connectionState)}</small>
        </div>
        <div className="system-menu-action-grid">
          <button
            className="system-menu-action"
            onClick={() => {
              navigator.clipboard?.writeText(roomCode);
            }}
          >
            <Copy size={16} />
            <span>复制房间码 {roomCode}</span>
          </button>
          <button className="system-menu-action system-menu-action-danger" onClick={onLeaveRoom}>
            <LogOut size={16} />
            <span>离开在线房间</span>
          </button>
        </div>
      </div>

      <div className="system-menu-section">
        <div className="system-menu-section-heading">
          <span>声音设置</span>
          <small>本机偏好</small>
        </div>
        <AudioSettingsPanel className="system-audio-settings-panel" />
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
