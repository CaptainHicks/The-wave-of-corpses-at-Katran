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
  Info,
  Lock,
  Map as MapIcon,
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
import {
  BASE_HAND_LIMIT,
  COSTS,
  DEV_CARD_COUNTS,
  DEV_CARD_LABELS,
  PIECE_LIMITS,
  PLAYER_FACTIONS,
  RESOURCE_LABELS,
  TILE_LABELS,
  VICTORY_POINTS_TO_WIN,
  WATCHTOWER_HAND_BONUS,
  ZOMBIE_TRACK_LIMIT
} from "../domain/constants";
import { BOARD_STRUCTURE_OPTIONS } from "../domain/board";
import type { Command, DevCardType, Resource, TileType } from "../domain/types";
import type {
  LobbyView,
  RoomChatRequest,
  RoomChooseFactionRequest,
  RoomCreateRequest,
  RoomJoinRequest
} from "../online/protocol";
import { AudioSettingsPanel } from "./audio/AudioSettingsPanel";
import {
  boardMarkerAssets,
  devCardAssets,
  getBuildingPieceAsset,
  getRoutePieceAsset,
  resourceCardAssets,
  tileAssets
} from "./art/assetManifest";
import { preloadGameArtAssets, warmImageAssetsWhenIdle } from "./art/preloadGameAssets";

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

const EMPTY_LOCAL_NAMES = PLAYER_FACTIONS.map((_, index) => `玩家${index + 1}`);
const EMPTY_LOCAL_FACTION_IDS = PLAYER_FACTIONS.map(() => "");
const DEFAULT_LOCAL_CONTROLLERS = PLAYER_FACTIONS.map((_, index) => (index === 0 ? "human" : "ai") as "human" | "ai");
const ROOM_CODE_LENGTH = 6;
const START_STAGE_WIDTH = 1672;
const START_STAGE_HEIGHT = 941;
const START_MENU_BUTTON_ASSETS = {
  start: "/assets/menu/menu-start-game.v1.webp",
  continue: "/assets/menu/menu-continue-game.v1.webp",
  rules: "/assets/menu/menu-rules.v1.webp",
  settings: "/assets/menu/menu-settings.v1.webp",
  credits: "/assets/menu/menu-credits.v1.webp"
} as const;

// 首屏不直接显示、但导航到二级面板会用到的菜单配图，空闲时低优先级预热。
const START_MENU_SECONDARY_ASSETS = [
  "/assets/menu/mode-local-hotseat.v1.webp",
  "/assets/menu/mode-online-play.v1.webp",
  "/assets/menu/create-room-help.v1.webp"
];
const ONLINE_PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6] as const;
const ONLINE_AI_COUNT_OPTIONS = [0, 1, 2, 3, 4] as const;
const RANDOM_BOARD_STRUCTURE_OPTION = {
  id: "",
  label: "随机地图",
  description: "每局自动抽取一种废土结构。"
} as const;

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
  { id: "rules-goal", label: "胜利与计分" },
  { id: "rules-components", label: "棋盘与组件" },
  { id: "rules-setup", label: "开局摆放" },
  { id: "rules-turn", label: "回合流程" },
  { id: "rules-resources", label: "资源与建造" },
  { id: "rules-cards", label: "交易与发展卡" },
  { id: "rules-horde", label: "尸潮来袭与围城" },
  { id: "rules-militia", label: "民兵规则" },
  { id: "rules-fog", label: "探索与迷雾" },
  { id: "rules-faq", label: "常见问题" }
] as const;

type RuleSectionId = (typeof RULE_SECTIONS)[number]["id"];

const RESOURCE_GUIDE_ITEMS: Array<{ type: Resource; uses: string }> = [
  { type: "food", uses: "激活民兵、建造营地、升级堡垒，也是空投和仓库常会优先补的生存资源。" },
  { type: "wood", uses: "建造运输线、营地和哨塔。前期开路、补足距离规则时很关键。" },
  { type: "metal", uses: "建造运输线、升级堡垒、征召民兵、建造哨塔、购买发展卡。" },
  { type: "fuel", uses: "建造装甲车队和营地。迷雾局里，燃料决定探索速度。" },
  { type: "ammo", uses: "建造装甲车队、营地、征召民兵、购买发展卡。扩张和防守都会消耗。" }
];

const TILE_GUIDE_ITEMS: Array<{ type: TileType | "fog"; label: string; output: string; detail: string }> = [
  { type: "farm", label: TILE_LABELS.farm, output: "产出食物", detail: "画面是荒废农田。骰子命中地块数字时，相邻营地拿 1 张食物，堡垒拿 2 张。" },
  { type: "forest", label: TILE_LABELS.forest, output: "产出木材", detail: "画面是枯林。木材主要用于运输线、营地和哨塔，前期很容易短缺。" },
  { type: "factory", label: TILE_LABELS.factory, output: "产出金属", detail: "画面是旧工厂。金属用于堡垒、民兵、运输线、哨塔和发展卡，是防线资源。" },
  { type: "city", label: TILE_LABELS.city, output: "产出燃料", detail: "画面是废墟城区。燃料用于营地和装甲车队，想探索迷雾就要留意它。" },
  { type: "military", label: TILE_LABELS.military, output: "产出弹药", detail: "画面是军事营地。弹药用于营地、装甲车队、民兵和发展卡，兼顾扩张与战术。" },
  { type: "warehouse", label: TILE_LABELS.warehouse, output: "产出任意资源", detail: "画面像被遗弃的补给仓库。触发时可自选资源；堡垒拿 2 张时可以选相同或不同资源。" },
  { type: "infected", label: TILE_LABELS.infected, output: "不产资源", detail: "画面是绿色感染区。它没有数字，常作为尸潮和商人的初始位置；探索翻出时推进尸潮围城进度。" },
  { type: "empty", label: TILE_LABELS.empty, output: "不产资源", detail: "画面是荒地。它用于隔开资源区，运输线通常不能沿纯荒地扩张，装甲车队更适合穿越这些区域。" },
  { type: "fog", label: "迷雾地块", output: "未公开", detail: "灰雾覆盖的未知区域。路线触达迷雾时会翻开周围地块；装甲车队最适合继续穿越空地、推进未知区域。" }
];

const SAMPLE_PLAYER = { playerId: "p2", factionId: "blue-steel", color: "#2b78d4" };
const PIECE_GUIDE_ITEMS = [
  {
    label: "营地",
    imageUrl: getBuildingPieceAsset({ ...SAMPLE_PLAYER, buildingType: "camp", hasWatchtower: false, militiaCount: 0 }),
    fallback: "营",
    limit: `${PIECE_LIMITS.camps} 个`,
    detail: `建在交叉点上，价值 1 点。相邻数字地块产出时拿 1 张资源；新建营地必须连接自己的路线，并与其他建筑至少隔 1 个空交叉点。费用：食物×${COSTS.camp.food}、木材×${COSTS.camp.wood}、燃料×${COSTS.camp.fuel}、弹药×${COSTS.camp.ammo}。`
  },
  {
    label: "堡垒",
    imageUrl: getBuildingPieceAsset({ ...SAMPLE_PLAYER, buildingType: "fortress", hasWatchtower: false, militiaCount: 0 }),
    fallback: "堡",
    limit: `${PIECE_LIMITS.fortresses} 个`,
    detail: `由自己的营地升级而来，价值 2 点。相邻地块产出时拿 2 张资源，但全场堡垒越多，尸潮围城强度越高。费用：食物×${COSTS.fortress.food}、金属×${COSTS.fortress.metal}。`
  },
  {
    label: "运输线",
    imageUrl: getRoutePieceAsset({ ...SAMPLE_PLAYER, routeType: "transport" }),
    fallback: "线",
    limit: `${PIECE_LIMITS.transports} 条`,
    detail: `铺在两个交叉点之间的边上，用来连接营地和扩张网络。运输线只能放在资源地块边缘，必须接到自己的网络。费用：木材×${COSTS.transport.wood}、金属×${COSTS.transport.metal}。`
  },
  {
    label: "装甲车队",
    imageUrl: getRoutePieceAsset({ ...SAMPLE_PLAYER, routeType: "convoy" }),
    fallback: "车",
    limit: `${PIECE_LIMITS.convoys} 个`,
    detail: `外观是车辆路线棋子。它可以铺在有效地块边缘，并负责探索迷雾；每回合最多移动 1 个路线末端的开放装甲车队。费用：弹药×${COSTS.convoy.ammo}、燃料×${COSTS.convoy.fuel}。`
  },
  {
    label: "哨塔",
    imageUrl: getBuildingPieceAsset({ ...SAMPLE_PLAYER, buildingType: "camp", hasWatchtower: true, militiaCount: 0 }),
    fallback: "塔",
    limit: `${PIECE_LIMITS.watchtowers} 个`,
    detail: `显示为建筑旁的塔楼。只能建在自己的营地或堡垒旁，让该玩家手牌上限 +${WATCHTOWER_HAND_BONUS}；多个哨塔能叠加。费用：金属×${COSTS.watchtower.metal}、木材×${COSTS.watchtower.wood}。`
  },
  {
    label: "民兵",
    imageUrl: "/assets/hud/militia.v1.webp",
    fallback: "兵",
    limit: `${PIECE_LIMITS.militia} 个`,
    detail: `民兵驻守在自己的营地或堡垒上，每座建筑最多 2 个。未激活不提供防御；支付食物×${COSTS.activateMilitia.food} 激活后参与围城防御，下一回合起可移动或驱逐尸潮。征召费用：金属×${COSTS.militia.metal}、弹药×${COSTS.militia.ammo}。`
  }
] as const;

const MARKER_GUIDE_ITEMS = [
  {
    label: "数字标记",
    imageUrl: "/assets/board/numbers/8.v1.webp",
    fallback: "8",
    detail: "放在资源地块上，表示掷出该点数时触发产出。7 不会作为地块数字出现，掷出 7 会触发尸潮来袭。"
  },
  {
    label: "尸潮标记",
    imageUrl: boardMarkerAssets.zombieHorde,
    fallback: "尸",
    detail: "显示尸潮当前位置。它所在地块被封锁，不能产资源；掷出 7 时当前玩家会移动它，并可能抽取相邻对手 1 张资源。"
  },
  {
    label: "商人标记",
    imageUrl: boardMarkerAssets.merchant,
    fallback: "商",
    detail: "发展卡“商人”会移动这个标记。控制商人的玩家获得 1 点胜利点，并可围绕商人所在地块享受 2:1 贸易；若尸潮压在商人地块上，贸易能力会失效。"
  },
  {
    label: "黑市标记",
    imageUrl: boardMarkerAssets.blackMarket,
    fallback: "市",
    detail: "出现在部分边上。相邻有己方建筑时提供贸易能力：普通黑市 3:1，指定资源黑市 2:1。"
  },
  {
    label: "民兵状态标记",
    imageUrl: boardMarkerAssets.militiaCountMarkers.active,
    fallback: "闪",
    detail: "绿色头像表示已激活民兵，黄色头像表示未激活或待命。只有已激活民兵会计入尸潮围城防御值。"
  }
] as const;

const DEV_CARD_GUIDE_ITEMS: Array<{ type: DevCardType; effect: string; example: string }> = [
  { type: "militiaMobilization", effect: "免费征召最多 2 名民兵，仍然必须放到自己的营地或堡垒，且每座建筑最多 2 名民兵。", example: "例：你有两个空营地，可各放 1 名；若只有一个建筑空 1 个位置，就只能放 1 名。" },
  { type: "roadCrew", effect: "免费建造最多 2 条合法路线，可以选择运输线或装甲车队；路线仍需连接自己的网络并满足地形规则。", example: "例：你用 1 条运输线接上资源区，再用 1 个装甲车队朝迷雾边缘推进。" },
  { type: "airdrop", effect: "立即自选 2 张资源。", example: "例：差 1 金属和 1 弹药征召民兵时，可以直接选这两张补齐防线。" },
  { type: "requisition", effect: "选择 1 种资源，拿走所有其他玩家手中的该资源。", example: "例：你选择金属，所有对手的金属归零，并全部加入你的资源区。" },
  { type: "merchant", effect: "把商人移动到一个已翻开的资源地块，且该地块必须相邻你的建筑。你获得商人控制权、1 点胜利点和对应 2:1 贸易能力。", example: "例：商人在燃料地块上，你可用 2 张燃料换任意 1 张资源；仓库上的商人可让你用任意同类资源做 2:1。" },
  { type: "secretBase", effect: "秘密胜利点牌，不能主动打出。达到胜利条件时自动公开并计分。", example: "例：面板显示你 11 点，手里有 1 张秘密据点；到你的回合检查胜利时会公开到 12 点。" },
  { type: "zombieApproaches", effect: "尸潮围城进度 +1，然后自选 1 张资源。若进度达到上限，立刻结算围城。", example: `例：当前围城进度是 ${ZOMBIE_TRACK_LIMIT - 1}，打出后会升到 ${ZOMBIE_TRACK_LIMIT} 并马上检查全场防御。` }
];

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
  const [boardStructureId, setBoardStructureId] = useState("");
  const [onlineHostName, setOnlineHostName] = useState<string>("");
  const [onlineJoinName, setOnlineJoinName] = useState<string>("");
  const [onlineTargetCount, setOnlineTargetCount] = useState(2);
  const [onlineAiCount, setOnlineAiCount] = useState(0);
  const [onlineFogEnabled, setOnlineFogEnabled] = useState(false);
  const [onlineBoardStructureId, setOnlineBoardStructureId] = useState("");
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
  const onlineHostNameIsValid = normalizedOnlineHostName.length >= 2 && normalizedOnlineHostName.length <= 16;
  const onlineHumanPlayerCount = Math.max(1, onlineTargetCount - onlineAiCount);
  const selectedOnlineBoardOption =
    BOARD_STRUCTURE_OPTIONS.find((option) => option.id === onlineBoardStructureId) ?? RANDOM_BOARD_STRUCTURE_OPTION;
  const onlineCreateSummary = `${onlineTargetCount}人局 / AI ${onlineAiCount}名 / ${selectedOnlineBoardOption.label} / 迷雾${
    onlineFogEnabled ? "开启" : "关闭"
  } / 调试${debugMode ? "开启" : "关闭"}`;
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
    warmImageAssetsWhenIdle(START_MENU_SECONDARY_ASSETS);
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
      debugMode,
      boardStructureId: boardStructureId || undefined
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

  const renderBoardStructureSelect = (
    value: string,
    onChange: (nextValue: string) => void,
    label: string,
    ariaLabel: string,
    showDescription = true
  ) => {
    const selectedOption =
      [RANDOM_BOARD_STRUCTURE_OPTION, ...BOARD_STRUCTURE_OPTIONS].find((option) => option.id === value) ??
      RANDOM_BOARD_STRUCTURE_OPTION;

    return (
      <label className="start-map-select-field">
        <span>{label}</span>
        <div>
          <MapIcon size={20} aria-hidden="true" />
          <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
            <option value={RANDOM_BOARD_STRUCTURE_OPTION.id}>{RANDOM_BOARD_STRUCTURE_OPTION.label}</option>
            {BOARD_STRUCTURE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {showDescription && <small>{selectedOption.description}</small>}
      </label>
    );
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
        <img src={START_MENU_BUTTON_ASSETS.start} alt="" draggable={false} />
      </button>
      <button className="start-menu-button" aria-label="继续游戏" disabled={!hasSavedGame} onClick={onContinue}>
        <img src={START_MENU_BUTTON_ASSETS.continue} alt="" draggable={false} />
      </button>
      {hasSavedGame && savedGameSummary && (
        <p className="start-save-summary">
          上次停在第 {savedGameSummary.turn} 回合，当前指挥官：{savedGameSummary.currentPlayerName}
        </p>
      )}
      <button className="start-menu-button" aria-label="规则说明" onClick={() => setView("rules")}>
        <img src={START_MENU_BUTTON_ASSETS.rules} alt="" draggable={false} />
      </button>
      <button className="start-menu-button" aria-label="设置" onClick={() => setView("settings")}>
        <img src={START_MENU_BUTTON_ASSETS.settings} alt="" draggable={false} />
      </button>
      <button className="start-menu-button" aria-label="制作人员" onClick={() => setView("credits")}>
        <img src={START_MENU_BUTTON_ASSETS.credits} alt="" draggable={false} />
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
          <img className="start-mode-card-art" src="/assets/menu/mode-local-hotseat.v1.webp" alt="" />
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
          <img className="start-mode-card-art" src="/assets/menu/mode-online-play.v1.webp" alt="" />
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

  const renderSetup = () => {
    const selectedBoardOption =
      BOARD_STRUCTURE_OPTIONS.find((option) => option.id === boardStructureId) ?? RANDOM_BOARD_STRUCTURE_OPTION;
    const enabledFactionIds = localFactionIds.slice(0, count);

    return (
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
          <section className="start-local-settings-panel" aria-label="基础设置">
            <div className="start-local-section-heading">
              <Settings size={26} aria-hidden="true" />
              <h2>基础设置</h2>
              <span aria-hidden="true" />
            </div>

            <div className="start-local-settings-group">
              <h3>
                <Users size={20} aria-hidden="true" />
                玩家人数
              </h3>
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
                    <span>{value} 人</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="start-local-settings-group">
              {renderBoardStructureSelect(boardStructureId, setBoardStructureId, "地图选择", "本地开局地图", false)}
            </div>

            <div className="start-local-settings-group start-local-mode-card">
              <h3>
                <Settings size={20} aria-hidden="true" />
                游戏模式
              </h3>
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
            </div>
          </section>

          <section className="start-local-faction-section" aria-label="配置席位">
            <div className="start-local-section-heading">
              <Users size={26} aria-hidden="true" />
              <h2>配置席位</h2>
              <span aria-hidden="true" />
              <p>选择玩家人数以启用对应席位</p>
            </div>

            <div className="player-setup-list start-player-setup-list">
              {Array.from({ length: 6 }, (_, index) => {
                const seatNumber = index + 1;
                const isEnabled = seatNumber <= count;
                const factionId = localFactionIds[index] ?? "";
                const selectedFaction = findFactionById(factionId);
                const controller = localControllers[index] ?? "ai";
                const controllerLabel = controller === "ai" ? "AI 玩家" : "真人玩家";
                const cardClassName = [
                  "start-player-setup-row",
                  isEnabled ? "enabled" : "inactive",
                  selectedFaction ? "active" : "empty"
                ].join(" ");

                if (!isEnabled) {
                  return (
                    <article
                      key={`local-seat-${index}`}
                      className={cardClassName}
                      aria-disabled="true"
                      style={{ "--player-color": "#6f6657" } as CSSProperties}
                    >
                      <span className="start-seat-number">{seatNumber}</span>
                      <div className="start-seat-locked" aria-hidden="true">
                        <Lock size={42} />
                      </div>
                      <strong>未启用</strong>
                      <p>选择 {seatNumber} 人开启</p>
                    </article>
                  );
                }

                return (
                  <article
                    key={`local-seat-${index}`}
                    className={cardClassName}
                    style={{ "--player-color": selectedFaction?.color ?? "#6f6657" } as CSSProperties}
                  >
                    <span className="start-seat-number">{seatNumber}</span>
                    <div className="start-seat-summary">
                      {controller === "ai" ? <Bot size={25} aria-hidden="true" /> : <User size={25} aria-hidden="true" />}
                      <div>
                        <strong>玩家 {seatNumber}</strong>
                        <small>{controllerLabel}</small>
                      </div>
                    </div>
                    <div className="start-seat-card-body">
                      <div className="start-faction-banner" aria-hidden="true">
                        {selectedFaction ? <img src={selectedFaction.portrait} alt="" /> : <Users size={44} />}
                      </div>
                      <div className="start-seat-fields">
                        <label className="field compact-field start-controller-select-field">
                          <span>身份</span>
                          <div className="faction-select-row">
                            <select
                              aria-label={`玩家 ${seatNumber} 控制方式`}
                              value={controller}
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
                          <span>阵营</span>
                          <div className="faction-select-row">
                            <select
                              aria-label={`玩家 ${seatNumber} 阵营`}
                              value={factionId}
                              onChange={(event) => updateLocalFaction(index, event.target.value)}
                            >
                              <option value="">请选择阵营</option>
                              {PLAYER_FACTIONS.map((optionFaction) => {
                                const isTaken = enabledFactionIds.some(
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
                          <span>名称</span>
                          <input
                            aria-label={`玩家 ${seatNumber} 名称`}
                            value={names[index] ?? `玩家${seatNumber}`}
                            onChange={(event) => {
                              const next = [...names];
                              next[index] = event.target.value;
                              setNames(next);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="start-local-start-note">
              <Info size={16} aria-hidden="true" />
              至少需要 1 名真人玩家才能开始游戏
            </p>
          </section>

          <footer className="start-local-action-bar">
            <div className="start-local-summary" aria-label="当前配置摘要">
              <strong>
                <Settings size={18} aria-hidden="true" />
                当前配置
              </strong>
              <span>
                <Users size={20} aria-hidden="true" />
                {count} 人局
              </span>
              <span>
                <MapIcon size={20} aria-hidden="true" />
                {selectedBoardOption.label}
              </span>
              <span>
                <CloudFog size={20} aria-hidden="true" />
                迷雾{fogEnabled ? "开启" : "关闭"}
              </span>
              <span>
                <Bug size={20} aria-hidden="true" />
                调试{debugMode ? "开启" : "关闭"}
              </span>
            </div>
            <button
              className="start-confirm-button start-local-start-button"
              aria-label="开始游戏"
              disabled={!canCreateLocalGame}
              title={canCreateLocalGame ? "开始本地对局" : "请为每个席位选择阵营，并保留至少一名真人玩家"}
              onClick={createGame}
            >
              <Play size={28} />
              开始游戏
            </button>
          </footer>
        </div>
        <button className="start-mode-return-button start-local-return-button" onClick={() => setView("mode")}>
          <ArrowLeft size={18} />
          返回
        </button>
      </div>
    );
  };

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
                通过掷骰获得资源、建设营地、扩张补给线、探索迷雾，并在尸潮围城爆发前准备防线。
                每一回合都围绕三个问题展开：我能产什么资源、这些资源能换成什么棋盘位置、
                以及下一次尸潮来临时我是否守得住。
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
                  <dd>本地热座 / 在线联机</dd>
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
              <span className="start-rules-kicker">02 / 先知道终点</span>
              <h3>胜利与计分</h3>
              <p>
                游戏是竞争制。谁先在自己的回合达到或超过 {VICTORY_POINTS_TO_WIN} 点胜利点，谁立即获胜。
                胜利点来自棋盘建筑、路线优势、防守贡献、探索奖励和少量隐藏分。
              </p>
            </div>
            <div className="start-rules-card-grid two">
              <div className="start-rules-card">
                <Crown size={30} />
                <strong>分数从哪里来</strong>
                <ul>
                  <li>营地每个 1 点；堡垒每个 2 点。</li>
                  <li>最长补给线 2 点：路线长度至少达到 5，且单独领先时获得。</li>
                  <li>最强民兵 2 点：已征召民兵至少达到 3 名，且单独领先时获得。</li>
                  <li>每名玩家首次在每个非起始小资源区建立营地时，获得 1 点新资源区奖励。</li>
                  <li>秘密据点每张 1 点；商人控制权 1 点；每个卡坦保卫者标记 1 点。</li>
                </ul>
              </div>
              <div className="start-rules-card">
                <Shield size={30} />
                <strong>分数怎么被追上</strong>
                <ul>
                  <li>尸潮会封锁资源地块，让高产区暂时失效。</li>
                  <li>堡垒虽然分高，但全场堡垒越多，尸潮围城强度越高。</li>
                  <li>补给线和最强民兵都需要保持单独领先；被追平时通常不会转移给并列者。</li>
                  <li>例：3 个营地、2 个堡垒、最长补给线和商人控制权，共 3 + 4 + 2 + 1 = 10 点。</li>
                </ul>
              </div>
            </div>
          </article>

          <article id="rules-components" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">03 / 看懂棋盘语言</span>
              <h3>棋盘与组件</h3>
              <p>
                地图由六边形地块拼成。地块负责产资源或制造阻隔；地块角上的交叉点放建筑；
                地块边上的线段放路线；资源卡支付行动费用，发展卡提供一次性战术或隐藏分。
              </p>
            </div>

            <div className="start-rules-subsection">
              <h4>地块长什么样，有什么用</h4>
              <div className="start-rules-visual-grid tiles">
                {TILE_GUIDE_ITEMS.map((tile) => {
                  const asset = tileAssets[tile.type];
                  return (
                    <article key={tile.type} className="start-rules-visual-card tile-card">
                      <span className="start-rules-visual-media hex-media" style={{ "--fallback-color": asset.fallbackColor } as CSSProperties}>
                        {asset.imageUrl ? <img src={asset.imageUrl} alt="" draggable={false} /> : <b>{asset.fallbackLabel}</b>}
                      </span>
                      <div>
                        <strong>{tile.label}</strong>
                        <em>{tile.output}</em>
                        <p>{tile.detail}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="start-rules-subsection">
              <h4>资源卡长什么样，主要做什么</h4>
              <div className="start-rules-visual-grid resources">
                {RESOURCE_GUIDE_ITEMS.map((resource) => {
                  const asset = resourceCardAssets[resource.type];
                  return (
                    <article key={resource.type} className="start-rules-visual-card resource-card">
                      <span className="start-rules-visual-media card-media" style={{ "--fallback-color": asset.fallbackColor } as CSSProperties}>
                        {asset.imageUrl ? <img src={asset.imageUrl} alt="" draggable={false} /> : <b>{asset.fallbackLabel}</b>}
                      </span>
                      <div>
                        <strong>{RESOURCE_LABELS[resource.type]}</strong>
                        <p>{resource.uses}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="start-rules-subsection">
              <h4>玩家棋子长什么样，放在哪里</h4>
              <div className="start-rules-visual-grid pieces">
                {PIECE_GUIDE_ITEMS.map((piece) => (
                  <article key={piece.label} className="start-rules-visual-card piece-card">
                    <span className="start-rules-visual-media piece-media">
                      {piece.imageUrl ? <img src={piece.imageUrl} alt="" draggable={false} /> : <b>{piece.fallback}</b>}
                    </span>
                    <div>
                      <strong>{piece.label}</strong>
                      <em>每名玩家上限：{piece.limit}</em>
                      <p>{piece.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="start-rules-subsection">
              <h4>公共标记长什么样，会改变什么</h4>
              <div className="start-rules-visual-grid markers">
                {MARKER_GUIDE_ITEMS.map((marker) => (
                  <article key={marker.label} className="start-rules-visual-card marker-card">
                    <span className="start-rules-visual-media marker-media">
                      <img src={marker.imageUrl} alt="" draggable={false} />
                    </span>
                    <div>
                      <strong>{marker.label}</strong>
                      <p>{marker.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <p className="start-rules-note">
              读棋盘时可以按这个顺序看：先看地块图片和数字，判断会产什么；再看交叉点上的建筑属于谁；
              然后看边上有没有运输线、装甲车队或黑市；最后确认尸潮是否正压在某个地块上。
            </p>
          </article>

          <article id="rules-setup" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">04 / 第一轮之前</span>
              <h3>开局摆放</h3>
              <p>
                游戏开始时会先决定起始玩家，然后每名玩家用蛇形顺序放置 2 个初始营地和 2 条初始运输线。
                开局位置决定你前几轮能产什么资源，所以要优先看数字、资源种类和后续扩张出口。
              </p>
            </div>
            <div className="start-rules-card-grid two">
              <div className="start-rules-card">
                <MapIcon size={30} />
                <strong>摆放顺序</strong>
                <ul>
                  <li>起始玩家从掷骰结果中决定，之后按顺序每人放 1 个营地并连接 1 条运输线。</li>
                  <li>第一轮放完后，第二轮反向放置：最后一名玩家先放第二个营地和运输线。</li>
                  <li>每次放营地后，必须立刻在这个营地旁接 1 条初始运输线。</li>
                  <li>第二个初始营地完成连接后，会从它相邻的已公开资源地块获得初始资源。</li>
                </ul>
              </div>
              <div className="start-rules-card">
                <Info size={30} />
                <strong>初始位置限制</strong>
                <ul>
                  <li>初始营地必须相邻至少 1 个已公开资源地块；如果地图有大型资源区，初始营地必须贴着大型资源区。</li>
                  <li>初始营地不能接触迷雾地块，也不能直接相邻废弃仓库。</li>
                  <li>任意两个营地或堡垒之间至少隔 1 个空交叉点。</li>
                  <li>初始运输线只能是运输线，不能用装甲车队；运输线必须沿资源地块边缘放置。</li>
                </ul>
              </div>
            </div>
            <div className="start-rules-example-card">
              <strong>开局例子</strong>
              <p>
                你的第二个营地同时相邻农场和军事营地，连接初始运输线后会获得 1 张食物和 1 张弹药。
                如果第二个营地还相邻林地，就再获得 1 张木材；感染区和空地不会给初始资源。
              </p>
            </div>
          </article>

          <article id="rules-turn" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">05 / 每个玩家的节奏</span>
              <h3>回合流程</h3>
              <p>轮到你时，先处理产出或尸潮，再进入行动阶段。行动阶段没有固定先后，你可以按资源情况自由安排交易、建造、民兵和发展卡。</p>
            </div>
            <div className="start-rules-card-grid two">
              <div className="start-rules-card">
                <Dices size={30} />
                <strong>先掷骰</strong>
                <ul>
                  <li>掷两颗六面骰，点数相加。</li>
                  <li>如果不是 7，所有命中该数字且没有尸潮的资源地块产出资源。</li>
                  <li>如果是 7，不产资源，改为处理弃牌、移动尸潮和抽取资源。</li>
                </ul>
              </div>
              <div className="start-rules-card">
                <TowerControl size={30} />
                <strong>再行动</strong>
                <ul>
                  <li>可以玩家交易、银行或黑市交易、建造棋子、买发展卡。</li>
                  <li>可以激活民兵、移动成熟的民兵、驱逐尸潮，或使用一张符合条件的发展卡。</li>
                  <li>结束回合时检查胜利；如果你的分数达到 {VICTORY_POINTS_TO_WIN} 点，游戏结束。</li>
                </ul>
              </div>
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
              <span className="start-rules-kicker">06 / 把资源变成位置</span>
              <h3>资源与建造</h3>
              <p>资源来自相邻地块产出，并用来建造棋子。营地拿 1 张，堡垒拿 2 张；尸潮所在的地块不产出。</p>
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
            <div className="start-rules-example-card">
              <strong>产出例子</strong>
              <p>
                如果骰子掷出 6，所有数字为 6 且没有尸潮的资源地块都会检查相邻建筑。
                你的营地靠着 6 号农场，就拿 1 张食物；你的堡垒靠着同一块农场，就拿 2 张食物。
                如果尸潮正站在这块农场上，这块地本回合完全不产出。
              </p>
            </div>
            <div className="start-rules-example-card">
              <strong>建造例子</strong>
              <p>
                你想新建营地时，先确认目标交叉点没有建筑、没有挨着其他营地或堡垒、至少相邻 1 个资源地块，
                并且能通过自己的运输线或装甲车队连回己方网络。满足位置规则后，再支付营地费用。
              </p>
            </div>
          </article>

          <article id="rules-cards" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">07 / 资源不够时</span>
              <h3>交易与发展卡</h3>
              <p>
                资源管理决定扩张速度。交易解决缺口，发展卡提供一次性爆发、资源调度、商人控制或隐藏胜利点。
                这部分通常发生在行动阶段，可以穿插在建造前后。
              </p>
            </div>
            <div className="start-rules-card-grid three">
              <div className="start-rules-card compact">
                <Users size={28} />
                <strong>玩家交易</strong>
                <p>当前玩家可以和其他玩家自愿交易资源；不能交易发展卡、胜利点、棋子或未来承诺。</p>
              </div>
              <div className="start-rules-card compact">
                <Globe2 size={28} />
                <strong>银行、黑市、商人</strong>
                <p>基础银行比例为 4:1；普通黑市为 3:1；指定资源黑市为 2:1。商人也能提供符合地块资源的 2:1 贸易。</p>
              </div>
              <div className="start-rules-card compact">
                <BookOpen size={28} />
                <strong>发展卡规则</strong>
                <p>购买费用为食物×1 + 金属×1 + 弹药×1。每回合最多使用 1 张，本回合买的不能立刻使用；秘密据点不主动打出。</p>
              </div>
            </div>
            <div className="start-rules-subsection">
              <h4>发展卡长什么样，抽到后怎么用</h4>
              <div className="start-rules-visual-grid dev-cards">
                {DEV_CARD_GUIDE_ITEMS.map((card) => {
                  const asset = devCardAssets[card.type];
                  return (
                    <article key={card.type} className="start-rules-visual-card dev-guide-card">
                      <span className="start-rules-visual-media dev-card-media" style={{ "--fallback-color": asset.fallbackColor } as CSSProperties}>
                        {asset.imageUrl ? <img src={asset.imageUrl} alt="" draggable={false} /> : <b>{asset.fallbackLabel}</b>}
                      </span>
                      <div>
                        <strong>{DEV_CARD_LABELS[card.type]}</strong>
                        <em>牌堆数量：{DEV_CARD_COUNTS[card.type]} 张</em>
                        <p>{card.effect}</p>
                        <p>{card.example}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="start-rules-example-card">
              <strong>交易例子</strong>
              <p>
                如果你没有黑市或商人，可以用 4 张同种资源向银行换任意 1 张资源。
                若你的建筑相邻普通黑市，可改用 3:1；若相邻“燃料”指定黑市，则可用 2 张燃料换任意 1 张。
                玩家之间的交易必须双方同意，且只能交换资源。
              </p>
            </div>
          </article>

          <article id="rules-horde" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">08 / 公共危机</span>
              <h3>尸潮来袭与尸潮围城</h3>
              <p>尸潮来袭是掷出 7 后移动尸潮标志并封锁资源的即时事件；尸潮围城则在尸潮围城进度达到 6 时，按全场堡垒与已激活民兵进行防御结算。</p>
            </div>
            <div className="start-rules-split">
              <div className="start-rules-warning-card">
                <Bug size={34} />
                <strong>尸潮来袭：掷出 7</strong>
                <ul>
                  <li>基础手牌上限是 {BASE_HAND_LIMIT} 张；每座哨塔让该玩家上限 +{WATCHTOWER_HAND_BONUS}。超过上限的玩家先弃掉一半资源。</li>
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
            <p className="start-rules-note">
              例：全场共有 4 座堡垒，围城强度就是 4。若所有玩家合计有 5 名已激活民兵，防守成功；
              若只有 3 名已激活民兵，防守失败，并由符合条件且激活民兵最少的堡垒玩家降级堡垒。
            </p>
          </article>

          <article id="rules-militia" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">09 / 防线怎么运转</span>
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
              <span className="start-rules-kicker">10 / 离开安全区</span>
              <h3>探索与迷雾</h3>
              <p>迷雾模式下，地图不会一开始完全公开。新建路线触达迷雾时会翻开周围地块，而装甲车队是持续向未知区域推进的关键。</p>
            </div>
            <div className="start-rules-card-grid two">
              <div className="start-rules-card">
                <Search size={30} />
                <strong>探索收益</strong>
                <ul>
                  <li>路线触达迷雾会翻开附近未知地块；装甲车队能沿空地边缘继续推进，探索能力最强。</li>
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
            <p className="start-rules-note">
              例：你的开放装甲车队贴着一块迷雾边缘，探索后翻出军事营地，你立即拿 1 张弹药；
              如果翻出感染区，则不拿资源，改为推进尸潮围城并随机弃 1 张资源。
            </p>
          </article>

          <article id="rules-faq" className="start-rules-section">
            <div className="start-rules-section-title">
              <span className="start-rules-kicker">11 / 提醒</span>
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
                <summary>营地为什么有时不能放？</summary>
                <p>通常是三个原因：离别的建筑太近、没有连接自己的路线、或目标交叉点没有相邻资源地块。开局营地还不能贴迷雾或废弃仓库。</p>
              </details>
              <details>
                <summary>为什么我买的发展卡不能马上用？</summary>
                <p>本回合买到的发展卡要等之后的回合才能打出；每回合也最多只能使用 1 张发展卡。秘密据点不能主动打出，只在达成胜利时自动公开。</p>
              </details>
              <details>
                <summary>哨塔能防守尸潮吗？</summary>
                <p>哨塔本身不提供围城防御值。它的作用是提高你的手牌上限，减少掷出 7 时被迫弃牌的风险。</p>
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
    const activeOnlineSetupMode: "create" | "join" = onlineSetupMode === "join" ? "join" : "create";

    if (onlineSetupMode === "select" || onlineSetupMode === "create" || onlineSetupMode === "join") {
      return (
        <div className="start-online-entry-screen">
          <header className="start-online-entry-title start-secondary-title">
            <span aria-hidden="true" />
            <div>
              <h2>联机房间</h2>
              <p>创建房间或输入房间码加入好友的战局</p>
            </div>
            <span aria-hidden="true" />
          </header>
          {renderErrorBanner()}

          <div className="start-online-entry-layout start-online-room-window start-secondary-frame">
            <div className="start-online-tabs" role="tablist" aria-label="在线房间操作">
              <button
                type="button"
                role="tab"
                aria-selected={activeOnlineSetupMode === "create"}
                className={activeOnlineSetupMode === "create" ? "active" : ""}
                onClick={() => setOnlineSetupMode("create")}
              >
                创建房间
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeOnlineSetupMode === "join"}
                className={activeOnlineSetupMode === "join" ? "active" : ""}
                onClick={() => setOnlineSetupMode("join")}
              >
                加入房间
              </button>
            </div>

            {activeOnlineSetupMode === "join" ? (
              <section className="start-online-window-body start-online-join-body">
                <div className="start-online-window-content start-online-join-layout">
                  <section className="start-online-window-card">
                    <div className="start-online-card-heading">
                      <User size={28} />
                      <div>
                        <h3>玩家信息</h3>
                        <p>填写昵称并输入房主分享的房间码</p>
                      </div>
                    </div>

                    <label className="start-online-field">
                      <span>玩家昵称</span>
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
                      <span>房间码</span>
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
                            placeholder="-"
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
                  </section>

                  <section className="start-online-window-card start-online-code-help-card">
                    <div className="start-online-code-help-copy">
                      <Info size={24} aria-hidden="true" />
                      <div>
                        <h3>如何获取房间码？</h3>
                        <p>请向房主或其他玩家索要 6 位房间码，输入正确的房间码即可加入战局。</p>
                      </div>
                    </div>
                    <img src="/assets/menu/create-room-help.v1.webp" alt="" />
                  </section>
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
            ) : (
              <section className="start-online-window-body start-online-create-body">
                <div className="start-online-window-content start-online-create-layout">
                  <div className="start-online-create-left">
                    <section className="start-online-window-card start-online-room-info-card">
                      <div className="start-online-card-heading">
                        <User size={28} />
                        <div>
                          <h3>房间信息</h3>
                        </div>
                      </div>

                      <label className="start-online-field">
                        <span>房主昵称</span>
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

                      <div className="start-online-setting-group">
                        <div className="start-online-setting-title">
                          <Users size={20} aria-hidden="true" />
                          <span>玩家人数</span>
                        </div>
                        <div className="start-online-count-buttons" role="radiogroup" aria-label="在线房间人数">
                          {ONLINE_PLAYER_COUNT_OPTIONS.map((value) => (
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
                              <span>{value} 人</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="start-online-setting-group">
                        <div className="start-online-setting-title">
                          <Bot size={20} aria-hidden="true" />
                          <span>AI 玩家数量</span>
                        </div>
                        <div className="start-online-count-buttons start-online-ai-buttons" role="radiogroup" aria-label="在线 AI 玩家数量">
                          {ONLINE_AI_COUNT_OPTIONS.map((value) => {
                            const disabled = value >= onlineTargetCount;
                            return (
                              <button
                                key={value}
                                type="button"
                                className={onlineAiCount === value ? "active" : ""}
                                aria-pressed={onlineAiCount === value}
                                disabled={disabled}
                                onClick={() => setOnlineAiCount(value)}
                              >
                                <span>{value} 名</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="start-online-current-count">
                        <Users size={20} aria-hidden="true" />
                        <span>当前：{onlineHumanPlayerCount} 名真人玩家，{onlineAiCount} 名 AI 玩家</span>
                      </div>
                    </section>
                  </div>

                  <div className="start-online-create-right">
                    <section className="start-online-window-card start-online-game-settings-card">
                      <div className="start-online-card-heading">
                        <Settings size={28} />
                        <div>
                          <h3>游戏设置</h3>
                        </div>
                      </div>

                      {renderBoardStructureSelect(onlineBoardStructureId, setOnlineBoardStructureId, "地图类型", "在线开局地图")}

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
                    </section>
                  </div>
                </div>

                <div className="start-online-create-action-bar">
                  <div className="start-online-create-summary">
                    <Info size={20} aria-hidden="true" />
                    <span>当前配置：{onlineCreateSummary}</span>
                  </div>
                  <button
                    className="start-confirm-button start-online-submit-button"
                    aria-label="创建在线房间"
                    disabled={onlineBusy || !online || !onlineHostNameIsValid}
                    onClick={() =>
                      online?.onCreateRoom({
                        name: normalizedOnlineHostName,
                        targetPlayerCount: onlineTargetCount,
                        aiPlayerCount: onlineAiCount,
                        fogEnabled: onlineFogEnabled,
                        ...(onlineBoardStructureId ? { boardStructureId: onlineBoardStructureId } : {})
                      })
                    }
                  >
                    <Users size={22} />
                    创建房间
                  </button>
                </div>
              </section>
            )}
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
                disabled={onlineBusy || !online || !onlineHostNameIsValid}
                onClick={() =>
                  online?.onCreateRoom({
                    name: normalizedOnlineHostName,
                    targetPlayerCount: onlineTargetCount,
                    aiPlayerCount: onlineAiCount,
                    fogEnabled: onlineFogEnabled,
                    ...(onlineBoardStructureId ? { boardStructureId: onlineBoardStructureId } : {})
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
    const lobbyBoardStructure =
      BOARD_STRUCTURE_OPTIONS.find((option) => option.id === lobbyView.roomMeta.boardStructureId) ??
      RANDOM_BOARD_STRUCTURE_OPTION;
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
                  <MapIcon size={19} />
                  开局地图
                </dt>
                <dd>{lobbyBoardStructure.label}</dd>
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
