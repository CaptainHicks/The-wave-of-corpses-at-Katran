import {
  ArrowLeft,
  BookOpen,
  Bug,
  CloudFog,
  Monitor,
  Play,
  Save,
  Settings,
  Users,
  WifiOff
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { PLAYER_FACTIONS } from "../domain/constants";
import type { Command } from "../domain/types";
import type { LobbyView, RoomCreateRequest, RoomJoinRequest } from "../online/protocol";
import { AudioSettingsPanel } from "./audio/AudioSettingsPanel";

type StartMenuView = "main" | "mode" | "setup" | "rules" | "settings" | "credits" | "onlineSetup";

interface OnlineStartScreenProps {
  busy: boolean;
  error?: string;
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";
  lobbyView?: LobbyView;
  onCreateRoom: (payload: RoomCreateRequest) => void | Promise<unknown>;
  onJoinRoom: (payload: RoomJoinRequest) => void | Promise<unknown>;
  onStartRoom: () => void;
  onLeaveRoom: () => void;
  onDismissError: () => void;
}

interface StartScreenProps {
  hasSavedGame: boolean;
  savedGameSummary?: {
    turn: number;
    currentPlayerName: string;
  };
  onContinue: () => void;
  onCreate: (command: Command) => void;
  online?: OnlineStartScreenProps;
}

const DEFAULT_NAMES = PLAYER_FACTIONS.map((faction) => faction.name);
const DEFAULT_FACTION_IDS = PLAYER_FACTIONS.map((faction) => faction.id);
const DEFAULT_NAME_SET: ReadonlySet<string> = new Set(DEFAULT_NAMES);

function factionById(factionId: string) {
  return PLAYER_FACTIONS.find((faction) => faction.id === factionId) ?? PLAYER_FACTIONS[0];
}

function gameSeed(): string {
  return `wasteland-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function StartScreen({ hasSavedGame, savedGameSummary, onContinue, onCreate, online }: StartScreenProps) {
  const [view, setView] = useState<StartMenuView>("main");
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [factionIds, setFactionIds] = useState<string[]>(DEFAULT_FACTION_IDS);
  const [fogEnabled, setFogEnabled] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [onlineName, setOnlineName] = useState<string>(DEFAULT_NAMES[0]);
  const [onlineFactionId, setOnlineFactionId] = useState<string>(DEFAULT_FACTION_IDS[0]);
  const [onlineTargetCount, setOnlineTargetCount] = useState(2);
  const [onlineFogEnabled, setOnlineFogEnabled] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const activeFactionIds = factionIds.slice(0, count);

  const updateFaction = (index: number, factionId: string) => {
    const faction = factionById(factionId);
    const previousFaction = factionById(factionIds[index]);
    const swapIndex = activeFactionIds.findIndex((item, itemIndex) => itemIndex !== index && item === faction.id);
    setFactionIds((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex === index) return faction.id;
        if (itemIndex === swapIndex) return previousFaction.id;
        return item;
      })
    );
    setNames((current) =>
      current.map((name, itemIndex) => {
        if (itemIndex === index && DEFAULT_NAME_SET.has(name)) return faction.name;
        if (itemIndex === swapIndex && DEFAULT_NAME_SET.has(name)) return previousFaction.name;
        return name;
      })
    );
  };

  const createGame = () => {
    onCreate({
      type: "createGame",
      players: names.slice(0, count).map((name, index) => {
        const faction = factionById(factionIds[index]);
        return {
          name: name.trim() || faction.name,
          color: faction.color,
          factionId: faction.id
        };
      }),
      seed: gameSeed(),
      fogEnabled,
      debugMode
    });
  };

  const returnToMain = () => setView("main");

  const renderMainMenu = () => (
    <div className="start-menu-stack" aria-label="主菜单">
      <button className="start-menu-button start-menu-button-primary" aria-label="开始游戏" onClick={() => setView("mode")}>
        <Monitor size={34} />
        <span>开始游戏</span>
      </button>
      <button className="start-menu-button" aria-label="继续游戏" disabled={!hasSavedGame} onClick={onContinue}>
        <Save size={34} />
        <span>继续游戏</span>
      </button>
      {hasSavedGame && savedGameSummary && (
        <p className="start-save-summary">第 {savedGameSummary.turn} 回合 · {savedGameSummary.currentPlayerName}</p>
      )}
      <button className="start-menu-button" aria-label="规则说明" onClick={() => setView("rules")}>
        <BookOpen size={34} />
        <span>规则说明</span>
      </button>
      <button className="start-menu-button" aria-label="设置" onClick={() => setView("settings")}>
        <Settings size={34} />
        <span>设置</span>
      </button>
      <button className="start-menu-button" aria-label="制作人员" onClick={() => setView("credits")}>
        <Users size={34} />
        <span>制作人员</span>
      </button>
    </div>
  );

  const renderModeSelect = () => (
    <div className="start-menu-panel start-mode-panel">
      <div className="start-panel-heading">
        <span>行动频道</span>
        <h2>选择开局模式</h2>
      </div>
      <div className="start-mode-grid">
        <button className="start-mode-card start-mode-card-active" aria-label="本地热座" onClick={() => setView("setup")}>
          <Monitor size={28} />
          <strong>本地热座</strong>
          <small>2-6 名玩家共用一台设备，轮流接管控制台。</small>
        </button>
        <button className="start-mode-card" aria-label="在线联机" onClick={() => setView("onlineSetup")}>
          <WifiOff size={28} />
          <strong>在线联机</strong>
          <small>创建私有房间，通过房间码加入，并支持断线重连。</small>
        </button>
      </div>
      <button className="start-back-button" onClick={returnToMain}>
        <ArrowLeft size={18} />
        返回主菜单
      </button>
    </div>
  );

  const renderSetup = () => (
    <div className="start-menu-panel start-setup-panel">
      <div className="start-panel-heading">
        <span>本地热座</span>
        <h2>选人选阵营</h2>
      </div>

      <label className="start-field start-count-field">
        <span>玩家人数</span>
        <select aria-label="玩家人数" value={count} onChange={(event) => setCount(Number(event.target.value))}>
          {[2, 3, 4, 5, 6].map((value) => (
            <option key={value} value={value}>
              {value} 人
            </option>
          ))}
        </select>
      </label>

      <div className="player-setup-list start-player-setup-list">
        {Array.from({ length: count }, (_, index) => {
          const selectedFaction = factionById(factionIds[index]);
          return (
            <div
              key={index}
              className="player-setup-row start-player-setup-row"
              style={{ "--player-color": selectedFaction.color } as CSSProperties}
            >
              <label className="field compact-field">
                <span>玩家 {index + 1}</span>
                <input
                  value={names[index]}
                  onChange={(event) => {
                    const next = [...names];
                    next[index] = event.target.value;
                    setNames(next);
                  }}
                />
              </label>
              <label className="field compact-field">
                <span>阵营</span>
                <div className="faction-select-row">
                  <span className="start-faction-portrait" aria-hidden="true">
                    <img src={selectedFaction.portrait} alt="" />
                  </span>
                  <select
                    aria-label={`玩家 ${index + 1} 阵营`}
                    value={selectedFaction.id}
                    onChange={(event) => updateFaction(index, event.target.value)}
                  >
                    {PLAYER_FACTIONS.map((faction) => (
                      <option key={faction.id} value={faction.id}>
                        {faction.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>
          );
        })}
      </div>

      <div className="start-option-grid">
        <label className={fogEnabled ? "start-option-toggle start-fog-toggle active" : "start-option-toggle start-fog-toggle"}>
          <input type="checkbox" checked={fogEnabled} onChange={(event) => setFogEnabled(event.target.checked)} />
          <CloudFog size={18} />
          <span>
            <strong>迷雾探索</strong>
            <small>{fogEnabled ? "开启：未探索地块隐藏" : "关闭：开局全地图可见"}</small>
          </span>
        </label>

        <label className={debugMode ? "start-option-toggle start-debug-toggle active" : "start-option-toggle start-debug-toggle"}>
          <input type="checkbox" checked={debugMode} onChange={(event) => setDebugMode(event.target.checked)} />
          <Bug size={18} />
          <span>
            <strong>调试模式</strong>
            <small>固定骰子 / 补给资源 / 阶段跳转</small>
          </span>
        </label>
      </div>

      <div className="start-panel-actions">
        <button className="start-back-button" onClick={() => setView("mode")}>
          <ArrowLeft size={18} />
          返回
        </button>
        <button className="start-confirm-button" onClick={createGame}>
          <Play size={20} />
          确认开局
        </button>
      </div>
    </div>
  );

  const renderRules = () => (
    <div className="start-menu-panel start-info-panel">
      <div className="start-panel-heading">
        <span>规则说明</span>
        <h2>废土拓荒简报</h2>
      </div>
      <div className="start-brief-grid">
        <article>
          <strong>目标</strong>
          <p>通过营地、堡垒、最长补给线、民兵和秘密据点累计胜利点，率先达到胜利条件。</p>
        </article>
        <article>
          <strong>回合</strong>
          <p>先摇骰产出资源，再自由交易、建造、购买发展卡和调动民兵，最后结束回合。</p>
        </article>
        <article>
          <strong>尸潮</strong>
          <p>掷出 7 或探索感染区会推进尸潮。尸潮爆发时，堡垒防御失败的玩家会被迫降级。</p>
        </article>
      </div>
      <button className="start-back-button" onClick={returnToMain}>
        <ArrowLeft size={18} />
        返回主菜单
      </button>
    </div>
  );

  const renderSettings = () => (
    <div className="start-menu-panel start-info-panel">
      <div className="start-panel-heading">
        <span>设置</span>
        <h2>声音设置</h2>
      </div>
      <AudioSettingsPanel className="start-audio-settings-panel" />
      <button className="start-back-button" onClick={returnToMain}>
        <ArrowLeft size={18} />
        返回主菜单
      </button>
    </div>
  );

  const renderCredits = () => (
    <div className="start-menu-panel start-info-panel">
      <div className="start-panel-heading">
        <span>制作人员</span>
        <h2>希望镇档案</h2>
      </div>
      <div className="start-credit-list">
        <p><strong>游戏设计</strong><span>尸潮卡坦：废土拓荒项目组</span></p>
        <p><strong>界面实现</strong><span>React / TypeScript / Vite</span></p>
        <p><strong>美术素材</strong><span>项目美术素材库</span></p>
      </div>
      <button className="start-back-button" onClick={returnToMain}>
        <ArrowLeft size={18} />
        返回主菜单
      </button>
    </div>
  );

  const renderOnlineSetup = () => {
    const selectedFaction = factionById(onlineFactionId);
    const onlineBusy = online?.busy ?? false;

    return (
      <div className="start-menu-panel start-setup-panel">
        <div className="start-panel-heading">
          <span>在线联机</span>
          <h2>创建房间或加入房间</h2>
        </div>

        {online?.error && <p className="start-panel-copy">{online.error}</p>}

        <div className="player-setup-row start-player-setup-row" style={{ "--player-color": selectedFaction.color } as CSSProperties}>
          <label className="field compact-field">
            <span>玩家名称</span>
            <input aria-label="在线玩家名称" value={onlineName} onChange={(event) => setOnlineName(event.target.value)} />
          </label>
          <label className="field compact-field">
            <span>阵营</span>
            <div className="faction-select-row">
              <span className="start-faction-portrait" aria-hidden="true">
                <img src={selectedFaction.portrait} alt="" />
              </span>
              <select aria-label="在线玩家阵营" value={selectedFaction.id} onChange={(event) => setOnlineFactionId(event.target.value)}>
                {PLAYER_FACTIONS.map((faction) => (
                  <option key={faction.id} value={faction.id}>
                    {faction.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="start-option-grid">
          <label className="start-field start-count-field">
            <span>联机人数</span>
            <select aria-label="在线房间人数" value={onlineTargetCount} onChange={(event) => setOnlineTargetCount(Number(event.target.value))}>
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value} 人
                </option>
              ))}
            </select>
          </label>
          <label className={onlineFogEnabled ? "start-option-toggle start-fog-toggle active" : "start-option-toggle start-fog-toggle"}>
            <input type="checkbox" checked={onlineFogEnabled} onChange={(event) => setOnlineFogEnabled(event.target.checked)} />
            <CloudFog size={18} />
            <span>
              <strong>迷雾探索</strong>
              <small>{onlineFogEnabled ? "开启：新房间保留迷雾探索" : "关闭：新房间地图全公开"}</small>
            </span>
          </label>
        </div>

        <div className="start-panel-actions">
          <button
            className="start-confirm-button"
            disabled={onlineBusy || !online}
            onClick={() =>
              online?.onCreateRoom({
                name: onlineName.trim() || selectedFaction.name,
                color: selectedFaction.color,
                factionId: selectedFaction.id,
                targetPlayerCount: onlineTargetCount,
                fogEnabled: onlineFogEnabled
              })
            }
          >
            <WifiOff size={18} />
            创建在线房间
          </button>
        </div>

        <div className="start-menu-panel start-info-panel">
          <div className="start-panel-heading">
            <span>加入房间</span>
            <h2>输入房间码加入朋友的对局</h2>
          </div>
          <label className="start-field">
            <span>房间码</span>
            <input
              aria-label="在线房间码"
              value={joinRoomCode}
              onChange={(event) => setJoinRoomCode(event.target.value.toUpperCase())}
              placeholder="例如 ROOM42"
            />
          </label>
          <div className="start-panel-actions">
            <button
              className="start-confirm-button"
              disabled={onlineBusy || !online || !joinRoomCode.trim()}
              onClick={() =>
                online?.onJoinRoom({
                  roomCode: joinRoomCode.trim().toUpperCase(),
                  name: onlineName.trim() || selectedFaction.name,
                  color: selectedFaction.color,
                  factionId: selectedFaction.id
                })
              }
            >
              <Play size={18} />
              加入在线房间
            </button>
            <button className="start-back-button" onClick={() => setView("mode")}>
              <ArrowLeft size={18} />
              返回模式选择
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderOnlineLobby = () => {
    if (!online?.lobbyView) return renderOnlineSetup();
    const { lobbyView } = online;

    return (
      <div className="start-menu-panel start-info-panel">
        <div className="start-panel-heading">
          <span>在线联机</span>
          <h2>房间 {lobbyView.roomMeta.roomCode}</h2>
        </div>
        {online.error && <p className="start-panel-copy">{online.error}</p>}
        <p className="start-panel-copy">
          当前 {lobbyView.seats.length}/{lobbyView.roomMeta.targetPlayerCount} 人，连接状态：{online.connectionState}。
        </p>
        <div className="start-credit-list">
          {lobbyView.seats.map((seat) => (
            <p key={seat.playerId}>
              <strong>{seat.name}</strong>
              <span>{seat.connected ? "已连接" : "已断线"} · {factionById(seat.factionId ?? DEFAULT_FACTION_IDS[0]).name}</span>
            </p>
          ))}
        </div>
        <div className="start-panel-actions">
          <button className="start-confirm-button" disabled={!lobbyView.canStart || online.busy} onClick={online.onStartRoom}>
            <Play size={18} />
            房主开始游戏
          </button>
          <button className="start-back-button" onClick={online.onLeaveRoom}>
            <ArrowLeft size={18} />
            离开房间
          </button>
        </div>
      </div>
    );
  };

  const renderActivePanel = () => {
    if (online?.lobbyView) return renderOnlineLobby();
    if (view === "mode") return renderModeSelect();
    if (view === "setup") return renderSetup();
    if (view === "rules") return renderRules();
    if (view === "settings") return renderSettings();
    if (view === "credits") return renderCredits();
    if (view === "onlineSetup") return renderOnlineSetup();
    return renderMainMenu();
  };

  return (
    <main
      className={[
        "start-screen",
        "start-screen-ambient",
        "start-screen-strong-vignette"
      ].filter(Boolean).join(" ")}
    >
      <div className="start-stage">
        <div className="start-logo-lockup">
          <img src="/assets/menu/title-logo.v1.webp" alt="尸潮卡坦：废土拓荒" />
        </div>
        <section className={view === "main" ? "start-menu-region" : "start-menu-region start-menu-region-panel"}>
          {renderActivePanel()}
        </section>
        <p className="start-version">版本号：1.0.0</p>
      </div>
    </main>
  );
}
