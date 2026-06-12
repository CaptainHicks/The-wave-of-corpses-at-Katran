import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResources } from "../../domain/constants";
import {
  applyCommand,
  legalBuildEdges,
  legalInitialCampVertices,
  legalInitialRouteEdges
} from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { materializeOnlineGameState } from "../../online/clientState";
import { buildOnlineGameView } from "../../online/protocol";
import { RightOperationDock } from "../../ui/Panels/RightOperationDock";

const AUDIO_SETTINGS_KEY = "zombie-catan-audio-settings";

function minimalRollState() {
  return {
    phase: "dice",
    currentPlayerId: "p1",
    fogEnabled: true,
    debugMode: false,
    players: [
      { id: "p1", name: "A", color: "#d84f3f" },
      { id: "p2", name: "B", color: "#2b78d4" }
    ]
  } as unknown as GameState;
}

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function setupActionState(): GameState {
  let state = applyCommand(undefined, { type: "createGame", players: players(), seed: "right-dock-icons" });
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  state = applyCommand(state, { type: "rollDice", forced: [1, 1] });
  return applyCommand(state, {
    type: "debugSetResources",
    playerId: state.currentPlayerId,
    resources: createResources({ food: 10, wood: 10, metal: 10, fuel: 10, ammo: 10 })
  });
}

describe("RightOperationDock", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("locks the dock and shows a waiting panel when the active player cannot interact", () => {
    const state = setupActionState();
    render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={false}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText("等待其他玩家行动")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "玩家报价" })).toBeNull();
    expect(screen.queryByRole("tablist", { name: "行动分类" })).toBeNull();
    const mainButton = screen.getByRole("button", { name: /等待其他玩家/ });
    expect(mainButton).toBeDisabled();
  });

  it("places compact utility buttons before the main turn action", () => {
    const { container } = render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const utilityRow = container.querySelector(".dock-utility-row");
    const mainButton = container.querySelector(".main-turn-button");

    expect(utilityRow).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建造成本" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "菜单" })).toBeInTheDocument();
    expect(utilityRow!.compareDocumentPosition(mainButton!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows the per-player operation timer", () => {
    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        turnTimeRemaining={60}
        turnTimeLimit={60}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "操作倒计时" })).toHaveTextContent("1:00");
    expect(screen.getByText("A 超时后系统自动托管。")).toBeInTheDocument();
    expect(document.querySelector(".turn-timer-track i")).toHaveStyle({ "--turn-timer-progress": "1" });
  });

  it("opens system menu actions in a modal", () => {
    const onClear = vi.fn();
    const setTool = vi.fn();
    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={vi.fn()}
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "菜单" }));
    expect(screen.getByRole("dialog", { name: "系统菜单" })).toBeInTheDocument();
    expect(screen.getByLabelText("游戏背景音乐音量")).toBeInTheDocument();
    expect(screen.getByLabelText("游戏音效音量")).toBeInTheDocument();
    expect(screen.queryByText("复制JSON")).not.toBeInTheDocument();
    expect(screen.queryByText("导出")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("导入存档JSON")).not.toBeInTheDocument();
    expect(screen.getByText("当前模式")).toBeInTheDocument();
    expect(screen.getByText("12分")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /退出到主菜单/ }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(setTool).toHaveBeenCalledWith("none");
  });

  it("toggles the system menu mute button between mute and restore", () => {
    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "菜单" }));
    const musicSlider = screen.getByLabelText("游戏背景音乐音量") as HTMLInputElement;
    const sfxSlider = screen.getByLabelText("游戏音效音量") as HTMLInputElement;

    expect(musicSlider.value).toBe("70");
    expect(sfxSlider.value).toBe("80");

    fireEvent.click(screen.getByRole("button", { name: /一键静音/ }));

    expect(screen.getByRole("button", { name: /一键恢复音量/ })).toBeInTheDocument();
    expect(musicSlider.value).toBe("70");
    expect(sfxSlider.value).toBe("80");

    fireEvent.click(screen.getByRole("button", { name: /一键恢复音量/ }));

    expect(screen.getByRole("button", { name: /一键静音/ })).toBeInTheDocument();
    expect(musicSlider.value).toBe("70");
    expect(sfxSlider.value).toBe("80");
  });

  it("restores the player's previous custom volume from system menu mute", () => {
    window.localStorage.setItem(
      AUDIO_SETTINGS_KEY,
      JSON.stringify({ musicVolume: 35, sfxVolume: 45, muted: false, lastMusicVolume: 35, lastSfxVolume: 45 })
    );

    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "菜单" }));
    const musicSlider = screen.getByLabelText("游戏背景音乐音量") as HTMLInputElement;
    const sfxSlider = screen.getByLabelText("游戏音效音量") as HTMLInputElement;

    expect(musicSlider.value).toBe("35");
    expect(sfxSlider.value).toBe("45");

    fireEvent.click(screen.getByRole("button", { name: /一键静音/ }));
    fireEvent.click(screen.getByRole("button", { name: /一键恢复音量/ }));

    expect(musicSlider.value).toBe("35");
    expect(sfxSlider.value).toBe("45");
  });

  it("shows the updated in-game rules copy in the system menu", () => {
    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "菜单" }));
    fireEvent.click(screen.getByRole("button", { name: /查看规则说明/ }));

    expect(screen.getByRole("dialog", { name: "规则说明" })).toBeInTheDocument();
    expect(screen.getByText("率先在自己的回合达到 12 点胜利点即可获胜。")).toBeInTheDocument();
    expect(screen.getByText("尸潮来袭")).toBeInTheDocument();
    expect(screen.getByText("尸潮围城")).toBeInTheDocument();
    expect(screen.getByText(/尸潮标志移动到任意已翻开的地块/)).toBeInTheDocument();
    expect(screen.getByText(/围城强度等于全场堡垒总数/)).toBeInTheDocument();
    expect(screen.getByText("骰子点数等于地块数字时，相邻建筑获得资源。营地获得 1 张，堡垒获得 2 张。尸潮所在地块不产资源。")).toBeInTheDocument();
    expect(screen.getByText("每名玩家首次在非起始的新资源区建立营地时，额外获得 1 点胜利点；同一玩家在每个新资源区最多获得一次该奖励。")).toBeInTheDocument();
    expect(screen.getByText(/本回合刚激活的民兵会立即计入尸潮围城防御值/)).toBeInTheDocument();
    expect(screen.getByText(/必须等到自己的下一个回合，才能执行主动行动/)).toBeInTheDocument();
    expect(screen.getByText(/移动或驱逐完成后，该民兵会重新变为未激活状态/)).toBeInTheDocument();
    expect(screen.getByText("每回合最多使用 1 张发展卡，本回合购买的发展卡不能立刻使用。秘密据点在达到胜利条件时公开计分。")).toBeInTheDocument();
  });

  it("shows readable online room copy in the system menu during online play", () => {
    const onLeaveOnlineRoom = vi.fn();
    const onReconnectOnlineRoom = vi.fn();
    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="online"
        canInteract={true}
        onlineRoomCode="ROOM42"
        onlineConnectionState="connected"
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
        onReconnectOnlineRoom={onReconnectOnlineRoom}
        onLeaveOnlineRoom={onLeaveOnlineRoom}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "菜单" }));

    expect(screen.getByRole("dialog", { name: "暂停菜单" })).toBeInTheDocument();
    expect(screen.getByText("当前正在进行在线对局")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /回到战局/ })).toBeInTheDocument();
    expect(screen.getByText("房间状态")).toBeInTheDocument();
    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制房间码 ROOM42" })).toBeInTheDocument();
    expect(screen.getByText("规则与本局信息")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /查看规则说明/ })).toBeInTheDocument();
    expect(screen.getByText("当前模式")).toBeInTheDocument();
    expect(screen.getByText("在线联机")).toBeInTheDocument();
    expect(screen.getByText("12分")).toBeInTheDocument();
    expect(screen.getByLabelText("游戏背景音乐音量")).toBeInTheDocument();
    expect(screen.getByLabelText("游戏音效音量")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /离开在线房间/ }));
    expect(onLeaveOnlineRoom).toHaveBeenCalledOnce();
    expect(onReconnectOnlineRoom).not.toHaveBeenCalled();
  });

  it("offers reconnect and mute controls in the online pause menu", () => {
    const onReconnectOnlineRoom = vi.fn();
    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="online"
        canInteract={true}
        onlineRoomCode="ROOM42"
        onlineConnectionState="reconnecting"
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
        onReconnectOnlineRoom={onReconnectOnlineRoom}
        onLeaveOnlineRoom={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "重连中" }));
    expect(onReconnectOnlineRoom).toHaveBeenCalledOnce();

    const musicSlider = screen.getByLabelText("游戏背景音乐音量") as HTMLInputElement;
    const sfxSlider = screen.getByLabelText("游戏音效音量") as HTMLInputElement;
    expect(musicSlider.value).toBe("70");
    expect(sfxSlider.value).toBe("80");

    fireEvent.click(screen.getByRole("button", { name: /一键静音/ }));
    expect(screen.getByRole("button", { name: /一键恢复音量/ })).toBeInTheDocument();
  });

  it("only enables cheat controls for games created with debug mode", () => {
    const { container } = render(
      <RightOperationDock
        state={{ ...minimalRollState(), debugMode: false }}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(container.querySelector<HTMLButtonElement>(".dock-menu-button")!);
    expect(document.body.querySelector(".debug-row")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /补给当前玩家/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /推进尸潮围城进度/ })).toBeDisabled();
    expect(container.querySelector(".debug-drawer")).not.toBeInTheDocument();

    cleanup();
    const debugRender = render(
      <RightOperationDock
        state={{ ...minimalRollState(), debugMode: true }}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(debugRender.container.querySelector<HTMLButtonElement>(".dock-menu-button")!);
    expect(document.body.querySelector(".debug-row")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /补给当前玩家/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /推进尸潮围城进度/ })).toBeEnabled();
    expect(debugRender.container.querySelector(".debug-drawer")).toBeInTheDocument();
  });

  it("refreshes right-side form state after the game state changes", async () => {
    const state = setupActionState();
    const nextState = applyCommand(state, {
      type: "debugSetResources",
      playerId: state.currentPlayerId,
      resources: createResources({ food: 8, wood: 8, metal: 8, fuel: 8, ammo: 8 })
    });
    const setTool = vi.fn();
    const setSelection = vi.fn();
    const { container, rerender } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "银行 / 黑市" }));
    const giveMetal = () => within(screen.getByRole("group", { name: "选择支出" })).getByRole("button", { name: "金属" });

    fireEvent.click(giveMetal());
    expect(giveMetal()).toHaveAttribute("aria-pressed", "true");

    rerender(
      <RightOperationDock
        state={nextState}
        mode="freeAction"
        tool="none"
        viewerPlayerId={nextState.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "银行 / 黑市" }));
    await waitFor(() => expect(giveMetal()).toHaveAttribute("aria-pressed", "false"));
    expect(setTool).toHaveBeenLastCalledWith("none");
    expect(setSelection).toHaveBeenLastCalledWith(undefined);
  });

  it("shows development card controls inside the development action area without a temporary selection panel", () => {
    const state = setupActionState();
    const submit = vi.fn();
    const { container } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        selection={{ kind: "devRequisition", cardId: "req-card" }}
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={submit}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(container.querySelector(".dock-selection-panel")).toBeNull();
    expect(screen.getByRole("tab", { name: /发展/ })).toHaveAttribute("aria-selected", "true");
    const controls = container.querySelector(".development-card-controls");
    expect(controls).toBeTruthy();
    expect(screen.queryByText("征用物资")).not.toBeInTheDocument();
    fireEvent.click(within(controls as HTMLElement).getByRole("button", { name: "木材" }));

    expect(submit).toHaveBeenCalledWith({
      type: "playDevelopmentCard",
      cardId: "req-card",
      payload: { resource: "wood" }
    });
  });

  it("opens the trade panel without a prefilled offer", () => {
    const state = setupActionState();
    const { container } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const offerCounts = container.querySelectorAll<HTMLElement>(".player-trade-box .resource-stepper b");
    const offerButton = container.querySelector<HTMLButtonElement>(".player-trade-box .inline-actions button");
    const playerTradeButton = screen.getByRole("button", { name: "玩家报价" });
    const bankTradeButton = screen.getByRole("button", { name: "银行 / 黑市" });
    expect(bankTradeButton).toHaveAttribute("aria-pressed", "false");
    expect(playerTradeButton).toHaveAttribute("aria-pressed", "true");
    expect(playerTradeButton.compareDocumentPosition(bankTradeButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelector(".bank-resource-choices")).toBeNull();
    expect([...offerCounts].every((item) => item.textContent === "0")).toBe(true);
    expect(offerButton).toBeDisabled();
  });

  it("uses the last edited trade section for operation hints", async () => {
    const state = setupActionState();
    const setOperationContext = vi.fn();
    const { container } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        setOperationContext={setOperationContext}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "银行 / 黑市" }));
    const giveChoices = within(screen.getByRole("group", { name: "选择支出" }));
    const receiveChoices = within(screen.getByRole("group", { name: "选择获得" }));
    fireEvent.click(giveChoices.getByRole("button", { name: "食物" }));
    fireEvent.click(receiveChoices.getByRole("button", { name: "金属" }));

    await waitFor(() =>
      expect(setOperationContext).toHaveBeenLastCalledWith({
        kind: "bankTrade",
        give: "food",
        receive: "metal",
        rate: expect.any(Number),
        canTrade: true
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "玩家报价" }));
    const playerTradeBox = container.querySelector<HTMLElement>(".player-trade-box");
    expect(playerTradeBox).toBeTruthy();
    const offerEditor = playerTradeBox!.querySelector<HTMLElement>(".resource-editor");
    expect(offerEditor).toBeTruthy();
    fireEvent.click(within(offerEditor!).getByRole("button", { name: "食物增加" }));

    await waitFor(() =>
      expect(setOperationContext).toHaveBeenLastCalledWith({
        kind: "playerTrade",
        target: "public",
        offerTotal: 1,
        requestTotal: 0
      })
    );
  });

  it("enables buying development cards from an online materialized state", () => {
    const state = setupActionState();
    const submit = vi.fn();
    const view = buildOnlineGameView(
      {
        roomCode: "ROOM55",
        hostPlayerId: "p1",
        status: "active",
        connectedPlayerIds: ["p1", "p2", "p3"]
      },
      state,
      state.currentPlayerId
    );
    const onlineState = materializeOnlineGameState(view);

    render(
      <RightOperationDock
        state={onlineState}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="online"
        canInteract={true}
        animationBusy={false}
        submit={submit}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /发展/ }));
    const buyButton = screen.getByRole("button", { name: /购买发展卡/ });
    expect(buyButton).toBeEnabled();

    fireEvent.click(buyButton);
    expect(submit).toHaveBeenCalledWith({ type: "buyDevelopmentCard" });
  });

  it("uses recruit and activate wording in the militia panel", () => {
    const state = setupActionState();
    render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /民兵/ }));

    expect(screen.getByRole("heading", { name: "征召与激活" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /征召民兵/ })).toBeInTheDocument();
    expect(screen.getByText("点击己方营地或堡垒征召民兵，每处最多驻守 2 个。")).toBeInTheDocument();
    expect(screen.getByText("点击驻有未激活民兵的己方营地或堡垒，支付食物激活；本回合刚激活的民兵不能主动行动，但可参与尸潮防御。")).toBeInTheDocument();
    expect(document.querySelector(".militia-activation-block")).toContainElement(
      screen.getByText("点击驻有未激活民兵的己方营地或堡垒，支付食物激活；本回合刚激活的民兵不能主动行动，但可参与尸潮防御。")
    );
    expect(screen.queryByRole("heading", { name: "已部署民兵" })).not.toBeInTheDocument();
    expect(screen.queryByText("当前没有可指挥的民兵。")).not.toBeInTheDocument();
    expect(screen.queryByText(/部署/)).not.toBeInTheDocument();
  });

  it("clears stale board tools when a right-side action mutates the game", async () => {
    const state = setupActionState();
    const nextState = applyCommand(state, {
      type: "buildRoute",
      edgeId: legalBuildEdges(state, "transport")[0],
      routeType: "transport",
      free: true
    });
    const setTool = vi.fn();
    const setSelection = vi.fn();
    const { rerender } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="transport"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
      />
    );

    rerender(
      <RightOperationDock
        state={nextState}
        mode="freeAction"
        tool="transport"
        viewerPlayerId={nextState.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
      />
    );

    await waitFor(() => expect(setTool).toHaveBeenLastCalledWith("none"));
    expect(setSelection).toHaveBeenLastCalledWith(undefined);
  });

  it("keeps circled controls text-only while preserving build tool asset icons", () => {
    const state = setupActionState();
    const { container } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(container.querySelector(".dock-cost-button img")).toBeNull();
    expect(container.querySelector(".action-tabs img")).toBeNull();
    expect(container.querySelector(".action-subsection h3 img")).toBeNull();
    expect(container.querySelector(".player-trade-box h3 img")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /建造/ }));

    expect(container.querySelector('.dock-tool-grid img[src="/assets/hud/transport.v1.webp"]')).toBeInTheDocument();
    expect(container.querySelector('.dock-tool-grid img[src="/assets/hud/convoy.v1.webp"]')).toBeInTheDocument();
    expect(container.querySelector('.dock-tool-grid img[src="/assets/hud/watchtower.v1.webp"]')).toBeInTheDocument();
    const convoyToolRow = container.querySelector(".convoy-tool-row");
    expect(convoyToolRow).toBeInTheDocument();
    expect(within(convoyToolRow as HTMLElement).getByRole("button", { name: /装甲车队/ })).toBeInTheDocument();
    expect(within(convoyToolRow as HTMLElement).getByRole("button", { name: /移动车队/ })).toBeInTheDocument();
    expect(legalBuildEdges(state, "transport").length).toBeGreaterThan(0);
  });

  it("only enables build tools when the player can pay their cost", () => {
    const state = applyCommand(setupActionState(), {
      type: "debugSetResources",
      playerId: "p1",
      resources: createResources()
    });
    const setTool = vi.fn();
    const setSelection = vi.fn();
    render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /建造/ }));
    setTool.mockClear();
    setSelection.mockClear();

    const transportButton = screen.getByRole("button", { name: /运输线/ });
    const campButton = screen.getByRole("button", { name: /营地/ });
    expect(transportButton).toBeDisabled();
    expect(campButton).toBeDisabled();

    fireEvent.click(transportButton);

    expect(setTool).not.toHaveBeenCalledWith("transport");
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("clears move convoy selection when another build tool is chosen", () => {
    let state = setupActionState();
    state = applyCommand(state, {
      type: "buildRoute",
      edgeId: legalBuildEdges(state, "convoy")[0],
      routeType: "convoy",
      free: true
    });
    const setTool = vi.fn();
    const setSelection = vi.fn();
    render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        canInteract={true}
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /建造/ }));
    fireEvent.click(screen.getByRole("button", { name: /移动车队/ }));
    expect(setSelection).toHaveBeenLastCalledWith({ kind: "moveConvoy" });

    fireEvent.click(screen.getByRole("button", { name: /运输线/ }));

    expect(setSelection).toHaveBeenLastCalledWith(undefined);
    expect(setTool).toHaveBeenLastCalledWith("transport");
  });
});
