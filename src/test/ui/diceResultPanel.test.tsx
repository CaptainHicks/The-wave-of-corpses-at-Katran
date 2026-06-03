import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function runAnimationFrame(timeMs: number): void {
  act(() => {
    const callbacks = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    callbacks.forEach((callback) => callback(timeMs));
  });
}

describe("DiceResultPanel", () => {
  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextRafId;
      nextRafId += 1;
      rafCallbacks.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      rafCallbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    audioMocks.playSlotTick.mockClear();
  });

  it("plays slot ticks as the reel animation crosses row boundaries", () => {
    render(<DiceResultPanel state={stateWithDice([3, 4])} mode="freeAction" />);

    runAnimationFrame(99);
    expect(audioMocks.playSlotTick).not.toHaveBeenCalled();

    runAnimationFrame(129);
    expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(1);

    runAnimationFrame(229);
    expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(2);

    runAnimationFrame(329);
    expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(3);

    for (let step = 4; step <= 18; step += 1) {
      runAnimationFrame(step * 100 + 29);
      expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(step);
    }

    runAnimationFrame(1900);
    expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(18);

    runAnimationFrame(2100);
    expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(18);
  });

  it("cancels pending slot ticks when the dice result clears", () => {
    const view = render(<DiceResultPanel state={stateWithDice([5, 6])} mode="freeAction" />);

    runAnimationFrame(129);
    const callsBeforeClear = audioMocks.playSlotTick.mock.calls.length;
    view.rerender(<DiceResultPanel state={stateWithDice()} mode="mustRoll" />);

    runAnimationFrame(1900);

    expect(audioMocks.playSlotTick).toHaveBeenCalledTimes(callsBeforeClear);
  });
});
