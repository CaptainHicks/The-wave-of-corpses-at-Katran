import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../../App";
import { applyCommand } from "../../domain/rules";
import { clearSavedGame, saveGame } from "../../persistence/storage";

function savedState() {
  return applyCommand(
    undefined,
    {
      type: "createGame",
      players: [
        { name: "赤锈营地", color: "#d84f3f" },
        { name: "蓝钢哨站", color: "#2b78d4" },
        { name: "绿洲车队", color: "#209468" }
      ],
      seed: "app-start-menu"
    }
  );
}

describe("App start menu", () => {
  afterEach(() => {
    cleanup();
    clearSavedGame();
  });

  it("starts on the main menu even when a saved game exists, then continues on request", () => {
    saveGame(savedState());

    const { container } = render(<App />);

    expect(screen.getByRole("button", { name: "继续游戏" })).toBeEnabled();
    expect(container.querySelector(".game-shell")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "继续游戏" }));

    expect(container.querySelector(".game-shell")).toBeInTheDocument();
  });
});
