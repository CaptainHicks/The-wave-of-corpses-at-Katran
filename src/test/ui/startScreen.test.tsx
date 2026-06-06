import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYER_FACTIONS } from "../../domain/constants";
import type { LobbyView } from "../../online/protocol";
import { StartScreen } from "../../ui/StartScreen";

const AUDIO_SETTINGS_KEY = "zombie-catan-audio-settings";

function createOnlineProps(overrides: Partial<Parameters<typeof StartScreen>[0]["online"]> = {}) {
  return {
    busy: false,
    connectionState: "connected" as const,
    error: undefined,
    lobbyView: undefined,
    onCreateRoom: vi.fn(),
    onJoinRoom: vi.fn(),
    onChooseFaction: vi.fn(),
    onSendChatMessage: vi.fn(),
    onStartRoom: vi.fn(),
    onLeaveRoom: vi.fn(),
    onDismissError: vi.fn(),
    ...overrides
  };
}

function renderStartScreen(options: { hasSavedGame?: boolean; online?: Parameters<typeof StartScreen>[0]["online"] } = {}) {
  const onCreate = vi.fn();
  const onContinue = vi.fn();
  const online = options.online ?? createOnlineProps();
  const hasSavedGame = options.hasSavedGame ?? false;
  const savedGameSummary = hasSavedGame ? { turn: 7, currentPlayerName: "蓝钢哨站" } : undefined;

  return {
    ...render(
      <StartScreen
        hasSavedGame={hasSavedGame}
        savedGameSummary={savedGameSummary}
        onContinue={onContinue}
        onCreate={onCreate}
        online={online}
      />
    ),
    onCreate,
    onContinue,
    online
  };
}

function setViewport(width: number, height: number) {
  const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });

  return () => {
    if (originalInnerWidth) Object.defineProperty(window, "innerWidth", originalInnerWidth);
    if (originalInnerHeight) Object.defineProperty(window, "innerHeight", originalInnerHeight);
  };
}

function openHotSeatSetup() {
  fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
  fireEvent.click(screen.getByRole("button", { name: "本地热座" }));
}

function openOnlineEntry() {
  fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
  fireEvent.click(screen.getByRole("button", { name: "在线联机" }));
}

function sampleLobbyView(overrides: Partial<LobbyView> = {}): LobbyView {
  return {
    kind: "lobby",
    viewerPlayerId: "p2",
    roomMeta: {
      roomCode: "ROOM42",
      hostPlayerId: "p1",
      status: "lobby",
      connectedPlayerIds: ["p1", "p2"],
      targetPlayerCount: 2,
      fogEnabled: false
    },
    seats: [
      { playerId: "p1", name: "房主A", color: PLAYER_FACTIONS[0].color, factionId: PLAYER_FACTIONS[0].id, connected: true },
      { playerId: "p2", name: "玩家B", color: "#6f6657", factionId: undefined, connected: true }
    ],
    chatMessages: [
      { id: "system-1", kind: "system", text: "房主A 创建了房间。", createdAt: 1_000 },
      { id: "chat-1", kind: "player", playerId: "p1", playerName: "房主A", text: "准备选阵营。", createdAt: 1_001 }
    ],
    canStart: false,
    startBlockedReason: "只有房主可以开始游戏。",
    ...overrides
  };
}

describe("StartScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the main menu with version text", () => {
    renderStartScreen();

    expect(screen.getByRole("img", { name: "尸潮卡坦：废土拓荒" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始游戏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续游戏" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "规则说明" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作人员" })).toBeInTheDocument();
    expect(screen.getByText("版本号：1.0.0")).toBeInTheDocument();
  });

  it("scales the menu from the same fixed design surface on every viewport", () => {
    const restoreViewport = setViewport(836, 470.5);

    try {
      const { container } = renderStartScreen();
      const stage = container.querySelector(".start-stage") as HTMLElement;

      expect(stage.style.getPropertyValue("--start-stage-scale")).toBe("0.5");
    } finally {
      restoreViewport();
    }
  });

  it("continues a saved game only when a saved game exists", () => {
    const { onContinue } = renderStartScreen({ hasSavedGame: true });

    expect(screen.getByText("上次停在第 7 回合，当前指挥官：蓝钢哨站")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续游戏" }));

    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("routes start game through mode selection and local setup", () => {
    renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
    expect(screen.getByRole("button", { name: "本地热座" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在线联机" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "本地热座" }));
    expect(screen.getByLabelText("玩家人数")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认开局" })).toBeInTheDocument();
  });

  it("renders rules as a handbook layout with section navigation and scrollable content", () => {
    const { container } = renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "规则说明" }));

    expect(screen.getByRole("navigation", { name: "规则章节目录" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "规则说明正文" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "游戏概述" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "回合流程" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "尸潮与民兵" })).toBeInTheDocument();
    expect(screen.getByText("率先达到 12 点")).toBeInTheDocument();
    expect(screen.getByLabelText("每名玩家棋子上限")).toBeInTheDocument();
    expect(screen.getByText("营地：5 个")).toBeInTheDocument();
    expect(screen.getByText("堡垒：4 个")).toBeInTheDocument();
    expect(screen.getByText("运输线：15 条")).toBeInTheDocument();
    expect(screen.getByText("装甲车队：10 个")).toBeInTheDocument();
    expect(screen.getByText("哨塔：4 个")).toBeInTheDocument();
    expect(screen.getByText("民兵：12 个")).toBeInTheDocument();
    expect(screen.queryByText(/14 点/)).not.toBeInTheDocument();
    expect(container.querySelector(".start-rules-scroll")).toBeInTheDocument();
    expect(screen.queryByText(/1\s*\/\s*10/)).not.toBeInTheDocument();
  });

  it("updates the active rules chapter as the handbook content scrolls", () => {
    const { container } = renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "规则说明" }));

    const scrollRegion = screen.getByRole("region", { name: "规则说明正文" });
    const sections = Array.from(container.querySelectorAll<HTMLElement>(".start-rules-section"));
    sections.forEach((section, index) => {
      Object.defineProperty(section, "offsetTop", { value: index * 220, configurable: true });
    });

    fireEvent.scroll(scrollRegion, { target: { scrollTop: 900 } });

    expect(screen.getByRole("link", { name: "尸潮与民兵" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "游戏概述" })).not.toHaveAttribute("aria-current");
  });

  it("scrolls rules chapters inside the handbook without changing the page hash", () => {
    const { container } = renderStartScreen();

    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    fireEvent.click(screen.getByRole("button", { name: "规则说明" }));

    const scrollRegion = screen.getByRole("region", { name: "规则说明正文" });
    const turnSection = container.querySelector<HTMLElement>("#rules-turn");
    const scrollTo = vi.fn();
    expect(turnSection).not.toBeNull();
    Object.defineProperty(turnSection, "offsetTop", { value: 420, configurable: true });
    Object.defineProperty(scrollRegion, "scrollTo", { value: scrollTo, configurable: true });

    fireEvent.click(screen.getByRole("link", { name: "回合流程" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 420, behavior: "auto" });
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("link", { name: "回合流程" })).toHaveAttribute("aria-current", "true");
  });

  it("uses volume controls in settings instead of visual effect toggles", () => {
    renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByLabelText("游戏背景音乐音量")).toBeInTheDocument();
    expect(screen.getByLabelText("游戏音效音量")).toBeInTheDocument();
    expect(screen.queryByText("背景氛围")).not.toBeInTheDocument();
    expect(screen.queryByText("暗角强化")).not.toBeInTheDocument();
  });

  it("renders settings as a dedicated audio settings console", () => {
    const { container } = renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("调整游戏音频设置")).toBeInTheDocument();
    expect(container.querySelector(".start-settings-title")).toBeInTheDocument();
    expect(container.querySelector(".start-settings-title svg")).not.toBeInTheDocument();
    expect(container.querySelector(".start-settings-panel .start-settings-heading")).not.toBeInTheDocument();
    expect(screen.getByText("调整游戏背景音乐的音量大小")).toBeInTheDocument();
    expect(screen.getByText("调整游戏音效的音量大小")).toBeInTheDocument();
    expect(screen.getByLabelText("游戏背景音乐音量")).toHaveValue("70");
    expect(screen.getByLabelText("游戏音效音量")).toHaveValue("80");
    expect(screen.getByRole("button", { name: "恢复默认" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /一键静音/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回主菜单" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("游戏背景音乐音量"), { target: { value: "45" } });
    expect(JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toMatchObject({
      musicVolume: 45,
      muted: false
    });

    fireEvent.change(screen.getByLabelText("游戏音效音量"), { target: { value: "35" } });
    expect(JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toMatchObject({
      musicVolume: 45,
      sfxVolume: 35,
      muted: false
    });

    fireEvent.click(screen.getByRole("button", { name: /一键静音/ }));
    expect(screen.getByRole("button", { name: /一键恢复音量/ })).toBeInTheDocument();
    expect(screen.getByLabelText("游戏背景音乐音量")).toHaveValue("45");
    expect(screen.getByLabelText("游戏音效音量")).toHaveValue("35");

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回主菜单" }));

    expect(screen.getByRole("button", { name: "开始游戏" })).toBeInTheDocument();
  });

  it("renders credits with the shared secondary screen layout", () => {
    const { container } = renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "制作人员" }));

    expect(container.querySelector(".start-credits-screen")).toBeInTheDocument();
    expect(container.querySelector(".start-credits-title")).toBeInTheDocument();
    expect(container.querySelector(".start-credits-title svg")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "制作人员" })).toBeInTheDocument();
    expect(screen.getByText("游戏设计")).toBeInTheDocument();
    expect(screen.getByText("CaptainHicks")).toBeInTheDocument();
    expect(screen.getByText("美术素材")).toBeInTheDocument();
    expect(screen.getByText("Image2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回主菜单" })).toBeInTheDocument();
  });

  it("uses the shared secondary menu layout across start menu sub screens", () => {
    let view = renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
    expect(view.container.querySelector(".start-logo-lockup")).not.toBeInTheDocument();
    expect(view.container.querySelector(".start-mode-title.start-secondary-title")).toBeInTheDocument();
    expect(view.container.querySelector(".start-mode-frame.start-secondary-frame")).toBeInTheDocument();
    expect(screen.getByText("选择本局拓荒的集结方式")).toBeInTheDocument();

    view.unmount();
    view = renderStartScreen();
    openHotSeatSetup();
    expect(view.container.querySelector(".start-logo-lockup")).not.toBeInTheDocument();
    expect(view.container.querySelector(".start-local-title.start-secondary-title")).toBeInTheDocument();
    expect(view.container.querySelector(".start-local-board.start-secondary-frame")).toBeInTheDocument();
    expect(view.container.querySelector(".start-local-board .start-local-start-button")).toBeInTheDocument();
    expect(screen.getByText("围桌协作，轮流指挥幸存者阵营")).toBeInTheDocument();

    view.unmount();
    view = renderStartScreen();
    fireEvent.click(screen.getByRole("button", { name: "规则说明" }));
    expect(view.container.querySelector(".start-logo-lockup")).not.toBeInTheDocument();
    expect(view.container.querySelector(".start-rules-header.start-secondary-title")).toBeInTheDocument();
    expect(view.container.querySelector(".start-rules-manual.start-secondary-frame")).toBeInTheDocument();

    view.unmount();
    view = renderStartScreen();
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(view.container.querySelector(".start-logo-lockup")).not.toBeInTheDocument();
    expect(view.container.querySelector(".start-settings-title.start-secondary-title")).toBeInTheDocument();
    expect(view.container.querySelector(".start-settings-panel.start-secondary-frame")).toBeInTheDocument();

    view.unmount();
    view = renderStartScreen();
    fireEvent.click(screen.getByRole("button", { name: "制作人员" }));
    expect(view.container.querySelector(".start-logo-lockup")).not.toBeInTheDocument();
    expect(view.container.querySelector(".start-credits-title.start-secondary-title")).toBeInTheDocument();
    expect(view.container.querySelector(".start-credits-panel.start-secondary-frame")).toBeInTheDocument();

    view.unmount();
    view = renderStartScreen();
    openOnlineEntry();
    expect(view.container.querySelector(".start-logo-lockup")).not.toBeInTheDocument();
    expect(view.container.querySelector(".start-online-entry-title.start-secondary-title")).toBeInTheDocument();
    expect(view.container.querySelector(".start-online-entry-layout.start-secondary-frame")).toBeInTheDocument();

    view.unmount();
    view = renderStartScreen({ online: createOnlineProps({ lobbyView: sampleLobbyView() }) });
    expect(view.container.querySelector(".start-logo-lockup")).not.toBeInTheDocument();
    expect(view.container.querySelector(".start-lobby-title.start-secondary-title")).toBeInTheDocument();
    expect(view.container.querySelector(".start-lobby-layout.start-secondary-frame")).toBeInTheDocument();
  });

  it("shows create and join room forms on the online entry page", () => {
    renderStartScreen();
    openOnlineEntry();

    expect(screen.getByRole("button", { name: "创建在线房间" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入在线房间" })).toBeInTheDocument();
    expect(screen.getByLabelText("在线玩家名称")).toBeInTheDocument();
    expect(screen.getByLabelText("在线加入玩家名称")).toBeInTheDocument();
    expect(screen.getByLabelText("在线房间码")).toBeInTheDocument();
  });

  it("creates an online room without selecting a faction first", () => {
    const { online } = renderStartScreen();
    openOnlineEntry();

    fireEvent.change(screen.getByLabelText("在线玩家名称"), { target: { value: "测试房主" } });
    fireEvent.click(screen.getByRole("button", { name: "创建在线房间" }));

    expect(online?.onCreateRoom).toHaveBeenCalledWith({
      name: "测试房主",
      targetPlayerCount: 2,
      fogEnabled: false
    });
  });

  it("joins an online room with room code and player name only", () => {
    const { online } = renderStartScreen();
    openOnlineEntry();

    fireEvent.change(screen.getByLabelText("在线加入玩家名称"), { target: { value: "玩家B" } });
    fireEvent.change(screen.getByLabelText("在线房间码"), { target: { value: "room42" } });
    fireEvent.click(screen.getByRole("button", { name: "加入在线房间" }));

    expect(online?.onJoinRoom).toHaveBeenCalledWith({
      roomCode: "ROOM42",
      name: "玩家B"
    });
  });

  it("advances focus while typing the split room code", async () => {
    renderStartScreen();
    openOnlineEntry();

    const hiddenRoomCodeInput = screen.getByLabelText("在线房间码");
    const firstCodeInput = screen.getByLabelText("房间码第 1 位");
    const secondCodeInput = screen.getByLabelText("房间码第 2 位");
    const thirdCodeInput = screen.getByLabelText("房间码第 3 位");

    firstCodeInput.focus();
    fireEvent.change(firstCodeInput, { target: { value: "r" } });

    expect(hiddenRoomCodeInput).toHaveValue("R");
    await waitFor(() => expect(secondCodeInput).toHaveFocus());

    fireEvent.change(secondCodeInput, { target: { value: "o" } });

    expect(hiddenRoomCodeInput).toHaveValue("RO");
    await waitFor(() => expect(thirdCodeInput).toHaveFocus());
  });

  it("returns focus to the first code box when the split room code is empty", async () => {
    renderStartScreen();
    openOnlineEntry();

    const firstCodeInput = screen.getByLabelText("房间码第 1 位");
    const fourthCodeInput = screen.getByLabelText("房间码第 4 位");

    fourthCodeInput.focus();

    await waitFor(() => expect(firstCodeInput).toHaveFocus());
  });

  it("lets players choose and change factions live inside the lobby", () => {
    const online = createOnlineProps({ lobbyView: sampleLobbyView() });
    renderStartScreen({ online });

    expect(screen.getByText("房间大厅")).toBeInTheDocument();
    expect(screen.getByText("ROOM42")).toBeInTheDocument();
    expect(screen.getAllByText("房主A").length).toBeGreaterThan(0);
    expect(screen.getByText("玩家B")).toBeInTheDocument();
    expect(screen.getByText(/未选择阵营/, { selector: "small" })).toBeInTheDocument();

    const factionSelect = screen.getByLabelText("在线大厅阵营") as HTMLSelectElement;
    const occupiedOption = Array.from(factionSelect.options).find(
      (option) => option.value === PLAYER_FACTIONS[0].id
    );
    expect(occupiedOption?.disabled).toBe(true);
    expect(occupiedOption?.textContent).toContain("已被别人选择");

    fireEvent.change(factionSelect, { target: { value: PLAYER_FACTIONS[1].id } });
    expect(online.onChooseFaction).toHaveBeenCalledWith({
      roomCode: "ROOM42",
      factionId: PLAYER_FACTIONS[1].id
    });

    fireEvent.change(factionSelect, { target: { value: "" } });
    expect(online.onChooseFaction).toHaveBeenCalledWith({
      roomCode: "ROOM42",
      factionId: undefined
    });
  });

  it("renders lobby chat messages and sends a new chat message", async () => {
    const online = createOnlineProps({ lobbyView: sampleLobbyView() });
    renderStartScreen({ online });

    expect(screen.getByText("【系统】房主A 创建了房间。")).toBeInTheDocument();
    expect(screen.getAllByText("房主A").length).toBeGreaterThan(0);
    expect(screen.getByText("准备选阵营。")).toBeInTheDocument();

    const chatInput = screen.getByLabelText("房间聊天内容");
    const sendButton = screen.getByRole("button", { name: "发送" });
    expect(sendButton).toBeDisabled();

    fireEvent.change(chatInput, { target: { value: " 我来了 " } });
    fireEvent.click(sendButton);

    expect(online.onSendChatMessage).toHaveBeenCalledWith({
      roomCode: "ROOM42",
      text: "我来了"
    });
    await waitFor(() => expect(chatInput).toHaveValue(""));
  });

  it("describes factions as flavor only without implying special abilities", () => {
    const online = createOnlineProps({ lobbyView: sampleLobbyView() });
    const { container } = renderStartScreen({ online });
    const factionGridText = container.querySelector(".start-lobby-faction-grid")?.textContent ?? "";

    expect(factionGridText).toContain("由废土边缘聚起的赤色营地，旗帜和部件呈赤锈色。");
    expect(factionGridText).toContain("以钢蓝涂装标记的前哨队，保留旧工业哨站的秩序感。");
    expect(factionGridText).toContain("来自绿洲聚落的行旅队，带着水源与车队的旧记忆。");
    expect(factionGridText).toContain("扎根黄沙堡垒的幸存者，徽记映着荒漠金色。");
    expect(factionGridText).toContain("围绕白塔建立的公社，信标和建筑保留明亮轮廓。");
    expect(factionGridText).toContain("穿行灰烬荒路的商队，以冷灰色旗记辨认彼此。");
    expect(factionGridText).not.toMatch(/擅长|优势|掌控|精于|技能|加成|能力/);
  });

  it("renders the online lobby and lets the host start or leave", () => {
    const online = createOnlineProps({
      lobbyView: sampleLobbyView({
        viewerPlayerId: "p1",
        seats: [
          { playerId: "p1", name: "房主A", color: PLAYER_FACTIONS[0].color, factionId: PLAYER_FACTIONS[0].id, connected: true },
          { playerId: "p2", name: "玩家B", color: PLAYER_FACTIONS[1].color, factionId: PLAYER_FACTIONS[1].id, connected: true }
        ],
        canStart: true,
        startBlockedReason: undefined
      })
    });
    renderStartScreen({ online });

    expect(screen.getByText("调试模式")).toBeInTheDocument();
    expect(screen.getAllByText("2/2").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: "房主开始游戏" }));
    expect(online.onStartRoom).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "离开房间" }));
    expect(online.onLeaveRoom).toHaveBeenCalledOnce();
  });

  it("creates a local hot-seat game after each visible seat selects a faction", () => {
    const { container, onCreate } = renderStartScreen();
    openHotSeatSetup();
    const factionSelects = container.querySelectorAll<HTMLSelectElement>(".start-faction-select-field select");
    const nameInputs = container.querySelectorAll<HTMLInputElement>(".start-faction-name-field input");
    const startButton = container.querySelector<HTMLButtonElement>(".start-local-start-button")!;

    expect(factionSelects).toHaveLength(4);
    factionSelects.forEach((select) => expect(select).toHaveValue(""));
    expect(startButton).toBeDisabled();

    factionSelects.forEach((select, index) => {
      fireEvent.change(select, { target: { value: PLAYER_FACTIONS[index].id } });
    });
    fireEvent.change(nameInputs[0], { target: { value: "Scout Lead" } });
    fireEvent.click(startButton);

    expect(onCreate).toHaveBeenCalledOnce();
    const command = onCreate.mock.calls[0][0];
    expect(command.debugMode).toBe(false);
    expect(command.fogEnabled).toBe(false);
    expect(command.players[0]).toMatchObject({
      name: "Scout Lead",
      factionId: PLAYER_FACTIONS[0].id,
      color: PLAYER_FACTIONS[0].color
    });
    expect(command.players).toHaveLength(4);
    expect(command.players[4]?.factionId).toBeUndefined();
  });

  it("renders only the selected player count of local faction seats", () => {
    const { container, onCreate } = renderStartScreen();
    openHotSeatSetup();

    fireEvent.click(screen.getByRole("button", { name: "5 人" }));
    const factionSelects = container.querySelectorAll<HTMLSelectElement>(".start-faction-select-field select");
    expect(factionSelects).toHaveLength(5);

    factionSelects.forEach((select, index) => {
      fireEvent.change(select, { target: { value: PLAYER_FACTIONS[index].id } });
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>(".start-local-start-button")!);

    const command = onCreate.mock.calls[0][0];
    expect(command.players).toHaveLength(5);
    expect(command.players[4]).toMatchObject({
      name: PLAYER_FACTIONS[4].name,
      factionId: PLAYER_FACTIONS[4].id,
      color: PLAYER_FACTIONS[4].color
    });
  });
});
