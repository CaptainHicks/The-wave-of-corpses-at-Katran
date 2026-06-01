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
    ruleHint,
    onReportError
  }: {
    ruleHint?: string;
    onReportError?: (message: string) => void;
  }) => (
    <div>
      <button type="button" data-testid="show-rule-hint" onClick={() => onReportError?.("测试规则提示")}>
        show
      </button>
      {ruleHint ? <div data-testid="rule-hint">{ruleHint}</div> : null}
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
});
