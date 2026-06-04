import { COSTS, RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import { hasResources } from "../../domain/rules";
import type { Command, GameState, Resources } from "../../domain/types";
import { AssetIcon } from "./AssetIcon";

export function BuyDevelopmentCardAction({
  state,
  submit
}: {
  state: GameState;
  submit: (command: Command) => void;
}) {
  const player = state.players.find((item) => item.id === state.currentPlayerId)!;
  const canBuy = state.devDeck.length > 0 && hasResources(player.resources, COSTS.devCard);

  return (
    <section className="action-pane">
      <div className="dev-buy-panel">
        <AssetIcon src="/assets/hud/dev-card-back.v1.webp" className="dev-buy-panel-asset-icon" />
        <div>
          <h3>发展卡牌堆</h3>
          <p className="rail-big-number">{state.devDeck.length}</p>
          <p className="muted-line">剩余牌数</p>
        </div>
        <button className="primary dev-buy-button" disabled={!canBuy} onClick={() => submit({ type: "buyDevelopmentCard" })}>
          购买发展卡
        </button>
      </div>
      <p className="phase-copy">费用：{formatCost(COSTS.devCard)}。打出发展卡从底部手牌触发。</p>
    </section>
  );
}

function formatCost(cost: Partial<Resources>): string {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_LABELS[resource]}×${cost[resource]}`)
    .join(" / ");
}
