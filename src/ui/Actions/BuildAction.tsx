import type { Dispatch, SetStateAction } from "react";
import { COSTS, RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import { legalConvoyMoveFromEdges } from "../../domain/rules";
import type { GameState, Resources } from "../../domain/types";
import type { UiSelection, UiTool } from "../gameUiTypes";
import { AssetIcon } from "./AssetIcon";

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
  return (
    <section className="action-pane">
      <div className="tool-grid dock-tool-grid">
        <ToolButton tool={tool} id="transport" setTool={setTool} label="运输线" helper={formatCost(COSTS.transport)} iconUrl="/assets/hud/transport.v1.webp" />
        <ToolButton tool={tool} id="convoy" setTool={setTool} label="装甲车队" helper={formatCost(COSTS.convoy)} iconUrl="/assets/hud/convoy.v1.webp" />
        <button
          className="tool-card"
          disabled={legalConvoyMoveFromEdges(state).length === 0}
          onClick={() => {
            setTool("none");
            setSelection({ kind: "moveConvoy" });
          }}
        >
          <AssetIcon src="/assets/hud/convoy.v1.webp" className="tool-card-asset-icon" />
          <span>移动车队</span>
        </button>
        <ToolButton tool={tool} id="camp" setTool={setTool} label="营地" helper={formatCost(COSTS.camp)} iconUrl="/assets/hud/camp.v1.webp" />
        <ToolButton tool={tool} id="fortress" setTool={setTool} label="堡垒" helper={formatCost(COSTS.fortress)} iconUrl="/assets/hud/fortress.v1.webp" />
        <ToolButton tool={tool} id="watchtower" setTool={setTool} label="哨塔" helper={formatCost(COSTS.watchtower)} iconUrl="/assets/hud/watchtower.v1.webp" />
      </div>
      <p className="phase-copy">选择建造类型后，在中央棋盘点击合法边或交叉点。</p>
    </section>
  );
}

function ToolButton({
  tool,
  id,
  setTool,
  label,
  helper,
  iconUrl
}: {
  tool: UiTool;
  id: UiTool;
  setTool: (tool: UiTool) => void;
  label: string;
  helper: string;
  iconUrl: string;
}) {
  return (
    <button className={tool === id ? "selected tool-card" : "tool-card"} onClick={() => setTool(id)}>
      <AssetIcon src={iconUrl} className="tool-card-asset-icon" />
      <span>{label}</span>
      <small>{helper}</small>
    </button>
  );
}

function formatCost(cost: Partial<Resources>): string {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_LABELS[resource]}×${cost[resource]}`)
    .join(" ");
}
