import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInteractiveAudioFeedback } from "../../ui/audio/useAudio";

const audioMocks = vi.hoisted(() => ({
  playHover: vi.fn(),
  playClick: vi.fn(),
  unlock: vi.fn()
}));

vi.mock("../../ui/audio/audioController", () => ({
  gameAudio: audioMocks
}));

function AudioFeedbackHarness() {
  useInteractiveAudioFeedback();

  return (
    <div>
      <button type="button">
        Alpha
        <span data-testid="alpha-label">label</span>
      </button>
      <div data-testid="blank">blank</div>
      <button type="button">Beta</button>
      <div
        data-testid="map-layer"
        onClickCapture={(event) => {
          if (event.target instanceof HTMLElement && event.target.dataset.dragSuppressed === "true") {
            event.stopPropagation();
          }
        }}
      >
        <div data-testid="tile" data-tile-id="tile-1">
          tile
        </div>
        <div data-testid="dragged-tile" data-drag-suppressed="true" data-tile-id="tile-2">
          dragged tile
        </div>
      </div>
    </div>
  );
}

describe("interactive audio feedback", () => {
  beforeEach(() => {
    audioMocks.playHover.mockClear();
    audioMocks.playClick.mockClear();
    audioMocks.unlock.mockClear();
  });

  it("plays hover again when the pointer leaves and re-enters the same button", () => {
    render(<AudioFeedbackHarness />);

    const alpha = screen.getByRole("button", { name: /Alpha/ });
    const blank = screen.getByTestId("blank");

    fireEvent.pointerOver(alpha);
    expect(audioMocks.playHover).toHaveBeenCalledTimes(1);

    fireEvent.pointerOut(alpha, { relatedTarget: blank });
    fireEvent.pointerOver(alpha, { relatedTarget: blank });

    expect(audioMocks.playHover).toHaveBeenCalledTimes(2);
  });

  it("does not replay hover while moving between descendants of the same button", () => {
    render(<AudioFeedbackHarness />);

    const alpha = screen.getByRole("button", { name: /Alpha/ });
    const alphaLabel = screen.getByTestId("alpha-label");

    fireEvent.pointerOver(alpha);
    fireEvent.pointerOver(alphaLabel, { relatedTarget: alpha });

    expect(audioMocks.playHover).toHaveBeenCalledTimes(1);
  });

  it("plays button click feedback on pointer down", () => {
    render(<AudioFeedbackHarness />);

    fireEvent.pointerDown(screen.getByRole("button", { name: /Alpha/ }));

    expect(audioMocks.unlock).toHaveBeenCalledTimes(1);
    expect(audioMocks.playClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to mouse down when pointer events do not drive the browser", () => {
    render(<AudioFeedbackHarness />);

    fireEvent.mouseDown(screen.getByRole("button", { name: /Alpha/ }));

    expect(audioMocks.unlock).toHaveBeenCalledTimes(1);
    expect(audioMocks.playClick).toHaveBeenCalledTimes(1);
  });

  it("plays board click feedback only after a real click", () => {
    render(<AudioFeedbackHarness />);

    const tile = screen.getByTestId("tile");

    fireEvent.pointerDown(tile);
    expect(audioMocks.playClick).not.toHaveBeenCalled();

    fireEvent.click(tile);
    expect(audioMocks.unlock).toHaveBeenCalledTimes(1);
    expect(audioMocks.playClick).toHaveBeenCalledTimes(1);
  });

  it("does not play board click feedback when dragging suppresses the click", () => {
    render(<AudioFeedbackHarness />);

    const draggedTile = screen.getByTestId("dragged-tile");

    fireEvent.pointerDown(draggedTile);
    fireEvent.click(draggedTile);

    expect(audioMocks.unlock).not.toHaveBeenCalled();
    expect(audioMocks.playClick).not.toHaveBeenCalled();
  });
});
