import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { applyCommand } from "../../domain/rules";
import type { Command } from "../../domain/types";
import { buildOnlineGameView, type OnlineGameView } from "../../online/protocol";

const {
  pushEventsSpy,
  playAnimationEventsSpy,
  diffGameStatesSpy
} = vi.hoisted(() => ({
  pushEventsSpy: vi.fn(),
  playAnimationEventsSpy: vi.fn(),
  diffGameStatesSpy: vi.fn(() => [])
}));

type MockOnlineSession = {
  busy: boolean;
  error?: string;
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";
  view?: unknown;
  lobbyView?: unknown;
  gameView?: OnlineGameView;
  createRoom: ReturnType<typeof vi.fn>;
  joinRoom: ReturnType<typeof vi.fn>;
  chooseFaction: ReturnType<typeof vi.fn>;
  startRoom: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  leaveRoom: ReturnType<typeof vi.fn>;
  dismissError: ReturnType<typeof vi.fn>;
  resumeSavedSession: ReturnType<typeof vi.fn>;
};

let mockSession: MockOnlineSession = createOnlineSessionMock();

vi.mock("../../online/useOnlineSession", () => ({
  useOnlineSession: () => mockSession
}));

vi.mock("../../ui/animation/useGameAnimations", () => ({
  useGameAnimations: () => ({
    events: [],
    pushEvents: pushEventsSpy,
    isAnimating: false,
    reducedMotion: false
  })
}));

vi.mock("../../ui/animation/diffGameStates", () => ({
  diffGameStates: diffGameStatesSpy
}));

vi.mock("../../ui/audio/audioController", () => ({
  gameAudio: {
    playAnimationEvents: playAnimationEventsSpy
  }
}));

vi.mock("../../ui/audio/useAudio", () => ({
  useAudioUnlock: () => undefined,
  useInteractiveAudioFeedback: () => undefined,
  useMusicMode: () => undefined
}));

vi.mock("../../persistence/storage", () => ({
  loadGame: () => undefined,
  saveGame: () => undefined
}));

vi.mock("../../ui/GameShell", () => ({
  GameShell: () => <div data-testid="game-shell" />
}));

vi.mock("../../ui/StartScreen", () => ({
  StartScreen: () => <div data-testid="start-screen" />
}));

describe("App online animation sync", () => {
  it("does not replay the same online command animation after an unrelated rerender", async () => {
    pushEventsSpy.mockClear();
    playAnimationEventsSpy.mockClear();
    diffGameStatesSpy.mockClear();

    const setupView = createSetupView();
    const rolledView = createRolledView();

    mockSession = createOnlineSessionMock({ gameView: setupView });
    const { rerender } = render(<App />);

    await waitFor(() => expect(screen.getByTestId("game-shell")).toBeInTheDocument());
    expect(diffGameStatesSpy).not.toHaveBeenCalled();

    mockSession = createOnlineSessionMock({ gameView: rolledView });
    rerender(<App />);

    await waitFor(() => expect(diffGameStatesSpy).toHaveBeenCalledTimes(1));
    expect(pushEventsSpy).toHaveBeenCalledTimes(1);
    expect(playAnimationEventsSpy).toHaveBeenCalledTimes(1);

    mockSession = createOnlineSessionMock({
      gameView: rolledView,
      error: "temporary banner"
    });
    rerender(<App />);

    await waitFor(() => expect(screen.getByTestId("game-shell")).toBeInTheDocument());
    expect(diffGameStatesSpy).toHaveBeenCalledTimes(1);
    expect(pushEventsSpy).toHaveBeenCalledTimes(1);
    expect(playAnimationEventsSpy).toHaveBeenCalledTimes(1);
  });
});

function createOnlineSessionMock(overrides: Partial<MockOnlineSession> = {}): MockOnlineSession {
  return {
    busy: false,
    error: undefined,
    connectionState: "connected",
    view: undefined,
    lobbyView: undefined,
    gameView: undefined,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    chooseFaction: vi.fn(),
    startRoom: vi.fn(),
    sendCommand: vi.fn(),
    leaveRoom: vi.fn(),
    dismissError: vi.fn(),
    resumeSavedSession: vi.fn(),
    ...overrides
  };
}

function createSetupView(): OnlineGameView {
  let state = applyCommand(undefined, {
    type: "createGame",
    players: [
      { name: "玩家甲", color: "#d84f3f", factionId: "red-rust" },
      { name: "玩家乙", color: "#2b78d4", factionId: "blue-steel" }
    ],
    seed: "app-online-animation"
  });
  state = applyCommand(state, { type: "debugJumpPhase", phase: "dice" });

  return buildOnlineGameView(
    {
      roomCode: "ROOM-APP",
      hostPlayerId: "p1",
      status: "active",
      connectedPlayerIds: ["p1", "p2"]
    },
    state,
    "p1"
  );
}

function createRolledView(): OnlineGameView {
  let state = applyCommand(undefined, {
    type: "createGame",
    players: [
      { name: "玩家甲", color: "#d84f3f", factionId: "red-rust" },
      { name: "玩家乙", color: "#2b78d4", factionId: "blue-steel" }
    ],
    seed: "app-online-animation"
  });
  state = applyCommand(state, { type: "debugJumpPhase", phase: "dice" });
  const command: Extract<Command, { type: "rollDice" }> = { type: "rollDice", forced: [3, 4] };
  state = applyCommand(state, command);

  return buildOnlineGameView(
    {
      roomCode: "ROOM-APP",
      hostPlayerId: "p1",
      status: "active",
      connectedPlayerIds: ["p1", "p2"]
    },
    state,
    "p1",
    command
  );
}
