import { ArrowRight, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { RESOURCE_LABELS, RESOURCES, createResources } from "../../domain/constants";
import { isBlackMarketVisible, tileResource } from "../../domain/board";
import { resourceTotal } from "../../domain/rules";
import type { Command, GameState, Resource, Resources } from "../../domain/types";
import { resourceIconAssets } from "../art/assetManifest";
import { PUBLIC_TRADE_TARGET } from "../gameUiTypes";
import { AssetIcon } from "./AssetIcon";

export function TradeAction({ state, submit }: { state: GameState; submit: (command: Command) => void }) {
  const player = state.players.find((item) => item.id === state.currentPlayerId)!;
  const [tradeGive, setTradeGive] = useState<Resource | "">("");
  const [tradeReceive, setTradeReceive] = useState<Resource | "">("");
  const [tradeTarget, setTradeTarget] = useState(PUBLIC_TRADE_TARGET);
  const [playerOffer, setPlayerOffer] = useState<Resources>(() => createResources());
  const [playerRequest, setPlayerRequest] = useState<Resources>(() => createResources());
  const bestRate = tradeGive ? bestTradeRate(state, tradeGive) : 4;
  const canBankTrade =
    tradeGive !== "" &&
    tradeReceive !== "" &&
    tradeGive !== tradeReceive &&
    player.resources[tradeGive] >= bestRate;
  const canOffer = resourceTotal(playerOffer) > 0 && resourceTotal(playerRequest) > 0;

  return (
    <section className="action-pane">
      <div className="action-subsection">
        <h3>银行 / 黑市</h3>
        <div className="trade-row">
          <select
            aria-label="兑换支出资源"
            value={tradeGive}
            onChange={(event) => setTradeGive(event.target.value as Resource | "")}
          >
            <option value="">选择支出</option>
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {RESOURCE_LABELS[resource]}
              </option>
            ))}
          </select>
          <ArrowRight size={16} />
          <select
            aria-label="兑换获得资源"
            value={tradeReceive}
            onChange={(event) => setTradeReceive(event.target.value as Resource | "")}
          >
            <option value="">选择获得</option>
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {RESOURCE_LABELS[resource]}
              </option>
            ))}
          </select>
          <button
            disabled={!canBankTrade}
            onClick={() => {
              if (!tradeGive || !tradeReceive) return;
              submit({ type: "bankTrade", give: tradeGive, receive: tradeReceive });
            }}
          >
            {bestRate}:1 兑换
          </button>
        </div>
      </div>

      <div className="player-trade-box">
        <h3>玩家报价</h3>
        <select value={tradeTarget} onChange={(event) => setTradeTarget(event.target.value)}>
          <option value={PUBLIC_TRADE_TARGET}>向所有玩家公开报价</option>
          {state.players
            .filter((item) => item.id !== state.currentPlayerId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <div className="trade-bundles">
          <ResourceBundleEditor title="给出" resources={playerOffer} available={player.resources} onChange={setPlayerOffer} />
          <ResourceBundleEditor title="换取" resources={playerRequest} onChange={setPlayerRequest} />
        </div>
        <div className="inline-actions">
          <button
            disabled={!canOffer}
            onClick={() =>
              submit({
                type: "playerTrade",
                targetPlayerId:
                  tradeTarget === PUBLIC_TRADE_TARGET || tradeTarget === state.currentPlayerId ? undefined : tradeTarget,
                offer: playerOffer,
                request: playerRequest
              })
            }
          >
            提出交易
          </button>
          <button
            onClick={() => {
              setTradeGive("");
              setTradeReceive("");
              setTradeTarget(PUBLIC_TRADE_TARGET);
              setPlayerOffer(createResources());
              setPlayerRequest(createResources());
            }}
          >
            清空
          </button>
        </div>
      </div>
    </section>
  );
}

function ResourceBundleEditor({
  title,
  resources,
  available,
  onChange
}: {
  title: string;
  resources: Resources;
  available?: Resources;
  onChange: (resources: Resources) => void;
}) {
  const adjust = (resource: Resource, delta: number) => {
    const nextAmount = Math.max(0, resources[resource] + delta);
    if (available && nextAmount > available[resource]) return;
    onChange({ ...resources, [resource]: nextAmount });
  };

  return (
    <div className="resource-editor">
      <strong>{title}</strong>
      {RESOURCES.map((resource) => (
        <div key={resource} className="resource-stepper">
          {resourceIconAssets[resource].imageUrl && (
            <AssetIcon src={resourceIconAssets[resource].imageUrl} className="resource-stepper-asset-icon" />
          )}
          <span>{RESOURCE_LABELS[resource]}</span>
          <button aria-label={`${RESOURCE_LABELS[resource]}减少`} disabled={resources[resource] <= 0} onClick={() => adjust(resource, -1)}>
            <Minus size={12} />
          </button>
          <b>{resources[resource]}</b>
          <button
            aria-label={`${RESOURCE_LABELS[resource]}增加`}
            disabled={available !== undefined && resources[resource] >= available[resource]}
            onClick={() => adjust(resource, 1)}
          >
            <Plus size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function bestTradeRate(state: GameState, give: Resource): 2 | 3 | 4 {
  const player = state.players.find((item) => item.id === state.currentPlayerId);
  if (!player) return 4;
  const ownsVisibleGenericMarket = Object.values(state.board.edges).some(
    (edge) =>
      edge.blackMarket?.type === "generic" &&
      isBlackMarketVisible(state.board, edge.id) &&
      edge.vertexIds.some((vertexId) => state.board.vertices[vertexId].building?.ownerId === player.id)
  );
  const ownsVisibleSpecificMarket = Object.values(state.board.edges).some(
    (edge) =>
      edge.blackMarket?.type === "specific" &&
      edge.blackMarket.resource === give &&
      isBlackMarketVisible(state.board, edge.id) &&
      edge.vertexIds.some((vertexId) => state.board.vertices[vertexId].building?.ownerId === player.id)
  );
  const merchantTile = state.board.tiles[state.merchant.tileId];
  const merchantResource = merchantTile ? tileResource(merchantTile) : undefined;
  const merchantRate =
    state.merchant.controllerId === player.id &&
    state.zombieTileId !== state.merchant.tileId &&
    (merchantTile?.hiddenType === "warehouse" || merchantResource === give);
  if (ownsVisibleSpecificMarket || merchantRate) return 2;
  if (ownsVisibleGenericMarket) return 3;
  return 4;
}
