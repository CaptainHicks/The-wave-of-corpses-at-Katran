import { AlertTriangle, Eye } from "lucide-react";
import type { PendingChoice } from "../../domain/types";

export function PrivacyGate({
  playerName,
  pendingKind,
  onEnter
}: {
  playerName: string;
  pendingKind?: PendingChoice["kind"];
  onEnter: () => void;
}) {
  return (
    <div className="privacy-gate" role="dialog" aria-modal="true" aria-label="热座隐私交接">
      <div className="privacy-gate-panel">
        <span className="privacy-gate-chip">
          {pendingKind ? <AlertTriangle size={16} /> : <Eye size={16} />}
          {pendingKind ? "待处理响应" : "控制台交接"}
        </span>
        <p>{pendingKind ? "需要当前响应玩家接管控制台" : "轮到"}</p>
        <h1>{playerName}</h1>
        {pendingKind && <small>{pendingLabel(pendingKind)}</small>}
        <button className="primary" onClick={onEnter}>
          <Eye size={18} />
          {pendingKind ? "开始处理" : "开始回合"}
        </button>
      </div>
    </div>
  );
}

function pendingLabel(kind: PendingChoice["kind"]): string {
  const labels: Record<PendingChoice["kind"], string> = {
    setupRoute: "放置初始运输线",
    chooseResource: "选择资源",
    discard: "弃牌",
    moveZombie: "移动尸潮",
    stealResource: "抽取资源",
    confirmTrade: "确认交易",
    downgradeFortress: "堡垒降级"
  };
  return labels[kind];
}
