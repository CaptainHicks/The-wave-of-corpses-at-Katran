import { Minus, Plus } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { RESOURCE_LABELS, RESOURCES, createResources } from "../../domain/constants";
import { isBlackMarketVisible, tileResource } from "../../domain/board";
import { resourceTotal } from "../../domain/rules";
import type { Command, GameState, Resource, Resources } from "../../domain/types";
import { resourceIconAssets } from "../art/assetManifest";
import { PUBLIC_TRADE_TARGET, type UiOperationContext } from "../gameUiTypes";
import { AssetIcon } from "./AssetIcon";

type TradeHintSource = "bank" | "player";
type TradeMode = "bank" | "player";

export function TradeAction({
  state,
  submit,
  setOperationContext
}: {
  state: GameState;
  submit: (command: Command) => void;
  setOperationContext?: Dispatch<SetStateAction<UiOperationContext | undefined>>;
}) {
  const player = state.players.find((item) => item.id === state.currentPlayerId)!;
  const [tradeGive, setTradeGive] = useState<Resource | "">("");
  const [tradeReceive, setTradeReceive] = useState<Resource | "">("");
  const [tradeTarget, setTradeTarget] = useState(PUBLIC_TRADE_TARGET);
  const [playerOffer, setPlayerOffer] = useState<Resources>(() => createResources());
  const [playerRequest, setPlayerRequest] = useState<Resources>(() => createResources());
  const [tradeMode, setTradeMode] = useState<TradeMode>("player");
  const [tradeHintSource, setTradeHintSource] = useState<TradeHintSource>();
  const bestRate = tradeGive ? bestTradeRate(state, tradeGive) : 4;
  const canBankTrade =
    tradeGive !== "" &&
    tradeReceive !== "" &&
    tradeGive !== tradeReceive &&
    player.resources[tradeGive] >= bestRate;
  const canOffer = resourceTotal(playerOffer) > 0 && resourceTotal(playerRequest) > 0;
  const offerTotal = resourceTotal(playerOffer);
  const requestTotal = resourceTotal(playerRequest);
  const hasBankTradeHint = tradeGive !== "" || tradeReceive !== "";
  const hasPlayerTradeHint = tradeTarget !== PUBLIC_TRADE_TARGET || offerTotal > 0 || requestTotal > 0;
  const activeTradeHintSource =
    tradeHintSource ??
    (tradeMode === "player"
      ? hasPlayerTradeHint
        ? "player"
        : undefined
      : hasBankTradeHint
        ? "bank"
        : undefined);

  const showBankTradeContext = () => {
    setOperationContext?.({
      kind: "bankTrade",
      give: tradeGive || undefined,
      receive: tradeReceive || undefined,
      rate: bestRate,
      canTrade: canBankTrade
    });
  };

  const showPlayerTradeContext = () => {
    setOperationContext?.({
      kind: "playerTrade",
      target: tradeTarget === PUBLIC_TRADE_TARGET ? "public" : "direct",
      offerTotal,
      requestTotal
    });
  };

  useEffect(() => {
    if (activeTradeHintSource === "bank") {
      showBankTradeContext();
      return;
    }
    if (activeTradeHintSource === "player") {
      showPlayerTradeContext();
      return;
    }
    setOperationContext?.(undefined);
  }, [
    activeTradeHintSource,
    bestRate,
    canBankTrade,
    offerTotal,
    requestTotal,
    setOperationContext,
    tradeGive,
    tradeMode,
    tradeReceive,
    tradeTarget
  ]);

  return (
    <section className="action-pane">
      <div className="segmented small trade-mode-selector" role="group" aria-label="交易方式">
        <button
          type="button"
          className={tradeMode === "player" ? "active" : ""}
          aria-pressed={tradeMode === "player"}
          onClick={() => {
            setTradeMode("player");
            setTradeHintSource(hasPlayerTradeHint ? "player" : undefined);
          }}
        >
          玩家报价
        </button>
        <button
          type="button"
          className={tradeMode === "bank" ? "active" : ""}
          aria-pressed={tradeMode === "bank"}
          onClick={() => {
            setTradeMode("bank");
            setTradeHintSource(hasBankTradeHint ? "bank" : undefined);
          }}
        >
          银行 / 黑市
        </button>
      </div>

      {tradeMode === "bank" ? (
        <div className="trade-panel-box action-subsection">
          <div className="bank-resource-choices">
            <ResourceChoiceButtons
              label="选择支出"
              selected={tradeGive}
              onSelect={(resource) => {
                setTradeHintSource("bank");
                setTradeGive(resource);
              }}
            />
            <ResourceChoiceButtons
              label="选择获得"
              selected={tradeReceive}
              onSelect={(resource) => {
                setTradeHintSource("bank");
                setTradeReceive(resource);
              }}
            />
          </div>
          <div className="inline-actions trade-panel-actions">
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
      ) : (
        <div className="trade-panel-box player-trade-box">
          <select
            value={tradeTarget}
            onFocus={() => {
              setTradeHintSource("player");
              showPlayerTradeContext();
            }}
            onChange={(event) => {
              setTradeHintSource("player");
              setTradeTarget(event.target.value);
            }}
          >
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
            <ResourceBundleEditor
              title="给出"
              resources={playerOffer}
              available={player.resources}
              onFocus={() => {
                setTradeHintSource("player");
                showPlayerTradeContext();
              }}
              onChange={setPlayerOffer}
            />
            <ResourceBundleEditor
              title="换取"
              resources={playerRequest}
              onFocus={() => {
                setTradeHintSource("player");
                showPlayerTradeContext();
              }}
              onChange={setPlayerRequest}
            />
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
                setTradeTarget(PUBLIC_TRADE_TARGET);
                setPlayerOffer(createResources());
                setPlayerRequest(createResources());
                setTradeHintSource(undefined);
              }}
            >
              清空
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ResourceChoiceButtons({
  label,
  selected,
  onSelect
}: {
  label: string;
  selected: Resource | "";
  onSelect: (resource: Resource) => void;
}) {
  return (
    <div className="bank-resource-choice" role="group" aria-label={label}>
      <strong>{label}</strong>
      <div className="resource-buttons compact-resource-buttons">
        {RESOURCES.map((resource) => (
          <button
            key={resource}
            type="button"
            className={selected === resource ? "selected" : ""}
            aria-pressed={selected === resource}
            onClick={() => onSelect(resource)}
          >
            {resourceIconAssets[resource].imageUrl && (
              <AssetIcon
                src={resourceIconAssets[resource].imageUrl}
                className={`resource-choice-asset-icon resource-choice-asset-icon-${resource}`}
              />
            )}
            <span>{RESOURCE_LABELS[resource]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResourceBundleEditor({
  title,
  resources,
  available,
  onFocus,
  onChange
}: {
  title: string;
  resources: Resources;
  available?: Resources;
  onFocus?: () => void;
  onChange: (resources: Resources) => void;
}) {
  const adjust = (resource: Resource, delta: number) => {
    const nextAmount = Math.max(0, resources[resource] + delta);
    if (available && nextAmount > available[resource]) return;
    onFocus?.();
    onChange({ ...resources, [resource]: nextAmount });
  };

  return (
    <div className="resource-editor" onFocus={onFocus}>
      <strong>{title}</strong>
      {RESOURCES.map((resource) => (
        <div key={resource} className="resource-stepper">
          {resourceIconAssets[resource].imageUrl && (
            <AssetIcon
              src={resourceIconAssets[resource].imageUrl}
              className={`resource-stepper-asset-icon resource-stepper-asset-icon-${resource}`}
            />
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
