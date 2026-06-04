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
    "\u70b9\u51fb\u9a7b\u6709\u672a\u6fc0\u6d3b\u6c11\u5175\u7684\u5df1\u65b9\u8425\u5730\u6216\u5821\u5792\uff0c\u652f\u4ed8\u98df\u7269\u6fc0\u6d3b\uff1b\u672c\u56de\u5408\u521a\u6fc0\u6d3b\u7684\u6c11\u5175\u4e0d\u80fd\u4e3b\u52a8\u884c\u52a8\uff0c\u4f46\u53ef\u53c2\u4e0e\u5c38\u6f6e\u9632\u5fa1\u3002",
  move: "\u79fb\u52a8\u6c11\u5175",
  expel: "\u9a71\u9010\u5c38\u6f6e",
  commandHelp:
    "\u70b9\u51fb\u901a\u8fc7\u8fd0\u8f93\u7ebf\u6216\u88c5\u7532\u8f66\u961f\u76f8\u8fde\u7684\u8425\u5730/\u5821\u5792\uff0c\u79fb\u52a8\u5df2\u6fc0\u6d3b\u6c11\u5175\u3002"
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
  const expelMilitiaIds = legalExpelZombieMilitiaIds(state);
  const canMoveMilitia = active.some((militia) => legalMilitiaMoveVertices(state, militia.id).length > 0);
  const expelMilitiaId = expelMilitiaIds[0];

  return (
    <section className="action-pane">
      <div className="action-subsection">
        <h3>{COPY.recruitTitle}</h3>
        <button className="tool-card militia-option-card" onClick={() => setTool("recruit")}>
          <AssetIcon src="/assets/hud/militia.v1.webp" className="tool-card-asset-icon militia-option-asset-icon" />
          <span>{COPY.recruitButton}</span>
          <small>{formatCost(COSTS.militia)}</small>
        </button>
        <p className="phase-copy">{COPY.recruitHelp}</p>
      </div>

      <div className="action-subsection">
        <div className="button-grid militia-activation-block">
          <button
            className="tool-card militia-activate-card militia-option-card"
            disabled={inactive.length === 0}
            onClick={() => {
              setSelection(undefined);
              setTool("activateMilitia");
            }}
          >
            <AssetIcon src="/assets/hud/militia.v1.webp" className="tool-card-asset-icon militia-option-asset-icon" />
            <span>{COPY.activateButton}</span>
            <small>{formatCost(COSTS.activateMilitia)}</small>
          </button>
          <p className="phase-copy">{COPY.activateHelp}</p>
          <div className="inline-actions militia-command-row">
            <button
              disabled={!canMoveMilitia}
              onClick={() => {
                if (!canMoveMilitia) return;
                setTool("none");
                setSelection({ kind: "moveMilitia" });
              }}
            >
              <AssetIcon src="/assets/hud/militia.v1.webp" className="inline-action-asset-icon militia-command-asset-icon" />
              {COPY.move}
            </button>
            <button
              disabled={!expelMilitiaId}
              onClick={() => {
                if (!expelMilitiaId) return;
                setTool("none");
                setSelection({ kind: "expelZombie", militiaId: expelMilitiaId });
              }}
            >
              <AssetIcon
                src="/assets/board/markers/zombie-horde.v1.webp"
                className="inline-action-asset-icon militia-command-asset-icon militia-expel-asset-icon"
              />
              {COPY.expel}
            </button>
          </div>
          <p className="phase-copy">{COPY.commandHelp}</p>
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
