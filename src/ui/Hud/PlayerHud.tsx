import { X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PLAYER_FACTIONS } from "../../domain/constants";
import { calculateScore, longestSupplyLength } from "../../domain/rules";
import type { GameState, PlayerState, ScoreBreakdown } from "../../domain/types";

const HUD_ICONS = {
  camp: "/assets/hud/camp.v1.webp",
  fortress: "/assets/hud/fortress.v1.webp",
  watchtower: "/assets/hud/watchtower.v1.webp",
  militia: "/assets/hud/militia.v1.webp",
  longestSupply: "/assets/hud/longest-supply.v1.webp"
};

export function PlayerHud({
  state,
  pendingPlayerId = state.pending?.playerId
}: {
  state: GameState;
  pendingPlayerId?: string;
}) {
  const [scorePlayerId, setScorePlayerId] = useState<string>();
  const scorePlayer = state.players.find((player) => player.id === scorePlayerId);
  const scoreDetail = scorePlayer ? calculateScore(state, scorePlayer.id) : undefined;

  return (
    <section className="panel player-hud-panel">
      <div className="player-stack">
        {state.players.map((player, index) => {
          const score = calculateScore(state, player.id);
          const buildings = Object.values(state.board.vertices).filter(
            (vertex) => vertex.building?.ownerId === player.id
          );
          const camps = buildings.filter((vertex) => vertex.building?.type === "camp").length;
          const fortresses = buildings.filter((vertex) => vertex.building?.type === "fortress").length;
          const watchtowers = Object.values(state.board.vertices).filter(
            (vertex) => vertex.watchtowerOwnerId === player.id
          ).length;
          const isCurrent = player.id === state.currentPlayerId;
          const isPending = player.id === pendingPlayerId;
          const supplyLength = longestSupplyLength(state.board, player.id);
          const militiaTotal = player.militia.length + player.pieces.militia;
          const faction =
            PLAYER_FACTIONS.find((item) => item.id === player.factionId) ??
            PLAYER_FACTIONS[index % PLAYER_FACTIONS.length];

          return (
            <div
              className={`player-card player-hud-card ${isCurrent ? "current-turn" : ""} ${
                isPending ? "pending-turn" : ""
              }`}
              key={player.id}
              style={{ "--player-color": player.color } as CSSProperties}
            >
              <div className="faction-portrait">
                <img src={faction.portrait} alt={`${player.name}头像`} />
              </div>
              <div className="player-nameplate">
                <strong>{player.name}</strong>
                {isCurrent && <span className="current-player-signal" aria-hidden="true" />}
              </div>
              <button
                type="button"
                className="vp-chip"
                aria-label={`${player.name}当前得分：${score.total}，查看得分明细`}
                onClick={() => setScorePlayerId(player.id)}
              >
                {score.total}
              </button>
              <div className="public-stat-grid" aria-label={`${player.name}公开状态`}>
                <HudStat icon={HUD_ICONS.camp} label="营地" value={camps} />
                <HudStat icon={HUD_ICONS.fortress} label="堡垒" value={fortresses} />
                <HudStat icon={HUD_ICONS.watchtower} label="哨塔" value={watchtowers} />
                <HudStat icon={HUD_ICONS.militia} label="民兵" value={`${player.militia.length}/${militiaTotal}`} />
                <HudStat icon={HUD_ICONS.longestSupply} label="最长补给线" value={supplyLength} wide />
              </div>
            </div>
          );
        })}
      </div>
      {scorePlayer && scoreDetail && createPortal(
        <ScoreDetailModal
          player={scorePlayer}
          score={scoreDetail}
          onClose={() => setScorePlayerId(undefined)}
        />,
        document.body
      )}
    </section>
  );
}

function HudStat({
  icon,
  label,
  value,
  wide = false
}: {
  icon: string;
  label: string;
  value: number | string;
  wide?: boolean;
}) {
  return (
    <span className={wide ? "hud-stat hud-stat-wide" : "hud-stat"}>
      <span className="hud-stat-icon" aria-hidden="true">
        <img src={icon} alt="" />
      </span>
      <b>{label}</b>
      <strong>{value}</strong>
    </span>
  );
}

function ScoreDetailModal({
  player,
  score,
  onClose
}: {
  player: PlayerState;
  score: ScoreBreakdown;
  onClose: () => void;
}) {
  const titleId = `score-detail-title-${player.id}`;
  const rows = scoreBreakdownRows(score);

  return (
    <div
      className="score-detail-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="themed-modal score-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ "--player-color": player.color } as CSSProperties}
      >
        <header className="score-detail-header">
          <div>
            <span className="score-detail-kicker">胜利点</span>
            <h2 id={titleId}>{player.name} 得分明细</h2>
          </div>
          <strong className="score-detail-total">总分 {score.total}</strong>
          <button type="button" className="icon-button modal-close-button" aria-label="关闭得分明细" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="score-detail-list">
          {rows.map((row) => (
            <div className={row.points > 0 ? "score-detail-row active" : "score-detail-row"} key={row.label}>
              <div>
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </div>
              <b>{row.points > 0 ? `+${row.points}` : "0"}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function scoreBreakdownRows(score: ScoreBreakdown) {
  const fortressCount = Math.floor(score.fortresses / 2);

  return [
    { label: "营地", detail: `${score.camps} 座 × 1 分`, points: score.camps },
    { label: "堡垒", detail: `${fortressCount} 座 × 2 分`, points: score.fortresses },
    {
      label: "最长补给线",
      detail: score.longestSupply > 0 ? "拥有最长补给线" : "未获得最长补给线",
      points: score.longestSupply
    },
    {
      label: "最强民兵",
      detail: score.strongestMilitia > 0 ? "拥有最大民兵规模" : "未获得最强民兵",
      points: score.strongestMilitia
    },
    { label: "秘密据点", detail: `${score.secretBases} 张已公开`, points: score.secretBases },
    { label: "卡坦保卫者", detail: `${score.defenderTokens} 枚得分牌`, points: score.defenderTokens },
    {
      label: "商人",
      detail: score.merchant > 0 ? "当前控制商人" : "未控制商人",
      points: score.merchant
    }
  ];
}
