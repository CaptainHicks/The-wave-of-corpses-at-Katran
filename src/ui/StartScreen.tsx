import {
  ArrowLeft,
  Bot,
  BookOpen,
  Bug,
  CloudFog,
  Copy,
  Crown,
  Dices,
  DoorOpen,
  Globe2,
  Play,
  Palette,
  Radio,
  Save,
  Search,
  Settings,
  Shield,
  Smile,
  TowerControl,
  User,
  UserPlus,
  Users,
  Wifi,
  WifiOff
} from "lucide-react";
import type { CSSProperties, KeyboardEvent, MouseEvent, UIEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PIECE_LIMITS, PLAYER_FACTIONS, VICTORY_POINTS_TO_WIN } from "../domain/constants";
import type { Command } from "../domain/types";
import type {
  LobbyView,
  RoomChatRequest,
  RoomChooseFactionRequest,
  RoomCreateRequest,
  RoomJoinRequest
} from "../online/protocol";
import { AudioSettingsPanel } from "./audio/AudioSettingsPanel";
import { preloadGameArtAssets } from "./art/preloadGameAssets";

type StartMenuView = "main" | "mode" | "setup" | "rules" | "settings" | "credits" | "onlineSetup";
type OnlineSetupMode = "select" | "create" | "join";
type OnlineConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

interface OnlineStartScreenProps {
  busy: boolean;
  error?: string;
  connectionState: OnlineConnectionState;
  lobbyView?: LobbyView;
  onCreateRoom: (payload: RoomCreateRequest) => void | Promise<unknown>;
  onJoinRoom: (payload: RoomJoinRequest) => void | Promise<unknown>;
  onChooseFaction: (payload: RoomChooseFactionRequest) => void | Promise<unknown>;
  onSendChatMessage: (payload: RoomChatRequest) => void | Promise<unknown>;
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

const EMPTY_LOCAL_NAMES = PLAYER_FACTIONS.map(() => "");
const EMPTY_LOCAL_FACTION_IDS = PLAYER_FACTIONS.map(() => "");
const DEFAULT_LOCAL_CONTROLLERS = PLAYER_FACTIONS.map((_, index) => (index === 0 ? "human" : "ai") as "human" | "ai");
const ROOM_CODE_LENGTH = 6;
const START_STAGE_WIDTH = 1672;
const START_STAGE_HEIGHT = 941;

const FACTION_FLAVOR: Record<(typeof PLAYER_FACTIONS)[number]["id"], string> = {
  "red-rust": "由废土边缘聚起的赤色营地，旗帜和部件呈赤锈色。",
  "blue-steel": "以钢蓝涂装标记的前哨队，保留旧工业哨站的秩序感。",
  "green-oasis": "来自绿洲聚落的行旅队，带着水源与车队的旧记忆。",
  "gold-sand": "扎根黄沙堡垒的幸存者，徽记映着荒漠金色。",
  "white-tower": "围绕白塔建立的公社，信标和建筑保留明亮轮廓。",
  "ash-merchant": "穿行灰烬荒路的商队，以冷灰色旗记辨认彼此。"
};

const CONNECTION_LABELS: Record<OnlineConnectionState, string> = {
  connected: "信号稳定",
  connecting: "正在校准",
  reconnecting: "重连中",
  disconnected: "离线待机"
};

const CONNECTION_TONES: Record<OnlineConnectionState, string> = {
  connected: "online",
  connecting: "pending",
  reconnecting: "pending",
  disconnected: "offline"
};

const PIECE_LIMIT_RULE_ITEMS = [
  { label: "营地", value: `${PIECE_LIMITS.camps} 个` },
  { label: "堡垒", value: `${PIECE_LIMITS.fortresses} 个` },
  { label: "运输线", value: `${PIECE_LIMITS.transports} 条` },
  { label: "装甲车队", value: `${PIECE_LIMITS.convoys} 个` },
  { label: "哨塔", value: `${PIECE_LIMITS.watchtowers} 个` },
  { label: "民兵", value: `${PIECE_LIMITS.militia} 个` }
] as const;

const RULE_SECTIONS = [
  { id: "rules-overview", label: "游戏概述" },
  { id: "rules-goal", label: "游戏目标" },
  { id: "rules-turn", label: "回合流程" },
  { id: "rules-resources", label: "资源与建造" },
  { id: "rules-horde", label: "尸潮来袭与围城" },
  { id: "rules-militia", label: "民兵规则" },
  { id: "rules-fog", label: "探索与迷雾" },
  { id: "rules-cards", label: "交易与发展卡" },
  { id: "rules-victory", label: "胜利与失败" },
  { id: "rules-faq", label: "常见问题" }
] as const;

type RuleSectionId = (typeof RULE_SECTIONS)[number]["id"];

function findFactionById(factionId?: string) {
  return PLAYER_FACTIONS.find((faction) => faction.id === factionId);
}

function gameSeed(): string {
  return `wasteland-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function normalizeRoomCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function isFailedOnlineActionResult(result: unknown) {
  return Boolean(result && typeof result === "object" && "ok" in result && result.ok === false);
}

function getStartStageScale() {
  if (typeof window === "undefined") return 1;
  return Math.max(0.01, Math.min(window.innerWidth / START_STAGE_WIDTH, window.innerHeight / START_STAGE_HEIGHT));
}

function syncFixedStageScale(scale: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--fixed-stage-scale", String(scale));
}

export function StartScreen({ hasSavedGame, savedGameSummary, onContinue, onCreate, online }: StartScreenProps) {
  const [view, setView] = useState<StartMenuView>("main");
  const [stageScale, setStageScale] = useState(getStartStageScale);
  const [count, setCount] = useState(4);
  const [names, setNames] = useState<string[]>(EMPTY_LOCAL_NAMES);
  const [localFactionIds, setLocalFactionIds] = useState<string[]>(EMPTY_LOCAL_FACTION_IDS);
  const [localControllers, setLocalControllers] = useState<Array<"human" | "ai">>(DEFAULT_LOCAL_CONTROLLERS);
  const [fogEnabled, setFogEnabled] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [onlineHostName, setOnlineHostName] = useState<string>("");
  const [onlineJoinName, setOnlineJoinName] = useState<string>("");
  const [onlineTargetCount, setOnlineTargetCount] = useState(2);
  const [onlineAiCount, setOnlineAiCount] = useState(0);
  const [onlineFogEnabled, setOnlineFogEnabled] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [lobbyChatDraft, setLobbyChatDraft] = useState("");
  const [onlineSetupMode, setOnlineSetupMode] = useState<OnlineSetupMode>("select");
  const [activeRuleSectionId, setActiveRuleSectionId] = useState<RuleSectionId>("rules-overview");
  const joinRoomCodeInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const lobbyChatLogRef = useRef<HTMLDivElement | null>(null);
  const rulesScrollRef = useRef<HTMLElement | null>(null);
  const stageStyle = {
    "--start-stage-scale": stageScale
  } as CSSProperties;
  const normalizedJoinRoomCode = normalizeRoomCode(joinRoomCode.trim());
  const normalizedOnlineHostName = onlineHostName.trim();
  const normalizedOnlineJoinName = onlineJoinName.trim();
  const normalizedLobbyChatDraft = lobbyChatDraft.trim();
  const selectedLocalFactionIds = localFactionIds.slice(0, count);
  const canCreateLocalGame =
    selectedLocalFactionIds.every(Boolean) && localControllers.slice(0, count).some((controller) => controller === "human");

  useLayoutEffect(() => {
    const handleResize = () => {
      const nextScale = getStartStageScale();
      setStageScale(nextScale);
      syncFixedStageScale(nextScale);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    preloadGameArtAssets();
  }, []);

  useEffect(() => {
    if (!online?.lobbyView) return;
    const chatLog = lobbyChatLogRef.current;
    if (!chatLog) return;
    chatLog.scrollTop = chatLog.scrollHeight;
  }, [online?.lobbyView?.chatMessages.length]);

  const updateLocalFaction = (index: number, factionId: string) => {
    const previousFaction = findFactionById(localFactionIds[index]);
    const nextFaction = findFactionById(factionId);
    setLocalFactionIds((current) => current.map((item, itemIndex) => (itemIndex === index ? factionId : item)));
    setNames((current) =>
      current.map((name, itemIndex) => {
        if (itemIndex !== index) return name;
        const isDefaultName = !name.trim() || Boolean(previousFaction && name === previousFaction.name);
        if (!isDefaultName) return name;
        return nextFaction?.name ?? "";
      })
    );
  };

  const createGame = () => {
    if (!canCreateLocalGame) return;
    onCreate({
      type: "createGame",
      players: selectedLocalFactionIds.map((factionId, index) => {
        const faction = findFactionById(factionId) ?? PLAYER_FACTIONS[0];
        const playerName = names[index] ?? "";
        return {
          name: playerName.trim() || faction.name,
          color: faction.color,
          factionId: faction.id,
          controller: localControllers[index] ?? "ai"
        };
      }),
      seed: gameSeed(),
      fogEnabled,
      debugMode
    });
  };

  const returnToMain = () => setView("main");
  const enterOnlineSetup = () => setView("onlineSetup");
  const dismissOnlineError = () => online?.onDismissError();
  const setNormalizedJoinRoomCode = (value: string) => setJoinRoomCode(normalizeRoomCode(value).slice(0, ROOM_CODE_LENGTH));

  const focusJoinRoomCodeInput = (index: number) => {
    const nextIndex = Math.max(0, Math.min(index, ROOM_CODE_LENGTH - 1));
    window.setTimeout(() => {
      const input = joinRoomCodeInputRefs.current[nextIndex];
      input?.focus();
      input?.select();
    }, 0);
  };

  const updateJoinRoomCodeAt = (index: number, value: string) => {
    const normalizedValue = normalizeRoomCode(value);
    const next = normalizedJoinRoomCode.padEnd(ROOM_CODE_LENGTH, " ").split("");

    if (normalizedValue.length > 1) {
      normalizedValue
        .slice(0, ROOM_CODE_LENGTH - index)
        .split("")
        .forEach((character, offset) => {
          next[index + offset] = character;
        });
      setJoinRoomCode(next.join("").replace(/\s/g, "").slice(0, ROOM_CODE_LENGTH));
      focusJoinRoomCodeInput(index + normalizedValue.length);
      return;
    }

    next[index] = normalizedValue || " ";
    setJoinRoomCode(next.join("").replace(/\s/g, "").slice(0, ROOM_CODE_LENGTH));
    if (normalizedValue) focusJoinRoomCodeInput(index + 1);
  };

  const handleJoinRoomCodeFocus = (index: number) => {
    if (!normalizedJoinRoomCode && index > 0) focusJoinRoomCodeInput(0);
  };

  const handleJoinRoomCodeKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusJoinRoomCodeInput(index - 1);
      return;
    }

    if (event.key === "ArrowRight" && index < ROOM_CODE_LENGTH - 1) {
      event.preventDefault();
      focusJoinRoomCodeInput(index + 1);
      return;
    }

    if (event.key !== "Backspace" || normalizedJoinRoomCode[index] || index === 0) return;
    event.preventDefault();
    const next = normalizedJoinRoomCode.padEnd(ROOM_CODE_LENGTH, " ").split("");
    next[index - 1] = " ";
    setJoinRoomCode(next.join("").replace(/\s/g, "").slice(0, ROOM_CODE_LENGTH));
    focusJoinRoomCodeInput(index - 1);
  };

  const handleRulesScroll = (event: UIEvent<HTMLElement>) => {
    const scrollContainer = event.currentTarget;
    const currentPosition = scrollContainer.scrollTop + 48;
    let nextActiveSectionId: RuleSectionId = RULE_SECTIONS[0].id;

    for (const section of RULE_SECTIONS) {
      const sectionElement = scrollContainer.querySelector<HTMLElement>(`#${section.id}`);
      if (sectionElement && sectionElement.offsetTop <= currentPosition) {
        nextActiveSectionId = section.id;
      }
    }

    setActiveRuleSectionId(nextActiveSectionId);
  };

  const handleRuleSectionClick = (sectionId: RuleSectionId, event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const scrollContainer = rulesScrollRef.current;
    const sectionElement = scrollContainer?.querySelector<HTMLElement>(`#${sectionId}`);

    if (scrollContainer && sectionElement) {
      scrollContainer.scrollTo({ top: sectionElement.offsetTop, behavior: "auto" });
    }

    setActiveRuleSectionId(sectionId);
  };

  const renderErrorBanner = () =>
    online?.error ? (
      <div className="start-alert" role="alert">
        <strong>信标回报</strong>
        <span>{online.error}</span>
        <button type="button" aria-label="关闭联机提示" onClick={dismissOnlineError}>
          收起
        </button>
      </div>
    ) : null;

  const renderMainMenu = () => (
    <div className="start-menu-stack" aria-label="主菜单">
      <button className="start-menu-button start-menu-button-primary" aria-label="开始游戏" onClick={() => setView("mode")}>
        <TowerControl size={34} />
        <span>开始游戏</span>
        <small>本地围桌、在线房间，从这里进入战局</small>
      </button>
      <button className="start-menu-button" aria-label="继续游戏" disabled={!hasSavedGame} onClick={onContinue}>
        <Save size={34} />
        <span>继续游戏</span>
        <small>{hasSavedGame ? "读取上一份废土拓荒档案" : "暂无可用存档"}</small>
      </button>
      {hasSavedGame && savedGameSummary && (
        <p className="start-save-summary">
          上次停在第 {savedGameSummary.turn} 回合，当前指挥官：{savedGameSummary.currentPlayerName}
        </p>
      )}
      <button className="start-menu-button" aria-label="规则说明" onClick={() => setView("rules")}>
        <BookOpen size={34} />
        <span>规则说明</span>
        <small>胜利目标、回合节奏、尸潮压力</small>
      </button>
      <button className="start-menu-button" aria-label="设置" onClick={() => setView("settings")}>
        <Settings size={34} />
        <span>设置</span>
        <small>调整背景音乐与行动音效</small>
      </button>
      <button className="start-menu-button" aria-label="制作人员" onClick={() => setView("credits")}>
        <Users size={34} />
        <span>制作人员</span>
        <small>项目与素材记录</small>
      </button>
    </div>
  );

  const renderModeSelect = () => (
    <div className="start-mode-select-screen">
      <button className="start-mode-return-button" aria-label="返回主菜单" onClick={returnToMain}>
        <ArrowLeft size={22} />
        <span>返回</span>
      </button>
      <div className="start-mode-title start-secondary-title">
        <span aria-hidden="true" />
        <div>
          <h2>选择游戏方式</h2>
          <p>选择本局拓荒的集结方式</p>
        </div>
        <span aria-hidden="true" />
      </div>
      <div className="start-mode-frame start-secondary-frame">
        <div className="start-mode-grid">
        <button className="start-mode-card" aria-label="本地热座" onClick={() => setView("setup")}>
          <img className="start-mode-card-art" src="/assets/menu/mode-local-hotseat.png" alt="" />
          <span className="start-mode-card-shade" aria-hidden="true" />
          <Users size={46} />
          <strong>本地对局</strong>
          <small>
            与 AI 或身边的伙伴
            <br />
            一起游戏
          </small>
        </button>
        <button className="start-mode-card" aria-label="在线联机" onClick={enterOnlineSetup}>
          <img className="start-mode-card-art" src="/assets/menu/mode-online-play.png" alt="" />
          <span className="start-mode-card-shade" aria-hidden="true" />
          <Globe2 size={46} />
          <strong>在线游玩</strong>
          <small>
            连接网络，与远方玩家
            <br />
            一起拓荒废土
          </small>
        </button>
      </div>
      <p className="start-mode-hint">
        <span aria-hidden="true">!</span>
        你可以在主菜单选择本地热座或在线游玩
      </p>
      </div>
    </div>
  );

  const renderSetup = () => (
    <div className="start-local-setup-screen">
      <header className="start-local-title start-secondary-title">
          <span aria-hidden="true" />
          <div>
            <h2>本地对局</h2>
            <p>配置真人与 AI 席位，集结幸存者阵营</p>
          </div>
          <span aria-hidden="true" />
      </header>

      <div className="start-local-board start-secondary-frame">
        <section className="start-local-count-card">
          <h3>1. 选择玩家人数</h3>
          <p>选择参与游戏的玩家数量</p>
          <select className="sr-only" aria-label="玩家人数" value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {[2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                {value} 人
              </option>
            ))}
          </select>
          <div className="start-player-count-buttons">
            {[2, 3, 4, 5, 6].map((value) => (
              <button
                key={value}
                type="button"
                className={count === value ? "active" : ""}
                aria-pressed={count === value}
                onClick={() => setCount(value)}
              >
                <Users size={26} />
                <span>{value} 人</span>
              </button>
            ))}
          </div>
        </section>

        <section className="start-local-mode-card">
          <h3>2. 游戏模式设置</h3>
          <label className={fogEnabled ? "start-option-toggle start-fog-toggle active" : "start-option-toggle start-fog-toggle"}>
            <input type="checkbox" checked={fogEnabled} onChange={(event) => setFogEnabled(event.target.checked)} />
            <CloudFog size={26} />
            <span>
              <strong>迷雾探索模式</strong>
              <small>隐藏地图信息，探索未知区域</small>
            </span>
            <b>{fogEnabled ? "开启" : "关闭"}</b>
          </label>

          <label className={debugMode ? "start-option-toggle start-debug-toggle active" : "start-option-toggle start-debug-toggle"}>
            <input type="checkbox" checked={debugMode} onChange={(event) => setDebugMode(event.target.checked)} />
            <Bug size={26} />
            <span>
              <strong>调试模式</strong>
              <small>开启后可获得额外资源和调试功能</small>
            </span>
            <b>{debugMode ? "开启" : "关闭"}</b>
          </label>
        </section>

        <section className="start-local-faction-section">
          <h3>3. 配置席位 <small>（选择真人或 AI、阵营与名称）</small></h3>
          <div className="player-setup-list start-player-setup-list" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
            {Array.from({ length: count }, (_, index) => {
              const factionId = localFactionIds[index] ?? "";
              const selectedFaction = findFactionById(factionId);
              return (
                <article
                  key={`local-seat-${index}`}
                  className={selectedFaction ? "start-player-setup-row active" : "start-player-setup-row empty"}
                  style={{ "--player-color": selectedFaction?.color ?? "#6f6657" } as CSSProperties}
                >
                  <div className="start-faction-banner" aria-hidden="true">
                    {selectedFaction ? <img src={selectedFaction.portrait} alt="" /> : <Users size={44} />}
                  </div>
                  <strong>{selectedFaction?.name ?? `玩家 ${index + 1}`}</strong>
                  <p>
                    {localControllers[index] === "ai" ? "AI 将自动完成自己的回合。" : selectedFaction ? FACTION_FLAVOR[selectedFaction.id] : "请选择该席位的阵营。"}
                  </p>
                  <label className="field compact-field start-controller-select-field">
                    <span className="sr-only">玩家 {index + 1} 控制方式</span>
                    <div className="faction-select-row">
                      {localControllers[index] === "ai" ? <Bot size={18} aria-hidden="true" /> : <User size={18} aria-hidden="true" />}
                      <select
                        aria-label={`玩家 ${index + 1} 控制方式`}
                        value={localControllers[index]}
                        onChange={(event) => {
                          const next = [...localControllers];
                          next[index] = event.target.value as "human" | "ai";
                          setLocalControllers(next);
                        }}
                      >
                        <option value="human">真人玩家</option>
                        <option value="ai">AI 玩家</option>
                      </select>
                    </div>
                  </label>
                  <label className="field compact-field start-faction-select-field">
                    <span className="sr-only">玩家 {index + 1} 阵营</span>
                    <div className="faction-select-row">
                      <span className="start-faction-color-chip" aria-hidden="true" />
                      <select aria-label={`玩家 ${index + 1} 阵营`} value={factionId} onChange={(event) => updateLocalFaction(index, event.target.value)}>
                        <option value="">请选择阵营</option>
                        {PLAYER_FACTIONS.map((optionFaction) => {
                          const isTaken = selectedLocalFactionIds.some(
                            (selectedId, selectedIndex) => selectedIndex !== index && selectedId === optionFaction.id
                          );
                          return (
                            <option key={optionFaction.id} value={optionFaction.id} disabled={isTaken}>
                              {optionFaction.name}
                              {isTaken ? "（已占用）" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </label>
                  <label className="field compact-field start-faction-name-field">
                    <span className="sr-only">玩家 {index + 1} 名称</span>
                    <input
                      aria-label={`玩家 ${index + 1} 名称`}
                      disabled={!selectedFaction}
                      value={names[index] ?? ""}
                      placeholder={selectedFaction ? selectedFaction.name : "选择阵营后可命名"}
                      onChange={(event) => {
                        const next = [...names];
                        next[index] = event.target.value;
                        setNames(next);
                      }}
                    />
                  </label>
                </article>
              );
            })}
          </div>
        </section>
        <button
          className="start-confirm-button start-local-start-button"
        aria-label="确认开局"
        disabled={!canCreateLocalGame}
        title={canCreateLocalGame ? "开始本地对局" : "请为每个席位选择阵营，并保留至少一名真人玩家"}
        onClick={createGame}
      >
        <Play size={20} />
        开始游戏
      </button>
      </div>
      <button className="start-mode-return-button start-local-return-button" onClick={() => setView("mode")}>
        <ArrowLeft size={18} />
        返回
      </button>
    </div>
  );

  const renderRules = () => (
    <div className="start-rules-screen">
      <button className="start-mode-return-button start-rules-return-button" aria-label="返回主菜单" onClick={returnToMain}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>

      <header className="start-rules-header start-secondary-title">
        <span aria-hidden="true" />
        <div>
          <h2>规则说明</h2>
          <p>了解规则，活下去，才有希望。</p>
        </div>
        <span aria-hidden="true" />
      </header>

      <div className="start-rules-manual start-secondary-frame">
        <nav className="start-rules-nav" aria-label="规则章节目录">
          {RULE_SECTIONS.map((section) => {
            const isActive = activeRuleSectionId === section.id;
            return (
              <a
                key={section.id}
                className={isActive ? "active" : ""}
                href={`#${section.id}`}
                aria-current={isActive ? "true" : undefined}
                onClick={(event) => handleRuleSectionClick(section.id, event)}
              >
                {section.label}
              </a>
            );
          })}
        </nav>

        <section
          ref={rulesScrollRef}
          className="start-rules-scroll"
          role="region"
          aria-label="规则说明正文"
          tabIndex={0}
          onScroll={handleRulesScroll}
        >
          <article id="rules-overview" className="start-rules-section start-rules-section-overview">
            <div className="start-rules-section-copy">
              <span className="start-rules-kicker">01 / 生存手册</span>
              <h3>游戏概述</h3>
              <p>
                《尸潮卡坦：废土拓荒》是一款末日生存资源建设游戏。你和伙伴们扮演不同阵营的幸存者首领，
                通过掷骰获得资源、建设营地、扩张补给线、探索迷雾，并在尸潮爆发前准备好防线。
              </p>
              <div className="start-rules-hero-art" aria-hidden="true" />
            </div>
            <aside className="start-rules-info-card" aria-label="基本信息">
              <h4>基本信息</h4>
              <dl>
                <div>
                  <Users size={24} />
                  <dt>支持人数</dt>
                  <dd>2 到 6 人</dd>
                </div>
                <div>
                  <Dices size={24} />
                  <dt>核心目标</dt>
                  <dd>率先达到 {VICTORY_POINTS_TO_WIN} 点</dd>
                </div>
                <div>
                  <Globe2 size={24} />
                  <dt>支持模式</dt>
                  <dd>本地热座 / 在线合作</dd>
                </div>
                <div>
                  <Save size={24} />
                  <dt>节奏定位</dt>
                  <dd>建设、探索、抵御尸潮</dd>
                </div>
              </dl>
            </aside>
          </article>

          <article id="rules-goal" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">02 / 目标</span>
              <h3>游戏目标</h3>
              <p>每位玩家都在争夺胜利点。谁先在自己的回合达到或超过 {VICTORY_POINTS_TO_WIN} 点，谁就赢得这片废土的生存权。</p>
            </div>
            <div className="start-rules-card-grid two">
              <div className="start-rules-card">
                <Crown size={30} />
                <strong>主要得分来源</strong>
                <ul>
                  <li>营地：每个 1 点，堡垒：每个 2 点。</li>
                  <li>最长补给线和最强民兵各价值 2 点。</li>
                  <li>首次在非起始的新资源区建立营地时，额外获得 1 点；每名玩家每个新资源区最多获得一次。</li>
                  <li>秘密据点、商人控制权、卡坦保卫者都能提供额外胜利点。</li>
                </ul>
              </div>
              <div className="start-rules-card">
                <Shield size={30} />
                <strong>胜利不是只靠扩张</strong>
                <ul>
                  <li>尸潮会封锁资源地块，让高产区突然失效。</li>
                  <li>堡垒越多，尸潮围城强度越高。</li>
                  <li>民兵、哨塔、交易和发展卡会决定后期能不能守住优势。</li>
                </ul>
              </div>
            </div>
          </article>

          <article id="rules-turn" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">03 / 每回合</span>
              <h3>回合流程</h3>
              <p>轮到你时，按固定流程行动。多数操作都发生在交易、建造、民兵和发展卡阶段。</p>
            </div>
            <ol className="start-rules-timeline">
              <li><strong>准备阶段</strong><span>重置本回合状态，确认民兵防线、发展卡和车队行动。</span></li>
              <li><strong>掷骰阶段</strong><span>掷两颗六面骰。非 7 点时，对应数字地块为相邻建筑产出资源。</span></li>
              <li><strong>尸潮来袭</strong><span>如果掷出 7，检查弃牌、移动尸潮标志、封锁地块、抽取相邻玩家资源，并推进尸潮围城进度。</span></li>
              <li><strong>交易阶段</strong><span>可以与其他玩家交易，也可以按银行、黑市或商人的比例换资源。</span></li>
              <li><strong>建造阶段</strong><span>支付资源建造运输线、装甲车队、营地、堡垒、哨塔、民兵或发展卡。</span></li>
              <li><strong>行动阶段</strong><span>使用已激活民兵驱逐尸潮，或打出本回合允许使用的发展卡。</span></li>
              <li><strong>检查胜利</strong><span>如果你的胜利点达到 {VICTORY_POINTS_TO_WIN} 点，立即获胜。</span></li>
            </ol>
          </article>

          <article id="rules-resources" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">04 / 补给</span>
              <h3>资源与建造</h3>
              <p>资源来自相邻地块产出。营地拿 1 张，堡垒拿 2 张；尸潮所在的地块不产出。</p>
            </div>
            <div className="start-rules-resource-strip">
              <span>食物：激活民兵、建造营地、升级堡垒</span>
              <span>木材：运输线、营地、哨塔</span>
              <span>金属：运输线、堡垒、民兵、哨塔</span>
              <span>燃料：装甲车队、营地</span>
              <span>弹药：装甲车队、营地、民兵、发展卡</span>
            </div>
            <div className="start-rules-piece-limits" aria-label="每名玩家棋子上限">
              <strong>每名玩家棋子上限</strong>
              <div>
                {PIECE_LIMIT_RULE_ITEMS.map((item) => (
                  <span key={item.label}>
                    {item.label}：{item.value}
                  </span>
                ))}
              </div>
            </div>
            <div className="start-rules-card-grid three">
              <div className="start-rules-card compact">
                <TowerControl size={28} />
                <strong>基础建设</strong>
                <p>运输线：木材×1 + 金属×1。营地：食物×1 + 木材×1 + 燃料×1 + 弹药×1。</p>
              </div>
              <div className="start-rules-card compact">
                <Shield size={28} />
                <strong>防御升级</strong>
                <p>堡垒：食物×2 + 金属×3。哨塔：金属×1 + 木材×1，并让手牌上限 +2。</p>
              </div>
              <div className="start-rules-card compact">
                <Radio size={28} />
                <strong>战术单位</strong>
                <p>装甲车队：弹药×1 + 燃料×1。民兵：金属×1 + 弹药×1，激活民兵需食物×1。</p>
              </div>
            </div>
          </article>

          <article id="rules-horde" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">05 / 威胁</span>
              <h3>尸潮来袭与尸潮围城</h3>
              <p>尸潮来袭是掷出 7 后移动尸潮标志并封锁资源的即时事件；尸潮围城则在尸潮围城进度达到 6 时，按全场堡垒与已激活民兵进行防御结算。</p>
            </div>
            <div className="start-rules-split">
              <div className="start-rules-warning-card">
                <Bug size={34} />
                <strong>尸潮来袭：掷出 7</strong>
                <ul>
                  <li>手牌超过上限的玩家先弃掉一半资源。</li>
                  <li>当前玩家将尸潮标志移动到任意已翻开的地块。</li>
                  <li>尸潮标志所在的地块被占领，骰子命中时也不能产出资源。</li>
                  <li>若该地块相邻其他玩家建筑，当前玩家可以选择其中一名玩家并随机抽取 1 张资源。</li>
                  <li>每次尸潮来袭同时使尸潮围城进度 +1。</li>
                </ul>
              </div>
              <div className="start-rules-warning-card">
                <Shield size={34} />
                <strong>尸潮围城：进度达到 6</strong>
                <ul>
                  <li>掷出 7、探索翻出感染区或使用“尸潮逼近”发展卡，都会使尸潮围城进度 +1。</li>
                  <li>尸潮强度等于全场堡垒总数。</li>
                  <li>全体防御值等于所有已激活民兵数量。</li>
                  <li>防御值不低于尸潮强度则成功；单独贡献最高者获得卡坦保卫者，最高贡献并列者各获得 1 张发展卡。</li>
                  <li>防御值不足则失败；拥有堡垒且已激活民兵最少的玩家，各将 1 座堡垒降级为营地。</li>
                  <li>结算后尸潮围城进度归零，所有民兵变为未激活状态。</li>
                </ul>
              </div>
            </div>
          </article>

          <article id="rules-militia" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">06 / 防线</span>
              <h3>民兵规则</h3>
              <p>民兵是尸潮围城防御值的主要来源，也是能够主动移动和驱逐尸潮的战术单位。征召、激活和主动行动是三个不同步骤。</p>
            </div>
            <div className="start-rules-card-grid two">
              <div className="start-rules-card">
                <Users size={30} />
                <strong>民兵：征召与驻守</strong>
                <ul>
                  <li>征召 1 个民兵需要支付金属 ×1、弹药 ×1；征召完成时为未激活状态。</li>
                  <li>民兵必须驻守在自己的营地或堡垒，每座建筑最多驻守 2 个民兵。</li>
                  <li>未激活民兵不能提供尸潮围城防御值，也不能移动或驱逐尸潮。</li>
                </ul>
              </div>
              <div className="start-rules-card">
                <Radio size={30} />
                <strong>民兵：激活与主动行动</strong>
                <ul>
                  <li>支付食物 ×1 激活 1 个民兵。本回合刚激活的民兵会立即计入围城防御值。</li>
                  <li>刚激活的民兵必须等到自己的下一个回合，才能移动或驱逐尸潮。</li>
                  <li>移动只能沿己方路线前往己方建筑；驱逐要求民兵所在建筑与尸潮地块相邻。</li>
                  <li>民兵完成移动或驱逐后，会重新变为未激活状态。</li>
                </ul>
              </div>
            </div>
            <p className="start-rules-note">关键区别：本回合刚激活的民兵可以立即参与尸潮围城结算，但只有到自己的下一个回合，才能移动或驱逐尸潮。</p>
          </article>

          <article id="rules-fog" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">07 / 未知区域</span>
              <h3>探索与迷雾</h3>
              <p>迷雾模式下，地图不会一开始完全公开。装甲车队是打开未知区域的关键。</p>
            </div>
            <div className="start-rules-card-grid two">
              <div className="start-rules-card">
                <Search size={30} />
                <strong>探索收益</strong>
                <ul>
                  <li>翻出资源地块：立即获得对应资源 1 张。</li>
                  <li>翻出废弃仓库：立即获得任意资源 1 张。</li>
                  <li>普通地块不产出，但能作为车队继续穿越的空间。</li>
                </ul>
              </div>
              <div className="start-rules-card">
                <CloudFog size={30} />
                <strong>探索风险</strong>
                <ul>
                  <li>翻出感染区时，尸潮围城进度 +1。</li>
                  <li>探索者随机弃掉 1 张资源。</li>
                  <li>如果尸潮围城进度因此到达 6，立刻结算尸潮围城。</li>
                </ul>
              </div>
            </div>
          </article>

          <article id="rules-cards" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">08 / 战术</span>
              <h3>交易与发展卡</h3>
              <p>资源管理决定扩张速度。不要只盯着自己产什么，黑市、商人和发展卡都能改变资源结构。</p>
            </div>
            <div className="start-rules-card-grid three">
              <div className="start-rules-card compact">
                <Users size={28} />
                <strong>玩家交易</strong>
                <p>当前玩家可以和其他玩家自愿交易资源，但不能交易发展卡、胜利点牌或棋子。</p>
              </div>
              <div className="start-rules-card compact">
                <Globe2 size={28} />
                <strong>银行与黑市</strong>
                <p>基础银行比例为 4:1；普通黑市为 3:1；专属黑市可以用 2 张指定资源换任意 1 张。</p>
              </div>
              <div className="start-rules-card compact">
                <BookOpen size={28} />
                <strong>发展卡</strong>
                <p>购买费用为食物×1 + 金属×1 + 弹药×1。每回合最多使用 1 张，本回合买的不能立刻使用。</p>
              </div>
            </div>
          </article>

          <article id="rules-victory" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">09 / 结局</span>
              <h3>胜利与失败</h3>
              <p>胜利点达标只是表面目标，真正的考验是：你能不能在尸潮来临时守住已经建好的优势。</p>
            </div>
            <div className="start-rules-callout-row">
              <div>
                <strong>快速获胜路线</strong>
                <p>营地扩张、登陆新资源区、堡垒升级、最长补给线、最强民兵、商人和秘密据点可以组合推进。不要让一种路线被尸潮完全封死。</p>
              </div>
              <div>
                <strong>常见失败原因</strong>
                <p>只升级堡垒却没有民兵；补给线太长但资源单一；手牌爆仓遇到 7；忽视感染区导致围城过早爆发。</p>
              </div>
            </div>
          </article>

          <article id="rules-faq" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">10 / 提醒</span>
              <h3>常见问题</h3>
            </div>
            <div className="start-rules-faq">
              <details open>
                <summary>尸潮在资源地块上，还会产资源吗？</summary>
                <p>不会。尸潮会封锁所在地块，即使骰子点数命中也不产出。</p>
              </details>
              <details>
                <summary>堡垒能抵御尸潮吗？</summary>
                <p>堡垒本身不提供防御值。真正提供防御的是已激活民兵；堡垒越多，反而会提高围城强度。</p>
              </details>
              <details>
                <summary>装甲车队和运输线都算补给线吗？</summary>
                <p>算。最长补给线可以由运输线和装甲车队混合组成。</p>
              </details>
              <details>
                <summary>秘密据点什么时候公开？</summary>
                <p>抽到后保持隐藏；当你在自己的回合达到胜利条件时，可以公开并计入胜利点。</p>
              </details>
            </div>
          </article>
        </section>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="start-settings-screen">
      <header className="start-settings-title start-secondary-title">
        <span aria-hidden="true" />
        <div>
          <strong>
            <h2 id="start-settings-title">设置</h2>
          </strong>
          <p>调整游戏音频设置</p>
        </div>
        <span aria-hidden="true" />
      </header>
      <section className="start-settings-panel start-secondary-frame" aria-labelledby="start-settings-title">
        <AudioSettingsPanel className="start-audio-settings-panel" showActions />
      </section>
      <button className="start-mode-return-button start-settings-return-button" aria-label="返回主菜单" onClick={returnToMain}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>
    </div>
  );

  const renderCredits = () => (
    <div className="start-credits-screen">
      <header className="start-credits-title start-secondary-title">
        <span aria-hidden="true" />
        <div>
          <strong>
            <h2 id="start-credits-title">制作人员</h2>
          </strong>
          <p>废土拓荒终端创作记录</p>
        </div>
        <span aria-hidden="true" />
      </header>

      <section className="start-credits-panel start-secondary-frame" aria-labelledby="start-credits-title">
        <div className="start-credits-grid">
          <article className="start-credit-card">
            <Crown size={34} aria-hidden="true" />
            <span>游戏设计</span>
            <strong>CaptainHicks</strong>
            <p>制定桌游规则、核心体验方向与废土拓荒的整体玩法框架。</p>
          </article>
          <article className="start-credit-card">
            <Palette size={34} aria-hidden="true" />
            <span>美术素材</span>
            <strong>Image2</strong>
            <p>提供开始菜单、界面背景与废土风格相关视觉素材。</p>
          </article>
        </div>
        <p className="start-credits-note">感谢每一位拓荒者。希望镇的灯还亮着，下一局就从这里开始。</p>
      </section>

      <button className="start-mode-return-button start-credits-return-button" aria-label="返回主菜单" onClick={returnToMain}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>
    </div>
  );

  const renderOnlineSteps = (current: OnlineSetupMode | "lobby") => (
    <div className="start-flow-steps" aria-label="在线联机流程">
      {[
        { id: "select", label: "选择信标" },
        { id: current === "join" ? "join" : "create", label: current === "join" ? "查找房间" : "创建房间" },
        { id: "lobby", label: "大厅整备" }
      ].map((step, index) => (
        <span key={`${step.id}-${index}`} className={step.id === current ? "active" : ""}>
          {step.label}
        </span>
      ))}
    </div>
  );

  const renderOnlineSetup = () => {
    const onlineBusy = online?.busy ?? false;

    if (onlineSetupMode === "select") {
      return (
        <div className="start-online-entry-screen">
          <header className="start-online-entry-title start-secondary-title">
            <span aria-hidden="true" />
            <div>
              <h2>在线游玩</h2>
              <p>与远方玩家一起，在废土世界中求生拓荒</p>
            </div>
            <span aria-hidden="true" />
          </header>
          {renderErrorBanner()}

          <div className="start-online-dual-panel start-online-entry-layout start-secondary-frame">
            <section className="start-online-room-card start-online-create-card">
              <div className="start-online-card-heading">
                <Users size={34} />
                <div>
                  <h3>创建房间</h3>
                  <p>创建自己的游戏房间，邀请好友一起游玩</p>
                </div>
              </div>

              <label className="start-online-field">
                <span>1. 房主昵称</span>
                <div className="start-online-input-line">
                  <input
                    aria-label="在线玩家名称"
                    value={onlineHostName}
                    onChange={(event) => setOnlineHostName(event.target.value)}
                    maxLength={16}
                    placeholder="请输入房主昵称（2 到 16 个字符）"
                  />
                  <Dices size={20} aria-hidden="true" />
                </div>
              </label>

              <div className="start-online-field">
                <span>2. 选择游戏人数</span>
                <small>选择本局游戏的玩家人数</small>
                <div className="start-online-count-buttons" role="radiogroup" aria-label="在线房间人数">
                  {[2, 3, 4, 5, 6].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={onlineTargetCount === value ? "active" : ""}
                      aria-pressed={onlineTargetCount === value}
                      onClick={() => {
                        setOnlineTargetCount(value);
                        setOnlineAiCount((current) => Math.min(current, value - 1));
                      }}
                    >
                      <User size={17} />
                      <span>{value} 人</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="start-online-field start-online-options">
                <span>3. 游戏选项</span>
                <label className="start-online-ai-count">
                  <Bot size={20} aria-hidden="true" />
                  <span>
                    <strong>AI 玩家</strong>
                    <small>AI 将在服务器后台自动行动</small>
                  </span>
                  <select aria-label="在线 AI 玩家数量" value={onlineAiCount} onChange={(event) => setOnlineAiCount(Number(event.target.value))}>
                    {Array.from({ length: onlineTargetCount }, (_, value) => (
                      <option key={value} value={value}>{value} 名</option>
                    ))}
                  </select>
                </label>
                <label className={onlineFogEnabled ? "start-option-toggle start-fog-toggle active" : "start-option-toggle start-fog-toggle"}>
                  <input type="checkbox" checked={onlineFogEnabled} onChange={(event) => setOnlineFogEnabled(event.target.checked)} />
                  <CloudFog size={20} />
                  <span>
                    <strong>迷雾探索模式</strong>
                    <small>隐藏地图信息，探索未知区域</small>
                  </span>
                  <b>{onlineFogEnabled ? "开" : "关"}</b>
                </label>

                <label className={debugMode ? "start-option-toggle start-debug-toggle active" : "start-option-toggle start-debug-toggle"}>
                  <input type="checkbox" checked={debugMode} onChange={(event) => setDebugMode(event.target.checked)} />
                  <Bug size={20} />
                  <span>
                    <strong>调试模式</strong>
                    <small>开启后可获得额外资源和调试功能</small>
                  </span>
                  <b>{debugMode ? "开" : "关"}</b>
                </label>
              </div>

              <button
                className="start-confirm-button start-online-submit-button"
                aria-label="创建在线房间"
                disabled={onlineBusy || !online || !normalizedOnlineHostName}
                onClick={() =>
                  online?.onCreateRoom({
                    name: normalizedOnlineHostName,
                    targetPlayerCount: onlineTargetCount,
                    aiPlayerCount: onlineAiCount,
                    fogEnabled: onlineFogEnabled
                  })
                }
              >
                <Wifi size={20} />
                创建房间
              </button>
            </section>

            <section className="start-online-room-card start-online-join-card">
              <div className="start-online-card-heading">
                <DoorOpen size={34} />
                <div>
                  <h3>加入房间</h3>
                  <p>加入其他玩家创建的房间，与他们并肩作战</p>
                </div>
              </div>

              <label className="start-online-field">
                <span>1. 玩家昵称</span>
                <div className="start-online-input-line">
                  <input
                    aria-label="在线加入玩家名称"
                    value={onlineJoinName}
                    onChange={(event) => setOnlineJoinName(event.target.value)}
                    maxLength={16}
                    placeholder="请输入你的昵称（2 到 16 个字符）"
                  />
                  <Dices size={20} aria-hidden="true" />
                </div>
              </label>

              <div className="start-online-field">
                <span>2. 输入房间码</span>
                <small>请输入 6 位房间码</small>
                <input
                  className="sr-only"
                  aria-label="在线房间码"
                  value={joinRoomCode}
                  onChange={(event) => setNormalizedJoinRoomCode(event.target.value)}
                />
                <div className="start-room-code-boxes">
                  {Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => (
                    <input
                      key={index}
                      ref={(node) => {
                        joinRoomCodeInputRefs.current[index] = node;
                      }}
                      aria-label={`房间码第 ${index + 1} 位`}
                      value={normalizedJoinRoomCode[index] ?? ""}
                      maxLength={1}
                      onFocus={() => handleJoinRoomCodeFocus(index)}
                      onKeyDown={(event) => handleJoinRoomCodeKeyDown(index, event)}
                      onChange={(event) => updateJoinRoomCodeAt(index, event.target.value)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.readText().then(setNormalizedJoinRoomCode)}
                  >
                    <Copy size={17} />
                    粘贴
                  </button>
                </div>
              </div>

              <div className="start-online-help-card">
                <Search size={22} />
                <div>
                  <strong>如何获取房间码？</strong>
                  <span>请向房主或其他玩家索要 6 位房间码</span>
                </div>
              </div>

              <button
                className="start-confirm-button start-online-submit-button"
                aria-label="加入在线房间"
                disabled={onlineBusy || !online || normalizedJoinRoomCode.length !== ROOM_CODE_LENGTH || !normalizedOnlineJoinName}
                onClick={() =>
                  online?.onJoinRoom({
                    roomCode: normalizedJoinRoomCode,
                    name: normalizedOnlineJoinName
                  })
                }
              >
                <DoorOpen size={20} />
                加入房间
              </button>
            </section>
          </div>

          <button className="start-mode-return-button start-online-return-button" onClick={() => setView("mode")}>
            <ArrowLeft size={18} />
            返回
          </button>
        </div>
      );
    }

    return (
      <div className="start-menu-panel start-setup-panel start-online-panel">
        {onlineSetupMode === "create" ? (
          <>
            <div className="start-panel-heading">
              <span>建立信标</span>
              <h2>创建一间私有据点</h2>
              <p>先留下你的呼号。房间建立后，你会进入大厅，再和其他玩家一起选择阵营。</p>
            </div>
            {renderOnlineSteps("create")}
            {renderErrorBanner()}

            <label className="start-field">
              <span>房主呼号</span>
              <input
                aria-label="在线玩家名称"
                value={onlineHostName}
                onChange={(event) => setOnlineHostName(event.target.value)}
                placeholder="例如：北门指挥"
              />
            </label>

            <div className="start-option-grid">
              <label className="start-field start-count-field">
                <span>房间席位</span>
                <select
                  aria-label="在线房间人数"
                  value={onlineTargetCount}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setOnlineTargetCount(value);
                    setOnlineAiCount((current) => Math.min(current, value - 1));
                  }}
                >
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
                  <strong>迷雾开局</strong>
                  <small>{onlineFogEnabled ? "未知地块需要逐步侦察" : "全部地块开局可见"}</small>
                </span>
              </label>
              <label className="start-online-ai-count">
                <Bot size={20} aria-hidden="true" />
                <span>
                  <strong>AI 玩家</strong>
                  <small>由服务器后台托管</small>
                </span>
                <select aria-label="在线创建 AI 玩家数量" value={onlineAiCount} onChange={(event) => setOnlineAiCount(Number(event.target.value))}>
                  {Array.from({ length: onlineTargetCount }, (_, value) => (
                    <option key={value} value={value}>{value} 名</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="start-transmission-card">
              <Radio size={18} />
              <div>
                <strong>创建后流程</strong>
                <span>生成房间码 → 邀请队友 → 大厅选阵营 → 房主启动游戏</span>
              </div>
            </div>

            <div className="start-panel-actions">
              <button className="start-back-button" onClick={() => setOnlineSetupMode("select")}>
                <ArrowLeft size={18} />
                返回在线联机
              </button>
              <button
                className="start-confirm-button"
                aria-label="创建在线房间"
                disabled={onlineBusy || !online || !normalizedOnlineHostName}
                onClick={() =>
                  online?.onCreateRoom({
                    name: normalizedOnlineHostName,
                    targetPlayerCount: onlineTargetCount,
                    aiPlayerCount: onlineAiCount,
                    fogEnabled: onlineFogEnabled
                  })
                }
              >
                <Wifi size={18} />
                架设在线房间
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="start-panel-heading">
              <span>查找房间</span>
              <h2>接入已有房间</h2>
              <p>输入房主给你的房间码。连接成功后，会进入同一个大厅选择阵营。</p>
            </div>
            {renderOnlineSteps("join")}
            {renderErrorBanner()}

            <label className="start-field">
              <span>你的呼号</span>
              <input
                aria-label="在线加入玩家名称"
                value={onlineJoinName}
                onChange={(event) => setOnlineJoinName(event.target.value)}
                placeholder="例如：补给车队"
              />
            </label>
            <label className="start-field start-room-code-field">
              <span>房间码</span>
              <input
                aria-label="在线房间码"
                value={joinRoomCode}
                onChange={(event) => setJoinRoomCode(normalizeRoomCode(event.target.value))}
                placeholder="例如 ROOM42"
              />
            </label>
            <div className="start-transmission-card">
              <Search size={18} />
              <div>
                <strong>{normalizedJoinRoomCode ? `目标房间 ${normalizedJoinRoomCode}` : "等待房间信标"}</strong>
                <span>{normalizedOnlineJoinName ? "呼号已记录，可以尝试接入。" : "先填写你的呼号，方便大厅识别。"}</span>
              </div>
            </div>
            <div className="start-panel-actions">
              <button className="start-back-button" onClick={() => setOnlineSetupMode("select")}>
                <ArrowLeft size={18} />
                返回在线联机
              </button>
              <button
                className="start-confirm-button"
                aria-label="加入在线房间"
                disabled={onlineBusy || !online || !normalizedJoinRoomCode || !normalizedOnlineJoinName}
                onClick={() =>
                  online?.onJoinRoom({
                    roomCode: normalizedJoinRoomCode,
                    name: normalizedOnlineJoinName
                  })
                }
              >
                <DoorOpen size={18} />
                接入房间大厅
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderOnlineLobby = () => {
    if (!online?.lobbyView) return renderOnlineSetup();
    const { lobbyView } = online;
    const viewerSeat = lobbyView.seats.find((seat) => seat.playerId === lobbyView.viewerPlayerId);
    const occupiedFactionIds = new Set(
      lobbyView.seats
        .filter((seat) => seat.playerId !== lobbyView.viewerPlayerId)
        .map((seat) => seat.factionId)
        .filter((factionId): factionId is string => Boolean(factionId))
    );
    const currentFactionId = viewerSeat?.factionId ?? "";
    const seatSlots = Array.from({ length: lobbyView.roomMeta.targetPlayerCount }, (_, index) => lobbyView.seats[index]);
    const filledSeats = lobbyView.seats.length;
    const isHost = lobbyView.viewerPlayerId === lobbyView.roomMeta.hostPlayerId;
    const hostSeat = lobbyView.seats.find((seat) => seat.playerId === lobbyView.roomMeta.hostPlayerId);
    const chatMessages = lobbyView.chatMessages.length > 0
      ? lobbyView.chatMessages
      : [{
          id: "empty-lobby",
          kind: "system" as const,
          text: "房间已创建，等待玩家加入。",
          createdAt: lobbyView.roomMeta.connectedPlayerIds.length
        }];
    const sendLobbyChatMessage = () => {
      const text = normalizedLobbyChatDraft;
      if (!text || online.busy) return;
      void Promise.resolve(online.onSendChatMessage({ roomCode: lobbyView.roomMeta.roomCode, text }))
        .then((result) => {
          if (isFailedOnlineActionResult(result)) return;
          setLobbyChatDraft("");
        });
    };
    const handleLobbyChatKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
      event.preventDefault();
      sendLobbyChatMessage();
    };

    return (
      <div className="start-lobby-screen">
        <header className="start-lobby-title start-secondary-title">
          <span aria-hidden="true" />
          <div>
            <h2>房间大厅</h2>
            <p>与伙伴并肩作战，在废土中求生拓荒</p>
          </div>
          <span aria-hidden="true" />
        </header>

        <aside className="start-lobby-code-card">
          <span>房间码</span>
          <strong>{lobbyView.roomMeta.roomCode}</strong>
          <button
            type="button"
            aria-label={`复制房间码 ${lobbyView.roomMeta.roomCode}`}
            onClick={() => navigator.clipboard?.writeText(lobbyView.roomMeta.roomCode)}
          >
            复制房间码
          </button>
        </aside>

        {renderErrorBanner()}

        <div className="start-lobby-layout start-secondary-frame">
          <aside className="start-lobby-settings-card">
            <h3>房间设置</h3>
            <dl>
              <div>
                <dt>
                  <User size={19} />
                  房间名称
                </dt>
                <dd>一起拓荒吧！</dd>
              </div>
              <div>
                <dt>
                  <Crown size={19} />
                  房主
                </dt>
                <dd>{hostSeat?.name ?? "等待房主"}</dd>
              </div>
              <div>
                <dt>
                  <Users size={19} />
                  玩家人数
                </dt>
                <dd>
                  {filledSeats}/{lobbyView.roomMeta.targetPlayerCount}
                </dd>
              </div>
              <div>
                <dt>
                  <CloudFog size={19} />
                  迷雾探索模式
                </dt>
                <dd>{lobbyView.roomMeta.fogEnabled ? "开启" : "关闭"}</dd>
              </div>
              <div>
                <dt>
                  <Bug size={19} />
                  调试模式
                </dt>
                <dd>关闭</dd>
              </div>
            </dl>
            <button type="button" className="start-lobby-edit-button">
              <Settings size={19} />
              编辑设置
            </button>
            <button
              className="start-confirm-button start-lobby-start-button"
              aria-label="房主开始游戏"
              disabled={!lobbyView.canStart || online.busy}
              onClick={online.onStartRoom}
            >
              <Play size={20} />
              开始游戏
            </button>
            <p>{isHost ? "房主可在所有人准备后开始游戏" : "等待房主在所有人准备后开始游戏"}</p>
          </aside>

          <section className="start-lobby-players-card">
            <h3>
              玩家列表
              <span>
                ({filledSeats}/{lobbyView.roomMeta.targetPlayerCount})
              </span>
            </h3>
            <div className="start-lobby-player-list" aria-label="在线房间席位">
              {seatSlots.map((seat, index) => {
                const faction = findFactionById(seat?.factionId);
                const isSeatHost = seat?.playerId === lobbyView.roomMeta.hostPlayerId;
                return seat ? (
                  <article
                    key={seat.playerId}
                    className={seat.playerId === lobbyView.viewerPlayerId ? "start-lobby-player-row self" : "start-lobby-player-row"}
                    style={{ "--player-color": seat.color } as CSSProperties}
                  >
                    <span className="start-lobby-player-avatar">
                      {faction ? <img src={faction.portrait} alt="" aria-hidden="true" /> : seat.controller === "ai" ? <Bot size={21} aria-hidden="true" /> : <User size={21} aria-hidden="true" />}
                    </span>
                    <div>
                      <strong>
                        {seat.name}
                        {isSeatHost ? "（房主）" : ""}
                        {seat.controller === "ai" ? "（AI）" : ""}
                      </strong>
                      <small>{faction?.name ?? "未选择阵营"}</small>
                    </div>
                    <em className={faction ? "ready" : "pending"}>{faction ? "已准备" : "未准备"}</em>
                    <span className="start-lobby-faction-badge">
                      {faction ? <img src={faction.portrait} alt="" aria-hidden="true" /> : <User size={18} aria-hidden="true" />}
                    </span>
                  </article>
                ) : (
                  <article key={`empty-${index}`} className="start-lobby-player-row empty">
                    <span className="start-lobby-player-avatar">
                      <WifiOff size={21} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>等待玩家接入</strong>
                      <small>分享房间码后，伙伴会出现在这里。</small>
                    </div>
                    <em className="pending">空位</em>
                    <span className="start-lobby-faction-badge">
                      <UserPlus size={18} aria-hidden="true" />
                    </span>
                  </article>
                );
              })}
            </div>
            <button type="button" className="start-lobby-invite-button">
              <UserPlus size={20} />
              邀请好友
            </button>
            <div className="start-lobby-chat-log" aria-label="房间聊天记录" ref={lobbyChatLogRef}>
              {chatMessages.map((message) => (
                <p
                  key={message.id}
                  className={message.kind === "player" ? "start-lobby-chat-message player" : "start-lobby-chat-message system"}
                >
                  {message.kind === "player" ? (
                    <>
                      <strong>{message.playerName ?? "玩家"}</strong>
                      <span>{message.text}</span>
                    </>
                  ) : (
                    <span>【系统】{message.text}</span>
                  )}
                </p>
              ))}
            </div>
            <div className="start-lobby-chat-input">
              <input
                aria-label="房间聊天内容"
                placeholder="点击输入聊天内容…"
                maxLength={160}
                value={lobbyChatDraft}
                onChange={(event) => setLobbyChatDraft(event.target.value)}
                onKeyDown={handleLobbyChatKeyDown}
              />
              <Smile size={20} aria-hidden="true" />
              <button type="button" disabled={!normalizedLobbyChatDraft || online.busy} onClick={sendLobbyChatMessage}>
                发送
              </button>
            </div>
          </section>

          <section className="start-lobby-factions-card">
            <h3>选择阵营</h3>
            <p>点击阵营旗帜进行选择</p>
            <select
              className="sr-only"
              aria-label="在线大厅阵营"
              value={currentFactionId}
              onChange={(event) =>
                void online.onChooseFaction({
                  roomCode: lobbyView.roomMeta.roomCode,
                  factionId: event.target.value || undefined
                })
              }
            >
              <option value="">暂不选择</option>
              {PLAYER_FACTIONS.map((faction) => (
                <option key={faction.id} value={faction.id} disabled={occupiedFactionIds.has(faction.id)}>
                  {faction.name}
                  {occupiedFactionIds.has(faction.id) ? "（已被别人选择）" : ""}
                </option>
              ))}
            </select>
            <div className="start-lobby-faction-grid">
              {PLAYER_FACTIONS.map((faction) => {
                const isOccupied = occupiedFactionIds.has(faction.id);
                const isSelected = currentFactionId === faction.id;
                return (
                  <button
                    key={faction.id}
                    type="button"
                    className={[
                      "start-lobby-faction-card",
                      isSelected ? "selected" : "",
                      isOccupied ? "occupied" : ""
                    ].filter(Boolean).join(" ")}
                    disabled={isOccupied}
                    style={{ "--player-color": faction.color } as CSSProperties}
                    aria-label={`选择阵营 ${faction.name}`}
                    onClick={() =>
                      void online.onChooseFaction({
                        roomCode: lobbyView.roomMeta.roomCode,
                        factionId: isSelected ? undefined : faction.id
                      })
                    }
                  >
                    <span className="start-lobby-faction-mark" aria-hidden="true" />
                    <img src={faction.portrait} alt="" aria-hidden="true" />
                    <strong>{faction.name}</strong>
                    <small>{FACTION_FLAVOR[faction.id]}</small>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {lobbyView.startBlockedReason && (
          <p className="start-lobby-warning">
            <Shield size={16} aria-hidden="true" />
            {lobbyView.startBlockedReason}
          </p>
        )}

        <button className="start-mode-return-button start-lobby-return-button" aria-label="离开房间" onClick={online.onLeaveRoom}>
          <ArrowLeft size={18} />
          返回
        </button>
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
    <main className={["start-screen", "start-screen-ambient", "start-screen-strong-vignette"].join(" ")}>
      <div className="start-stage" style={stageStyle}>
        {view === "main" && !online?.lobbyView ? (
          <div className="start-logo-lockup">
            <img src="/assets/menu/title-logo.v1.webp" alt="尸潮卡坦：废土拓荒" />
          </div>
        ) : null}
        <div className="start-world-intel" aria-hidden="true">
          <span>希望镇坐标已锁定</span>
          <span>落日前完成集结</span>
          <span>幸存者频道待命</span>
        </div>
        <section
          className={[
            "start-menu-region",
            view === "main" && !online?.lobbyView ? "" : "start-menu-region-panel",
            view === "mode" && !online?.lobbyView ? "start-menu-region-mode" : "",
            view === "setup" && !online?.lobbyView ? "start-menu-region-setup" : "",
            view === "rules" && !online?.lobbyView ? "start-menu-region-rules" : "",
            view === "settings" && !online?.lobbyView ? "start-menu-region-settings" : "",
            view === "credits" && !online?.lobbyView ? "start-menu-region-credits" : "",
            view === "onlineSetup" && !online?.lobbyView ? "start-menu-region-online" : "",
            online?.lobbyView ? "start-menu-region-lobby" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {renderActivePanel()}
        </section>
        {view === "main" && !online?.lobbyView ? <p className="start-version">版本号：1.0.0</p> : null}
      </div>
    </main>
  );
}
