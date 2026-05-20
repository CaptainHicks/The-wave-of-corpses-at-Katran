import { Activity } from "lucide-react";
import type { GameState } from "../../domain/types";
import { phaseLabels } from "../gameUiTypes";
import type { TurnUiMode } from "../selectors/turnUiMode";

export function TurnSummaryPanel({ state, mode }: { state: GameState; mode: TurnUiMode }) {
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId);

  return (
    <section className="panel compact rail-section turn-summary-panel">
      <h2>
        <Activity size={18} />
        当前回合摘要
      </h2>
      <div className="status-column">
        <InfoBadge label="流程" value={modeLabel(mode)} />
        <InfoBadge label="阶段" value={phaseLabels[state.phase]} />
        <InfoBadge label="回合" value={String(state.turn)} />
        <InfoBadge label="当前" value={currentPlayer?.name ?? "-"} />
      </div>
    </section>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-badge">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function modeLabel(mode: TurnUiMode): string {
  const labels: Record<TurnUiMode, string> = {
    mustRoll: "等待掷骰",
    pending: "处理待办",
    freeAction: "自由行动",
    victory: "结算"
  };
  return labels[mode];
}
