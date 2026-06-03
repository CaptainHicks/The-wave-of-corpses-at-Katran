import type { Dispatch, SetStateAction } from "react";
import { COSTS, RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import { legalExpelZombieMilitiaIds, legalMilitiaMoveVertices } from "../../domain/rules";
import type { Command, GameState, Resources } from "../../domain/types";
import type { UiSelection, UiTool } from "../gameUiTypes";
import { AssetIcon } from "./AssetIcon";

const COPY = {
  recruitTitle: "\u5f81\u53ec\u4e0e\u6fc0\u6d3b",
  recruitButton: "\u5f81\u53ec\u6c11\u5175",
  recruitHelp: "\u70b9\u51fb\u5df1\u65b9\u8425\u5730\u6216\u5821\u5792\u5f81\u53ec\u6c11\u5175\uff0c\u6bcf\u5904\u6700\u591a\u9a7b\u5b88 2 \u4e2a\u3002",
  activateButton: "\u6fc0\u6d3b\u6c11\u5175",
  activateHelp:
    "\u70b9\u51fb\u5df2\u5f81\u53ec\u6c11\u5175\u7684\u8425\u5730\u6216\u5821\u5792\u6fc0\u6d3b\u6c11\u5175\uff0c\u6fc0\u6d3b\u7684\u6c11\u5175\u4e0b\u56de\u5408\u624d\u80fd\u4f7f\u7528\u3002",
  move: "\u79fb\u52a8",
  expel: "\u9a71\u9010\u5c38\u6f6e",
  empty:
    "\u70b9\u51fb\u5df2\u5f81\u53ec\u6c11\u5175\u7684\u8425\u5730\u6216\u5821\u5792\u6fc0\u6d3b\u6c11\u5175\uff0c\u6fc0\u6d3b\u7684\u6c11\u5175\u4e0b\u56de\u5408\u624d\u80fd\u4f7f\u7528\u3002"
};

export function MilitiaAction({
  state,
  submit,
  setTool,
  setSelection
}: {
  state: GameState;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
}) {
  const player = state.players.find((item) => item.id === state.currentPlayerId)!;
  const inactive = player.militia.filter((militia) => militia.status === "inactive");
  const active = player.militia.filter((militia) => militia.status === "active");

  return (
    <section className="action-pane">
      <div className="action-subsection">
        <h3>{COPY.recruitTitle}</h3>
        <button className="tool-card" onClick={() => setTool("recruit")}>
          <AssetIcon src="/assets/hud/militia.v1.webp" className="tool-card-asset-icon" />
          <span>{COPY.recruitButton}</span>
          <small>{formatCost(COSTS.militia)}</small>
        </button>
        <p className="phase-copy">{COPY.recruitHelp}</p>
      </div>

      <div className="action-subsection">
        <div className="button-grid">
          <button
            className="tool-card militia-activate-card"
            disabled={inactive.length === 0}
            onClick={() => {
              setSelection(undefined);
              setTool("activateMilitia");
            }}
          >
            <AssetIcon src="/assets/hud/militia.v1.webp" className="tool-card-asset-icon" />
            <span>{COPY.activateButton}</span>
            <small>{formatCost(COSTS.activateMilitia)}</small>
          </button>
          {inactive.length > 0 && <p className="phase-copy">{COPY.activateHelp}</p>}
          {active.map((militia) => (
            <div key={militia.id} className="inline-actions militia-command-row">
              <button
                disabled={legalMilitiaMoveVertices(state, militia.id).length === 0}
                onClick={() => {
                  setTool("none");
                  setSelection({ kind: "moveMilitia", militiaId: militia.id });
                }}
              >
                <AssetIcon src="/assets/hud/militia.v1.webp" className="inline-action-asset-icon" />
                {COPY.move} {militia.id}
              </button>
              <button
                disabled={!legalExpelZombieMilitiaIds(state).includes(militia.id)}
                onClick={() => {
                  setTool("none");
                  setSelection({ kind: "expelZombie", militiaId: militia.id });
                }}
              >
                <AssetIcon src="/assets/board/markers/zombie-horde.v1.webp" className="inline-action-asset-icon" />
                {COPY.expel}
              </button>
            </div>
          ))}
          {inactive.length === 0 && active.length === 0 && <p className="muted-line">{COPY.empty}</p>}
        </div>
      </div>
    </section>
  );
}

function formatCost(cost: Partial<Resources>): string {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_LABELS[resource]}\u00d7${cost[resource]}`)
    .join(" ");
}
