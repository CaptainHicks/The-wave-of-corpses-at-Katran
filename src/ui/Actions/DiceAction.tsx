import { useState } from "react";
import type { Command, GameState } from "../../domain/types";
import { AssetIcon } from "./AssetIcon";

export function DiceAction({ state, submit }: { state: GameState; submit: (command: Command) => void }) {
  const [forcedDice, setForcedDice] = useState("8");
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId);

  return (
    <section className="panel action-card dice-action">
      <h2>
        <AssetIcon src="/assets/hud/dice.v1.webp" className="section-title-asset-icon" />
        掷骰准备
      </h2>
      <div className="dice-preview" aria-label="骰子预览">
        <span>{state.dice?.[0] ?? "?"}</span>
        <b>+</b>
        <span>{state.dice?.[1] ?? "?"}</span>
      </div>
      <p className="phase-copy">{currentPlayer?.name} 必须先掷骰，随后进入自由行动阶段。</p>
      {state.debugMode && (
        <details className="debug-drawer">
          <summary>固定骰子调试</summary>
          <div className="mini-form">
            <input
              aria-label="固定骰子点数"
              value={forcedDice}
              onChange={(event) => setForcedDice(event.target.value)}
            />
            <button
              onClick={() => {
                const total = Number(forcedDice);
                const first = Math.max(1, Math.min(6, total - 1));
                const second = Math.max(1, Math.min(6, total - first));
                submit({ type: "rollDice", forced: [first, second] });
              }}
            >
              固定点
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
