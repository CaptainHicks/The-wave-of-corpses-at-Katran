import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PLAYER_FACTIONS } from "../../domain/constants";
import type { LobbyView } from "../../online/protocol";
import { StartScreen } from "../../ui/StartScreen";

function createOnlineProps(overrides: Partial<Parameters<typeof StartScreen>[0]["online"]> = {}) {
  return {
    busy: false,
    connectionState: "connected" as const,
    lobbyView: undefined,
    onCreateRoom: vi.fn(),
    onJoinRoom: vi.fn(),
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
  const result = render(
    <StartScreen
      hasSavedGame={options.hasSavedGame ?? false}
      savedGameSummary={options.hasSavedGame ? { turn: 7, currentPlayerName: "蓝钢哨站" } : undefined}
      onContinue={onContinue}
      onCreate={onCreate}
      online={online}
    />
  );

  return { ...result, onCreate, onContinue, online };
}

function enterHotSeatSetup() {
  fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
  fireEvent.click(screen.getByRole("button", { name: "本地热座" }));
}

function sampleLobbyView(overrides: Partial<LobbyView> = {}): LobbyView {
  return {
    kind: "lobby",
    viewerPlayerId: "p1",
    roomMeta: {
      roomCode: "ROOM42",
      hostPlayerId: "p1",
      status: "lobby",
      connectedPlayerIds: ["p1", "p2"],
      targetPlayerCount: 2,
      fogEnabled: false
    },
    seats: [
      { playerId: "p1", name: "蓝钢哨站", color: "#d84f3f", factionId: PLAYER_FACTIONS[0].id, connected: true },
      { playerId: "p2", name: "绿洲车队", color: "#2b78d4", factionId: PLAYER_FACTIONS[2].id, connected: true }
    ],
    canStart: true,
    ...overrides
  };
}

describe("StartScreen", () => {
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

  it("continues a saved game only when a saved game exists", () => {
    const { onContinue } = renderStartScreen({ hasSavedGame: true });

    expect(screen.getByText("第 7 回合 · 蓝钢哨站")).toBeInTheDocument();
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

  it("uses volume controls in settings instead of visual effect toggles", () => {
    renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByLabelText("游戏背景音乐音量")).toBeInTheDocument();
    expect(screen.getByLabelText("游戏音效音量")).toBeInTheDocument();
    expect(screen.queryByText("背景氛围")).not.toBeInTheDocument();
    expect(screen.queryByText("暗角强化")).not.toBeInTheDocument();
  });

  it("creates and joins online rooms from the setup panel", () => {
    const { online } = renderStartScreen();

    fireEvent.click(screen.getByRole("button", { name: "开始游戏" }));
    fireEvent.click(screen.getByRole("button", { name: "在线联机" }));

    fireEvent.change(screen.getByLabelText("在线玩家名称"), { target: { value: "测试房主" } });
    fireEvent.click(screen.getByRole("button", { name: "创建在线房间" }));

    expect(online?.onCreateRoom).toHaveBeenCalledWith({
      name: "测试房主",
      color: PLAYER_FACTIONS[0].color,
      factionId: PLAYER_FACTIONS[0].id,
      targetPlayerCount: 2,
      fogEnabled: false
    });

    fireEvent.change(screen.getByLabelText("在线房间码"), { target: { value: "room42" } });
    fireEvent.click(screen.getByRole("button", { name: "加入在线房间" }));

    expect(online?.onJoinRoom).toHaveBeenCalledWith({
      roomCode: "ROOM42",
      name: "测试房主",
      color: PLAYER_FACTIONS[0].color,
      factionId: PLAYER_FACTIONS[0].id
    });
  });

  it("renders the online lobby and lets the host start or leave", () => {
    const online = createOnlineProps({ lobbyView: sampleLobbyView() });
    renderStartScreen({ online });

    expect(screen.getByText("房间 ROOM42")).toBeInTheDocument();
    expect(screen.getByText(/当前 2\/2 人/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "房主开始游戏" }));
    expect(online.onStartRoom).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "离开房间" }));
    expect(online.onLeaveRoom).toHaveBeenCalledOnce();
  });

  it("creates a local hot-seat game with selected factions and default options off", () => {
    const { container, onCreate } = renderStartScreen();
    enterHotSeatSetup();
    const factionSelects = container.querySelectorAll<HTMLSelectElement>(".faction-select-row select");

    fireEvent.change(factionSelects[0], { target: { value: PLAYER_FACTIONS[3].id } });
    fireEvent.click(screen.getByRole("button", { name: "确认开局" }));

    expect(onCreate).toHaveBeenCalledOnce();
    const command = onCreate.mock.calls[0][0];
    expect(command.debugMode).toBe(false);
    expect(command.fogEnabled).toBe(false);
    expect(command.players[0]).toMatchObject({
      factionId: PLAYER_FACTIONS[3].id,
      color: PLAYER_FACTIONS[3].color
    });
    expect(command.players[3]?.factionId).toBeUndefined();
  });

  it("swaps factions when another active player already owns the selected faction", () => {
    const { container, onCreate } = renderStartScreen();
    enterHotSeatSetup();
    const factionSelects = container.querySelectorAll<HTMLSelectElement>(".faction-select-row select");

    fireEvent.change(factionSelects[0], { target: { value: PLAYER_FACTIONS[1].id } });
    fireEvent.click(screen.getByRole("button", { name: "确认开局" }));

    const command = onCreate.mock.calls[0][0];
    expect(command.players[0].factionId).toBe(PLAYER_FACTIONS[1].id);
    expect(command.players[1].factionId).toBe(PLAYER_FACTIONS[0].id);
  });
});
