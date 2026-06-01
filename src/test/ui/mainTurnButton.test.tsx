import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../domain/types";
import { MainTurnButton } from "../../ui/Actions/MainTurnButton";

function stateWithPhase(phase: GameState["phase"]) {
  return { phase } as GameState;
}

describe("MainTurnButton", () => {
  it("uses the dice art treatment for rolling", () => {
    const { container, getByRole, getByText } = render(
      <MainTurnButton state={stateWithPhase("dice")} mode="mustRoll" animationBusy={false} submit={vi.fn()} />
    );

    expect(getByRole("button")).toHaveClass("illustrated-turn-button");
    expect(getByText("掷骰子")).toBeInTheDocument();
    expect(getByText("掷出两个骰子，获取资源")).toBeInTheDocument();
    expect(container.querySelector(".turn-button-art")).toHaveAttribute("src", "/assets/hud/dice.v1.webp");
  });

  it("uses the hourglass art treatment for ending the turn", () => {
    const { container, getByText } = render(
      <MainTurnButton state={stateWithPhase("action")} mode="freeAction" animationBusy={false} submit={vi.fn()} />
    );

    expect(getByText("结束回合")).toBeInTheDocument();
    expect(getByText("进入下一位玩家的回合")).toBeInTheDocument();
    expect(container.querySelector(".turn-button-art")).toHaveAttribute("src", "/assets/hud/hourglass.v1.webp");
  });
});
