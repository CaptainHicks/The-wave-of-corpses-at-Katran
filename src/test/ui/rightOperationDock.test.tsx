import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResources } from "../../domain/constants";
import {
  applyCommand,
  legalBuildEdges,
  legalInitialCampVertices,
  legalInitialRouteEdges
} from "../../domain/rules";
import type { GameState } from "../../domain/types";
import { RightOperationDock } from "../../ui/Panels/RightOperationDock";

function minimalRollState() {
  return {
    phase: "dice",
    currentPlayerId: "p1",
    players: [{ id: "p1", name: "A", color: "#d84f3f" }]
  } as unknown as GameState;
}

function players() {
  return [
    { name: "A", color: "#d84f3f" },
    { name: "B", color: "#2b78d4" },
    { name: "C", color: "#209468" }
  ];
}

function setupActionState(): GameState {
  let state = applyCommand(undefined, { type: "createGame", players: players(), seed: "right-dock-icons" });
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  state = applyCommand(state, { type: "rollDice", forced: [1, 1] });
  return applyCommand(state, {
    type: "debugSetResources",
    playerId: state.currentPlayerId,
    resources: createResources({ food: 10, wood: 10, metal: 10, fuel: 10, ammo: 10 })
  });
}

describe("RightOperationDock", () => {
  afterEach(() => {
    cleanup();
  });

  it("places compact utility buttons before the main turn action", () => {
    const { container } = render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    const utilityRow = container.querySelector(".dock-utility-row");
    const mainButton = container.querySelector(".main-turn-button");

    expect(utilityRow).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建造成本" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "菜单" })).toBeInTheDocument();
    expect(utilityRow!.compareDocumentPosition(mainButton!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("opens system menu actions in a modal", () => {
    const onClear = vi.fn();
    const setTool = vi.fn();
    render(
      <RightOperationDock
        state={minimalRollState()}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={vi.fn()}
        onClear={onClear}
        onImportState={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "菜单" }));
    expect(screen.getByRole("dialog", { name: "系统菜单" })).toBeInTheDocument();
    expect(screen.getByLabelText("游戏背景音乐音量")).toBeInTheDocument();
    expect(screen.getByLabelText("游戏音效音量")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "退出本局到主页面" }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(setTool).toHaveBeenCalledWith("none");
  });

  it("only shows cheat controls for games created with debug mode", () => {
    const { container } = render(
      <RightOperationDock
        state={{ ...minimalRollState(), debugMode: false }}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    fireEvent.click(container.querySelector<HTMLButtonElement>(".dock-menu-button")!);
    expect(document.body.querySelector(".debug-row")).not.toBeInTheDocument();
    expect(container.querySelector(".debug-drawer")).not.toBeInTheDocument();

    cleanup();
    const debugRender = render(
      <RightOperationDock
        state={{ ...minimalRollState(), debugMode: true }}
        mode="mustRoll"
        tool="none"
        viewerPlayerId="p1"
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    fireEvent.click(debugRender.container.querySelector<HTMLButtonElement>(".dock-menu-button")!);
    expect(document.body.querySelector(".debug-row")).toBeInTheDocument();
    expect(debugRender.container.querySelector(".debug-drawer")).toBeInTheDocument();
  });

  it("refreshes right-side form state after the game state changes", async () => {
    const state = setupActionState();
    const nextState = applyCommand(state, {
      type: "debugSetResources",
      playerId: state.currentPlayerId,
      resources: createResources({ food: 8, wood: 8, metal: 8, fuel: 8, ammo: 8 })
    });
    const setTool = vi.fn();
    const setSelection = vi.fn();
    const { container, rerender } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );
    const selects = () => container.querySelectorAll<HTMLSelectElement>(".trade-row select");

    fireEvent.change(selects()[0], { target: { value: "metal" } });
    expect(selects()[0].value).toBe("metal");

    rerender(
      <RightOperationDock
        state={nextState}
        mode="freeAction"
        tool="none"
        viewerPlayerId={nextState.currentPlayerId}
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    await waitFor(() => expect(selects()[0].value).toBe(""));
    expect(setTool).toHaveBeenLastCalledWith("none");
    expect(setSelection).toHaveBeenLastCalledWith(undefined);
  });

  it("opens the trade panel without a prefilled offer", () => {
    const state = setupActionState();
    const { container } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    const selects = container.querySelectorAll<HTMLSelectElement>(".trade-row select");
    const bankTradeButton = container.querySelector<HTMLButtonElement>(".trade-row button");
    const offerCounts = container.querySelectorAll<HTMLElement>(".player-trade-box .resource-stepper b");
    const offerButton = container.querySelector<HTMLButtonElement>(".player-trade-box .inline-actions button");

    expect(selects[0].value).toBe("");
    expect(selects[1].value).toBe("");
    expect(bankTradeButton).toBeDisabled();
    expect([...offerCounts].every((item) => item.textContent === "0")).toBe(true);
    expect(offerButton).toBeDisabled();
  });

  it("clears stale board tools when a right-side action mutates the game", async () => {
    const state = setupActionState();
    const nextState = applyCommand(state, {
      type: "buildRoute",
      edgeId: legalBuildEdges(state, "transport")[0],
      routeType: "transport",
      free: true
    });
    const setTool = vi.fn();
    const setSelection = vi.fn();
    const { rerender } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="transport"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    rerender(
      <RightOperationDock
        state={nextState}
        mode="freeAction"
        tool="transport"
        viewerPlayerId={nextState.currentPlayerId}
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={setTool}
        setSelection={setSelection}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    await waitFor(() => expect(setTool).toHaveBeenLastCalledWith("none"));
    expect(setSelection).toHaveBeenLastCalledWith(undefined);
  });

  it("keeps circled controls text-only while preserving build tool asset icons", () => {
    const state = setupActionState();
    const { container } = render(
      <RightOperationDock
        state={state}
        mode="freeAction"
        tool="none"
        viewerPlayerId={state.currentPlayerId}
        interactionMode="hot-seat"
        animationBusy={false}
        submit={vi.fn()}
        setTool={vi.fn()}
        setSelection={vi.fn()}
        onClear={vi.fn()}
        onImportState={vi.fn()}
      />
    );

    expect(container.querySelector(".dock-cost-button img")).toBeNull();
    expect(container.querySelector(".action-tabs img")).toBeNull();
    expect(container.querySelector(".action-subsection h3 img")).toBeNull();
    expect(container.querySelector(".player-trade-box h3 img")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /建造/ }));

    expect(container.querySelector('.dock-tool-grid img[src="/assets/hud/transport.v1.webp"]')).toBeInTheDocument();
    expect(container.querySelector('.dock-tool-grid img[src="/assets/hud/convoy.v1.webp"]')).toBeInTheDocument();
    expect(container.querySelector('.dock-tool-grid img[src="/assets/hud/watchtower.v1.webp"]')).toBeInTheDocument();
    expect(legalBuildEdges(state, "transport").length).toBeGreaterThan(0);
  });
});
