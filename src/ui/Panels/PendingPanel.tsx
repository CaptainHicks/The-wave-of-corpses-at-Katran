import { AlertTriangle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Command, GameState } from "../../domain/types";
import { AssetIcon } from "../Actions/AssetIcon";
import type { UiOperationContext, UiTool } from "../gameUiTypes";
import { ResourcePickerModal } from "../Modals/ResourcePickerModal";
import { TradeOfferModal } from "../Modals/TradeOfferModal";

export function PendingPanel({
  state,
  submit,
  setTool,
  setOperationContext
}: {
  state: GameState;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setOperationContext?: Dispatch<SetStateAction<UiOperationContext | undefined>>;
}) {
  if (!state.pending) return null;
  const pending = state.pending;
  const player = state.players.find((item) => item.id === state.pending?.playerId);
  const isResponderCurrentPlayer = pending.playerId === state.currentPlayerId;
  return (
    <section className="panel pending">
      <header className="pending-header">
        <h2>
          <AlertTriangle size={18} />
          待处理
        </h2>
        <span>{player?.name}</span>
      </header>
      {!isResponderCurrentPlayer && (
        <p className="pending-seat-note">当前响应玩家不是回合玩家，隐私交接后再处理。</p>
      )}
      {state.pending.kind === "setupRoute" && (
        <div className="pending-task-card">
          <p>{player?.name} 需要为刚放置的营地连接 1 条运输线。</p>
          <button onClick={() => setTool("initialRoute")}>
            <AssetIcon src="/assets/hud/transport.v1.webp" className="inline-action-asset-icon" />
            点击合法边
          </button>
        </div>
      )}
      {state.pending.kind === "chooseResource" && (
        <ResourcePickerModal
          title={`${player?.name} 选择资源`}
          subtitle={reasonText(state.pending.reason)}
          amount={state.pending.amount}
          operationMode="choose"
          setOperationContext={setOperationContext}
          onSubmit={(resources) => submit({ type: "chooseResource", resources })}
        />
      )}
      {state.pending.kind === "discard" && (
        <ResourcePickerModal
          title={`${player?.name} 弃牌`}
          subtitle={`手牌超限，需要弃掉 ${state.pending.amount} 张；只显示响应玩家自己的资源。`}
          amount={state.pending.amount}
          available={player?.resources}
          operationMode="discard"
          setOperationContext={setOperationContext}
          onSubmit={(resources) => submit({ type: "discardResources", resources })}
        />
      )}
      {state.pending.kind === "moveZombie" && (
        <div className="pending-task-card alert">
          <p>{player?.name} 必须移动尸潮到任意已翻开的地块。</p>
          <button onClick={() => setTool("zombie")}>
            <AssetIcon src="/assets/board/markers/zombie-horde.v1.webp" className="inline-action-asset-icon" />
            点击目标地块
          </button>
        </div>
      )}
      {state.pending.kind === "stealResource" && (
        <div className="pending-task-card">
          <p>选择一个相邻玩家随机抽取 1 张资源；也可以跳过。</p>
          <div className="button-grid">
          {state.pending.targetPlayerIds.map((id) => {
            const target = state.players.find((item) => item.id === id);
            return (
              <button key={id} onClick={() => submit({ type: "stealResource", targetPlayerId: id })}>
                <AssetIcon src="/assets/board/markers/merchant.v1.webp" className="inline-action-asset-icon" />
                抽取 {target?.name}
              </button>
            );
          })}
          <button onClick={() => submit({ type: "stealResource" })}>跳过</button>
          </div>
        </div>
      )}
      {pending.kind === "confirmTrade" && (
        (() => {
          const actor = state.players.find((item) => item.id === pending.actorId);
          const responder = state.players.find((item) => item.id === pending.targetPlayerId);
          const remainingNames = (pending.candidateTargetIds ?? [pending.targetPlayerId])
            .filter((id) => id !== pending.targetPlayerId)
            .map((id) => state.players.find((item) => item.id === id)?.name)
            .filter((name): name is string => Boolean(name));
          return (
            <TradeOfferModal
              actorName={actor?.name}
              responderName={responder?.name}
              remainingNames={remainingNames}
              offer={pending.offer}
              request={pending.request}
              responderResources={responder?.resources}
              onAccept={() => submit({ type: "confirmPlayerTrade", accept: true })}
              onReject={() => submit({ type: "confirmPlayerTrade", accept: false })}
            />
          );
        })()
      )}
      {state.pending.kind === "downgradeFortress" && (
        <div className="pending-task-card alert">
          <p>{player?.name} 选择 1 座堡垒降级。</p>
          <p>请直接在地图上点击一座带白色轮廓的己方堡垒。</p>
        </div>
      )}
    </section>
  );
}

function reasonText(reason: "warehouse-production" | "initial-warehouse" | "explore-warehouse" | "airdrop" | "zombie-approaches"): string {
  const labels = {
    "warehouse-production": "废弃仓库产出，自选资源。",
    "initial-warehouse": "初始营地连接仓库，自选起始资源。",
    "explore-warehouse": "探索仓库地块，自选奖励资源。",
    airdrop: "空投补给效果，自选资源。",
    "zombie-approaches": "尸潮逼近效果，自选资源。"
  };
  return labels[reason];
}
