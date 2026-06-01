import { Flag, Menu, Skull, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type { Command, GameState, RouteType } from "../../domain/types";
import { BuildAction } from "../Actions/BuildAction";
import { BuyDevelopmentCardAction } from "../Actions/BuyDevelopmentCardAction";
import { DiceAction } from "../Actions/DiceAction";
import { MainTurnButton } from "../Actions/MainTurnButton";
import { MilitiaAction } from "../Actions/MilitiaAction";
import { TradeAction } from "../Actions/TradeAction";
import { phaseLabels, type InteractionMode, type UiSelection, type UiTool } from "../gameUiTypes";
import type { TurnUiMode } from "../selectors/turnUiMode";
import { BuildCostPanel } from "./BuildCostPanel";
import { OnlineRoomPanel } from "./OnlineRoomPanel";
import { PendingPanel } from "./PendingPanel";
import { PersistencePanel } from "./PersistencePanel";

type ActionTab = "trade" | "build" | "militia" | "development";

const ACTION_TABS: Array<{ id: ActionTab; label: string }> = [
  { id: "trade", label: "交易" },
  { id: "build", label: "建造" },
  { id: "militia", label: "民兵" },
  { id: "development", label: "发展" }
];

export function RightOperationDock({
  state,
  mode,
  tool,
  selection,
  viewerPlayerId,
  pendingPlayerId,
  interactionMode,
  onlineRoomCode,
  onlineConnectionState,
  animationBusy,
  submit,
  setTool,
  setSelection,
  onClear,
  onImportState,
  onLeaveOnlineRoom
}: {
  state: GameState;
  mode: TurnUiMode;
  tool: UiTool;
  selection?: UiSelection;
  viewerPlayerId: string;
  pendingPlayerId?: string;
  interactionMode: InteractionMode;
  onlineRoomCode?: string;
  onlineConnectionState?: "disconnected" | "connecting" | "connected" | "reconnecting";
  animationBusy: boolean;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  onClear: () => void;
  onImportState: (state: GameState) => void;
  onLeaveOnlineRoom?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ActionTab>("trade");
  const [showBuildCost, setShowBuildCost] = useState(false);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId);
  const activePlayerId = pendingPlayerId ?? state.currentPlayerId;
  const waitingPlayer = state.players.find((player) => player.id === activePlayerId) ?? currentPlayer;
  const canInteract = interactionMode === "hot-seat" || viewerPlayerId === activePlayerId;
  const dockContextKey = [
    state.turn,
    state.currentPlayerId,
    state.phase,
    state.pending?.kind ?? "none",
    pendingPlayerId ?? state.pending?.playerId ?? "none",
    viewerPlayerId,
    interactionMode
  ].join(":");
  const previousStateRef = useRef(state);
  const previousDockContextKeyRef = useRef(dockContextKey);
  const [refreshSerial, setRefreshSerial] = useState(0);
  const panelRefreshKey = `${dockContextKey}:${refreshSerial}`;

  useLayoutEffect(() => {
    const stateChanged = previousStateRef.current !== state;
    const contextChanged = previousDockContextKeyRef.current !== dockContextKey;
    previousStateRef.current = state;
    previousDockContextKeyRef.current = dockContextKey;
    if (!stateChanged && !contextChanged) return;

    setRefreshSerial((value) => value + 1);
    setTool("none");
    setSelection(undefined);
    setShowBuildCost(false);
    if (contextChanged || mode !== "freeAction" || state.phase !== "action") {
      setActiveTab("trade");
    }
  }, [dockContextKey, mode, setSelection, setTool, state]);

  return (
    <aside className="right-operation-dock" data-mode={mode} aria-label="右侧操作窗口">
      <section className="panel dock-title">
        <span>{modeText(mode)} · {phaseLabels[state.phase]}</span>
        <strong>{currentPlayer?.name}</strong>
      </section>

      <div className="dock-utility-row" aria-label="快捷菜单">
        <button type="button" className="panel dock-mini-button dock-cost-button" onClick={() => setShowBuildCost(true)}>
          <span>建造成本</span>
        </button>
        <button type="button" className="panel dock-mini-button dock-menu-button" onClick={() => setShowSystemMenu(true)}>
          <Menu size={15} />
          <span>菜单</span>
        </button>
      </div>

      {canInteract && mode !== "pending" && (
        <SelectionPanel state={state} selection={selection} setSelection={setSelection} submit={submit} />
      )}

      {canInteract && mode === "pending" && <PendingPanel key={panelRefreshKey} state={state} submit={submit} setTool={setTool} />}
      {canInteract && mode === "mustRoll" && <DiceAction key={panelRefreshKey} state={state} submit={submit} />}
      {mode === "victory" && <VictoryPanel state={state} />}
      {canInteract && mode === "freeAction" && state.phase === "setup" && <SetupAction tool={tool} setTool={setTool} />}
      {canInteract && mode === "freeAction" && state.phase !== "setup" && state.phase !== "action" && (
        <section className="panel action-card">
          <h2>战局处理中</h2>
          <p className="phase-copy">当前阶段没有常规行动入口。</p>
        </section>
      )}
      {!canInteract && interactionMode === "online" && mode !== "victory" && (
        <section className="panel action-card">
          <h2>等待其他玩家行动</h2>
          <p className="phase-copy">{waitingPlayer?.name ?? "其他玩家"} 正在处理当前回合。</p>
        </section>
      )}
      {canInteract && mode === "freeAction" && state.phase === "action" && (
        <section className="panel action-card operation-tabs-card">
          <div className="action-tabs" role="tablist" aria-label="行动分类">
            {ACTION_TABS.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "active" : ""}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === "trade" || tab.id === "development") setTool("none");
                }}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          {activeTab === "trade" && <TradeAction key={panelRefreshKey} state={state} submit={submit} />}
          {activeTab === "build" && (
            <BuildAction key={panelRefreshKey} state={state} tool={tool} setTool={setTool} setSelection={setSelection} />
          )}
          {activeTab === "militia" && (
            <MilitiaAction
              key={panelRefreshKey}
              state={state}
              submit={submit}
              setTool={setTool}
              setSelection={setSelection}
            />
          )}
          {activeTab === "development" && <BuyDevelopmentCardAction key={panelRefreshKey} state={state} submit={submit} />}
        </section>
      )}

      <MainTurnButton
        state={state}
        mode={mode}
        animationBusy={animationBusy}
        interactionLocked={!canInteract && interactionMode === "online" && mode !== "victory"}
        lockedSubtitle={`${waitingPlayer?.name ?? "其他玩家"} 正在行动`}
        submit={submit}
      />

      {showBuildCost &&
        createPortal(
          <div
            className="build-cost-modal-layer"
            role="presentation"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setShowBuildCost(false);
            }}
          >
            <BuildCostPanel onClose={() => setShowBuildCost(false)} />
          </div>,
          document.body
        )}

      {showSystemMenu &&
        createPortal(
          <div
            className="system-menu-modal-layer"
            role="presentation"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setShowSystemMenu(false);
            }}
          >
            <section className="themed-modal system-menu-modal" role="dialog" aria-modal="true" aria-labelledby="system-menu-title">
              <header className="system-menu-header">
                <div>
                  <span className="system-menu-kicker">系统</span>
                  <h2 id="system-menu-title">系统菜单</h2>
                </div>
                <button
                  type="button"
                  className="icon-button modal-close-button"
                  aria-label="关闭系统菜单"
                  onClick={() => setShowSystemMenu(false)}
                >
                  <X size={18} />
                </button>
              </header>
              {interactionMode === "online" && onlineRoomCode && onlineConnectionState && onLeaveOnlineRoom ? (
                <OnlineRoomPanel
                  roomCode={onlineRoomCode}
                  connectionState={onlineConnectionState}
                  onLeaveRoom={onLeaveOnlineRoom}
                />
              ) : (
                <PersistencePanel
                  state={state}
                  onClear={onClear}
                  onImportState={onImportState}
                  submit={submit}
                  setTool={setTool}
                />
              )}
            </section>
          </div>,
          document.body
        )}
    </aside>
  );
}

function SetupAction({ tool, setTool }: { tool: UiTool; setTool: (tool: UiTool) => void }) {
  return (
    <section className="panel action-card">
      <h2>
        <Flag size={18} />
        初始设置
      </h2>
      <p className="phase-copy">在中央棋盘点击合法交叉点放置营地。</p>
      <button className={tool === "initialCamp" ? "selected wide" : "wide"} onClick={() => setTool("initialCamp")}>
        <Flag size={16} />
        选择初始营地位置
      </button>
    </section>
  );
}

function SelectionPanel({
  state,
  selection,
  setSelection,
  submit
}: {
  state: GameState;
  selection?: UiSelection;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  submit: (command: Command) => void;
}) {
  if (!selection) return null;
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId);
  const cancel = <button onClick={() => setSelection(undefined)}>取消</button>;

  if (selection.kind === "moveConvoy") {
    return (
      <div className="selection-panel dock-selection-panel">
        <strong>移动车队</strong>
        <p>{selection.fromEdgeId ? "再点击一条合法目标边。" : "先点击一条开放的己方装甲车队。"}</p>
        {cancel}
      </div>
    );
  }

  if (selection.kind === "moveMilitia") {
    return (
      <div className="selection-panel dock-selection-panel">
        <strong>移动民兵</strong>
        <p>点击一个通过己方路线相连、且驻守未满的营地或堡垒。</p>
        {cancel}
      </div>
    );
  }

  if (selection.kind === "expelZombie") {
    return (
      <div className="selection-panel dock-selection-panel">
        <strong>驱逐尸潮</strong>
        <p>点击另一个已翻开的地块作为尸潮新位置。</p>
        {cancel}
      </div>
    );
  }

  if (selection.kind === "devMerchant") {
    return (
      <div className="selection-panel dock-selection-panel">
        <strong>商人</strong>
        <p>点击一个与 {currentPlayer?.name} 建筑相邻的已翻开资源地块。</p>
        {cancel}
      </div>
    );
  }

  if (selection.kind === "devMilitia") {
    return (
      <div className="selection-panel dock-selection-panel">
        <strong>民兵动员</strong>
        <p>点击一个己方营地或堡垒部署民兵；每处最多两个。</p>
        {cancel}
      </div>
    );
  }

  return (
    <div className="selection-panel dock-selection-panel">
      <strong>开路队</strong>
      <p>选择路线类型后点击最多两条合法边；运输线仍不能放在两个空地之间。</p>
      <div className="segmented small">
        {(["transport", "convoy"] as RouteType[]).map((routeType) => (
          <button
            key={routeType}
            className={selection.routeType === routeType ? "active" : ""}
            onClick={() => setSelection({ ...selection, routeType })}
          >
            {routeType === "transport" ? "运输线" : "装甲车队"}
          </button>
        ))}
      </div>
      <div className="inline-actions">
        <button
          disabled={selection.routes.length === 0}
          onClick={() =>
            submit({
              type: "playDevelopmentCard",
              cardId: selection.cardId,
              payload: { routes: selection.routes }
            })
          }
        >
          使用已选 {selection.routes.length} 条
        </button>
        {cancel}
      </div>
    </div>
  );
}

function VictoryPanel({ state }: { state: GameState }) {
  const winner = state.players.find((player) => player.id === state.winnerId);
  return (
    <section className="panel action-card victory-dock">
      <Skull size={28} />
      <h2>{winner?.name} 获胜</h2>
      <p>尸潮暂退，废土归于新的领袖。</p>
    </section>
  );
}

function modeText(mode: TurnUiMode): string {
  const labels: Record<TurnUiMode, string> = {
    mustRoll: "主操作：掷骰",
    pending: "主操作：待处理",
    freeAction: "主操作：自由行动",
    victory: "主操作：胜利"
  };
  return labels[mode];
}
