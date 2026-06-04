import { describe, expect, it } from "vitest";
import { applyCommand, legalInitialCampVertices, legalInitialRouteEdges } from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { getOperationHint } from "../../ui/operationHints";

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function setupGame(): GameState {
  let state = applyCommand(undefined, { type: "createGame", players: players(), seed: "operation-hints" });
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  return state;
}

describe("getOperationHint", () => {
  it("does not show a top hint for obvious roll-only turns", () => {
    const state = setupGame();

    expect(getOperationHint(state, "none")).toBeUndefined();
  });

  it("prompts both militia movement steps", () => {
    const state = applyCommand(setupGame(), { type: "rollDice", forced: [1, 1] });

    expect(getOperationHint(state, "none", { kind: "moveMilitia" })).toBe(
      "先在地图上选择要移动的已激活民兵所在营地或堡垒"
    );
    expect(getOperationHint(state, "none", { kind: "moveMilitia", militiaId: "p1-militia-1" })).toBe(
      "再选择通过己方路线相连且可驻守的目标营地或堡垒"
    );
  });

  it("prompts resource selection pending choices before selected tools", () => {
    const state = setupGame();
    state.pending = { kind: "chooseResource", playerId: "p1", amount: 2, reason: "airdrop" };

    expect(getOperationHint(state, "transport")).toBe("请选择 2 张资源，完成当前待处理事项");
  });

  it("updates resource picker progress while a pending choice is open", () => {
    const state = setupGame();
    state.pending = { kind: "chooseResource", playerId: "p1", amount: 2, reason: "airdrop" };

    expect(getOperationHint(state, "none", undefined, { kind: "resourcePicker", mode: "choose", selected: 1, amount: 2 })).toBe(
      "还需要选择 1 张资源"
    );
    expect(getOperationHint(state, "none", undefined, { kind: "resourcePicker", mode: "choose", selected: 2, amount: 2 })).toBe(
      "已选满，点击确认完成"
    );
  });

  it("does not show a top hint for idle action tabs", () => {
    const state = applyCommand(setupGame(), { type: "rollDice", forced: [1, 1] });

    expect(getOperationHint(state, "none", undefined, { kind: "actionTab", tab: "trade" })).toBeUndefined();
  });

  it("prompts trade setup steps after the player starts configuring a trade", () => {
    const state = applyCommand(setupGame(), { type: "rollDice", forced: [1, 1] });

    expect(
      getOperationHint(state, "none", undefined, {
        kind: "bankTrade",
        give: "food",
        rate: 4,
        canTrade: false
      })
    ).toBe("再选择想获得的资源");
    expect(
      getOperationHint(state, "none", undefined, {
        kind: "playerTrade",
        target: "public",
        offerTotal: 1,
        requestTotal: 0
      })
    ).toBe("在“换取”里用加号选择你想要的资源");
  });

  it("does not show a top hint for the idle development shop", () => {
    const state = applyCommand(setupGame(), { type: "rollDice", forced: [1, 1] });

    expect(
      getOperationHint(state, "none", undefined, {
        kind: "developmentShop",
        canBuy: true,
        deckCount: 4
      })
    ).toBeUndefined();
  });

  it("prompts playable development cards in hand", () => {
    const state = applyCommand(setupGame(), { type: "rollDice", forced: [1, 1] });

    expect(
      getOperationHint(state, "none", undefined, {
        kind: "devCardHand",
        cardType: "requisition",
        playable: true
      })
    ).toBe("征用物资可打出。下一步选择一种要征用的资源");
  });
});
