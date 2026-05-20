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
        鍦ㄧ嚎鑱旀満
      </h2>

      <div className="system-menu-section">
        <div className="system-menu-section-heading">
          <span>鎴块棿鐘舵€?</span>
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
            <span>澶嶅埗鎴块棿鐮?{roomCode}</span>
          </button>
          <button className="system-menu-action system-menu-action-danger" onClick={onLeaveRoom}>
            <LogOut size={16} />
            <span>绂诲紑鍦ㄧ嚎鎴块棿</span>
          </button>
        </div>
      </div>

      <div className="system-menu-section">
        <div className="system-menu-section-heading">
          <span>澹伴煶璁剧疆</span>
          <small>鏈満鍋忓ソ</small>
        </div>
        <AudioSettingsPanel className="system-audio-settings-panel" />
      </div>
    </section>
  );
}

function connectionLabel(state: "disconnected" | "connecting" | "connected" | "reconnecting") {
  switch (state) {
    case "connected":
      return "宸茶繛鎺?";
    case "connecting":
      return "杩炴帴涓?";
    case "reconnecting":
      return "閲嶈繛涓?";
    default:
      return "鏈繛鎺?";
  }
}
