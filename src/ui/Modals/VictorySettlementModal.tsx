import { Crown, Home, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import { calculateScore } from "../../domain/rules";
import type { GameState, PlayerState, ScoreBreakdown } from "../../domain/types";

interface Standing {
  player: PlayerState;
  score: ScoreBreakdown;
}

export function VictorySettlementModal({
  state,
  onReturnHome,
  returnLabel = "返回主页面"
}: {
  state: GameState;
  onReturnHome: () => void;
  returnLabel?: string;
}) {
  const standings = state.players
    .map((player) => ({ player, score: calculateScore(state, player.id) }))
    .sort((a, b) => {
      if (a.score.total !== b.score.total) return b.score.total - a.score.total;
      if (a.player.id === state.winnerId) return -1;
      if (b.player.id === state.winnerId) return 1;
      return a.player.name.localeCompare(b.player.name, "zh-Hans-CN");
    });
  const champion = standings.find((standing) => standing.player.id === state.winnerId) ?? standings[0];

  return (
    <div className="victory-settlement-layer" role="presentation">
      <section className="victory-settlement-modal" role="dialog" aria-modal="true" aria-label="胜利结算">
        <div className="victory-settlement-hero" style={{ "--champion-color": champion.player.color } as CSSProperties}>
          <span className="victory-emblem" aria-hidden="true">
            <Crown size={34} />
          </span>
          <span className="victory-kicker">冠军</span>
          <h2 title={champion.player.name}>{champion.player.name}</h2>
          <p>尸潮暂退，废土归于新的领袖。</p>
          <strong>{champion.score.total} 分</strong>
        </div>

        <div className="victory-standings" aria-label="玩家得分排行">
          {standings.map((standing, index) => (
            <StandingRow
              key={standing.player.id}
              standing={standing}
              rank={index + 1}
              champion={standing.player.id === champion.player.id}
            />
          ))}
        </div>

        <button type="button" className="primary victory-return-button" onClick={onReturnHome}>
          <Home size={18} />
          {returnLabel}
        </button>
      </section>
    </div>
  );
}

function StandingRow({
  standing,
  rank,
  champion
}: {
  standing: Standing;
  rank: number;
  champion: boolean;
}) {
  return (
    <article
      className={champion ? "victory-standing-row champion" : "victory-standing-row"}
      style={{ "--player-color": standing.player.color } as CSSProperties}
    >
      <span className="victory-rank">{champion ? <Trophy size={18} /> : `#${rank}`}</span>
      <div className="victory-player-copy">
        <strong title={standing.player.name}>{standing.player.name}</strong>
        <span>{scoreSummary(standing.score)}</span>
      </div>
      <b>总分 {standing.score.total}</b>
    </article>
  );
}

function scoreSummary(score: ScoreBreakdown): string {
  const parts = [
    score.camps > 0 ? `营地 ${score.camps}` : "",
    score.fortresses > 0 ? `堡垒 ${score.fortresses}` : "",
    score.longestSupply > 0 ? `最长补给线 ${score.longestSupply}` : "",
    score.strongestMilitia > 0 ? `最强民兵 ${score.strongestMilitia}` : "",
    score.secretBases > 0 ? `秘密据点 ${score.secretBases}` : "",
    score.defenderTokens > 0 ? `保卫者 ${score.defenderTokens}` : "",
    score.newResourceZones > 0 ? `新资源区 ${score.newResourceZones}` : "",
    score.merchant > 0 ? `商人 ${score.merchant}` : ""
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "暂无得分来源";
}
