import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";

vi.mock("../../online/useOnlineSession", () => ({
  useOnlineSession: () => ({
    busy: false,
    error: undefined,
    connectionState: "disconnected",
    lobbyView: undefined,
    gameView: undefined,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    chooseFaction: vi.fn(),
    startRoom: vi.fn(),
    sendCommand: vi.fn(),
    leaveRoom: vi.fn(),
    dismissError: vi.fn(),
    resumeSavedSession: vi.fn()
  })
}));

vi.mock("../../ui/animation/useGameAnimations", () => ({
  useGameAnimations: () => ({
    events: [],
    pushEvents: vi.fn(),
    isAnimating: false,
    reducedMotion: false
  })
}));

vi.mock("../../ui/animation/diffGameStates", () => ({
  diffGameStates: () => []
}));

vi.mock("../../ui/audio/audioController", () => ({
  gameAudio: {
    playAnimationEvents: vi.fn()
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

vi.mock("../../ui/StartScreen", () => ({
  StartScreen: ({ onCreate }: { onCreate: (command: unknown) => void }) => (
    <button
      type="button"
      data-testid="start-local-game"
      onClick={() =>
        onCreate({
          type: "createGame",
          players: [
            { name: "A", color: "#d84f3f", factionId: "red-rust" },
            { name: "B", color: "#2b78d4", factionId: "blue-steel" }
          ],
          seed: "app-rule-hint"
        })
      }
    >
      start
    </button>
  )
}));

vi.mock("../../ui/GameShell", () => ({
  GameShell: ({
    error,
    ruleHint,
    operationHint,
    onDismissError,
    onReportError,
    submit
  }: {
    error?: string;
    ruleHint?: string;
    operationHint?: string;
    onDismissError: () => void;
    onReportError?: (message: string) => void;
    submit: (command: unknown) => void;
  }) => (
    <div>
      <button type="button" data-testid="show-rule-hint" onClick={() => onReportError?.("测试规则提示")}>
        show
      </button>
      <button type="button" data-testid="jump-development" onClick={() => submit({ type: "debugJumpPhase", phase: "development" })}>
        jump
      </button>
      <button type="button" data-testid="buy-dev-card" onClick={() => submit({ type: "buyDevelopmentCard" })}>
        buy
      </button>
      {ruleHint ? <div data-testid="rule-hint">{ruleHint}</div> : null}
      {operationHint ? <div data-testid="operation-hint">{operationHint}</div> : null}
      {error ? (
        <div data-testid="shell-error">
          <span>{error}</span>
          <button type="button" onClick={onDismissError}>
            {"关闭"}
          </button>
        </div>
      ) : null}
    </div>
  )
}));

describe("App rule hints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto dismisses board rule hints after a short delay", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("start-local-game"));
    fireEvent.click(screen.getByTestId("show-rule-hint"));

    expect(screen.getByTestId("rule-hint")).toHaveTextContent("测试规则提示");

    act(() => {
      vi.advanceTimersByTime(2399);
    });
    expect(screen.getByTestId("rule-hint")).toHaveTextContent("测试规则提示");

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByTestId("rule-hint")).not.toBeInTheDocument();
  });

  it("keeps operation hints separate from temporary rule hints", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("start-local-game"));

    expect(screen.getByTestId("operation-hint")).toHaveTextContent("请选择一个合法交叉点放置初始营地");

    fireEvent.click(screen.getByTestId("show-rule-hint"));
    expect(screen.getByTestId("rule-hint")).toHaveTextContent("测试规则提示");
    expect(screen.getByTestId("operation-hint")).toHaveTextContent("请选择一个合法交叉点放置初始营地");

    act(() => {
      vi.advanceTimersByTime(2401);
    });

    expect(screen.queryByTestId("rule-hint")).not.toBeInTheDocument();
    expect(screen.getByTestId("operation-hint")).toHaveTextContent("请选择一个合法交叉点放置初始营地");
  });

  it("shows local command rule errors as auto dismissing hints without a close action", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("start-local-game"));
    fireEvent.click(screen.getByTestId("jump-development"));
    fireEvent.click(screen.getByTestId("buy-dev-card"));

    expect(screen.getByTestId("rule-hint")).toHaveTextContent("资源不足。");
    expect(screen.queryByTestId("shell-error")).not.toBeInTheDocument();
    expect(screen.queryByText("关闭")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2401);
    });
    expect(screen.queryByTestId("rule-hint")).not.toBeInTheDocument();
  });
});
