import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../domain/types";
import { DiceResultPanel } from "../../ui/Panels/DiceResultPanel";

const audioMocks = vi.hoisted(() => ({
  playSlotTick: vi.fn()
}));

vi.mock("../../ui/audio/audioController", () => ({
  gameAudio: {
    playSlotTick: audioMocks.playSlotTick
  }
}));

function stateWithDice(dice?: [number, number]): GameState {
  return { dice } as GameState;
}

describe("DiceResultPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    audioMocks.playSlotTick.mockClear();
  });

  it("plays slot ticks throughout the dice reel spin", () => {
    vi.useFakeTimers();
    render(<DiceResultPanel state={stateWithDice([3, 4])} mode="freeAction" />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(24);
  });

  it("cancels pending slot ticks when the dice result clears", () => {
    vi.useFakeTimers();
    const view = render(<DiceResultPanel state={stateWithDice([5, 6])} mode="freeAction" />);

    act(() => {
      vi.advanceTimersByTime(120);
    });
    view.rerender(<DiceResultPanel state={stateWithDice()} mode="mustRoll" />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(audioMocks.playSlotTick.mock.calls.length).toBeLessThan(24);
  });
});
