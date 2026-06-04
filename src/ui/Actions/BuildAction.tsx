import { useEffect, type Dispatch, type SetStateAction } from "react";
import { COSTS, RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import { hasResources, legalConvoyMoveFromEdges } from "../../domain/rules";
import type { GameState, Resources } from "../../domain/types";
import type { UiSelection, UiTool } from "../gameUiTypes";
import { AssetIcon } from "./AssetIcon";

type BuildTool = Extract<UiTool, "transport" | "convoy" | "camp" | "fortress" | "watchtower">;

const BUILD_TOOL_COSTS: Record<BuildTool, Partial<Resources>> = {
  transport: COSTS.transport,
  convoy: COSTS.convoy,
  camp: COSTS.camp,
  fortress: COSTS.fortress,
  watchtower: COSTS.watchtower
};

export function BuildAction({
  state,
  tool,
  setTool,
  setSelection
}: {
  state: GameState;
  tool: UiTool;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
}) {
  const player = state.players.find((item) => item.id === state.currentPlayerId)!;
  const canAfford = (id: BuildTool) => hasResources(player.resources, BUILD_TOOL_COSTS[id]);

  useEffect(() => {
    if (!isBuildTool(tool) || canAfford(tool)) return;
    setTool("none");
    setSelection(undefined);
  }, [player.resources, setSelection, setTool, tool]);

  return (
    <section className="action-pane">
      <div className="tool-grid dock-tool-grid">
        <ToolButton tool={tool} id="transport" canAfford={canAfford("transport")} setTool={setTool} setSelection={setSelection} label="运输线" helper={formatCost(COSTS.transport)} iconUrl="/assets/hud/transport.v1.webp" />
        <div className="convoy-tool-row">
          <ToolButton tool={tool} id="convoy" canAfford={canAfford("convoy")} setTool={setTool} setSelection={setSelection} label="装甲车队" helper={formatCost(COSTS.convoy)} iconUrl="/assets/hud/convoy.v1.webp" />
          <button
            className="tool-card move-convoy-tool-card"
            disabled={legalConvoyMoveFromEdges(state).length === 0}
            onClick={() => {
              setTool("none");
              setSelection({ kind: "moveConvoy" });
            }}
          >
            <AssetIcon src="/assets/hud/convoy.v1.webp" className="tool-card-asset-icon" />
            <span>移动车队</span>
          </button>
        </div>
        <ToolButton tool={tool} id="camp" canAfford={canAfford("camp")} setTool={setTool} setSelection={setSelection} label="营地" helper={formatCost(COSTS.camp)} iconUrl="/assets/hud/camp.v1.webp" />
        <ToolButton tool={tool} id="fortress" canAfford={canAfford("fortress")} setTool={setTool} setSelection={setSelection} label="堡垒" helper={formatCost(COSTS.fortress)} iconUrl="/assets/hud/fortress.v1.webp" />
        <ToolButton tool={tool} id="watchtower" canAfford={canAfford("watchtower")} setTool={setTool} setSelection={setSelection} label="哨塔" helper={formatCost(COSTS.watchtower)} iconUrl="/assets/hud/watchtower.v1.webp" />
      </div>
      <p className="phase-copy">选择建造类型后，在中央棋盘点击合法边或交叉点。</p>
    </section>
  );
}

function ToolButton({
  tool,
  id,
  canAfford,
  setTool,
  setSelection,
  label,
  helper,
  iconUrl
}: {
  tool: UiTool;
  id: BuildTool;
  canAfford: boolean;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  label: string;
  helper: string;
  iconUrl: string;
}) {
  const isSelected = tool === id && canAfford;
  return (
    <button
      className={`${isSelected ? "selected " : ""}${canAfford ? "affordable " : ""}tool-card`}
      disabled={!canAfford}
      onClick={() => {
        if (!canAfford) return;
        setSelection(undefined);
        setTool(id);
      }}
    >
      <AssetIcon src={iconUrl} className={`tool-card-asset-icon tool-card-asset-icon-${id}`} />
      <span>{label}</span>
      <small>{helper}</small>
    </button>
  );
}

function isBuildTool(tool: UiTool): tool is BuildTool {
  return tool === "transport" || tool === "convoy" || tool === "camp" || tool === "fortress" || tool === "watchtower";
}

function formatCost(cost: Partial<Resources>): string {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_LABELS[resource]}×${cost[resource]}`)
    .join(" ");
}
