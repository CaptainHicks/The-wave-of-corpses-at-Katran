import { Bug, Download, Import, RefreshCcw, Upload } from "lucide-react";
import { useState } from "react";
import { createResources } from "../../domain/constants";
import type { Command, GameState, Phase } from "../../domain/types";
import { clearSavedGame, exportGame, importGame } from "../../persistence/storage";
import { phaseLabels, type UiTool } from "../gameUiTypes";
import { AudioSettingsPanel } from "../audio/AudioSettingsPanel";

export function PersistencePanel({
  state,
  onClear,
  onImportState,
  submit,
  setTool
}: {
  state: GameState;
  onClear: () => void;
  onImportState: (state: GameState) => void;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
}) {
  const [importText, setImportText] = useState("");
  const current = state.players.find((player) => player.id === state.currentPlayerId)!;
  const debugEnabled = Boolean(state.debugMode);

  return (
    <section className="panel compact system-menu-content">
      <h2>
        <Bug size={18} />
        {debugEnabled ? "保存与调试" : "保存与系统"}
      </h2>

      <div className="system-menu-section">
        <div className="system-menu-section-heading">
          <span>声音设置</span>
          <small>本机偏好</small>
        </div>
        <AudioSettingsPanel className="system-audio-settings-panel" />
      </div>

      <div className="system-menu-section">
        <div className="system-menu-section-heading">
          <span>存档操作</span>
          <small>当前战局</small>
        </div>
        <div className="system-menu-action-grid">
          <button
            className="system-menu-action"
            onClick={() => {
              navigator.clipboard?.writeText(exportGame(state));
            }}
          >
            <Download size={16} />
            <span>复制JSON</span>
          </button>
          <button
            className="system-menu-action"
            onClick={() => {
              const blob = new Blob([exportGame(state)], { type: "application/json" });
              const href = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = href;
              a.download = "zombie-catan-save.json";
              a.click();
              URL.revokeObjectURL(href);
            }}
          >
            <Upload size={16} />
            <span>导出</span>
          </button>
          <button
            className="system-menu-action system-menu-action-danger"
            onClick={() => {
              clearSavedGame();
              onClear();
              setTool("none");
            }}
          >
            <RefreshCcw size={16} />
            <span>退出本局到主页面</span>
          </button>
        </div>
      </div>

      <div className="system-menu-section">
        <div className="system-menu-section-heading">
          <span>导入存档</span>
          <small>JSON</small>
        </div>
        <textarea
          aria-label="导入存档JSON"
          placeholder="粘贴存档JSON"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
        />
        <div className="system-menu-footer-row">
          <button className="system-menu-action system-menu-import-button" onClick={() => onImportState(importGame(importText))}>
            <Import size={16} />
            <span>导入JSON</span>
          </button>
        </div>
      </div>

      {debugEnabled ? (
        <div className="system-menu-section system-menu-debug-section">
          <div className="system-menu-section-heading">
            <span>调试工具</span>
            <small>{current.name}</small>
          </div>
          <div className="debug-row system-menu-debug-row">
            <button
              className="system-menu-action"
              onClick={() =>
                submit({
                  type: "debugSetResources",
                  playerId: current.id,
                  resources: createResources({ food: 8, wood: 8, metal: 8, fuel: 8, ammo: 8 })
                })
              }
            >
              补给当前玩家
            </button>
            <select
              value={state.phase}
              aria-label="调试阶段跳转"
              onChange={(event) => submit({ type: "debugJumpPhase", phase: event.target.value as Phase })}
            >
              {Object.keys(phaseLabels).map((phase) => (
                <option key={phase} value={phase}>
                  {phaseLabels[phase as Phase]}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="system-menu-section system-menu-debug-section">
          <div className="system-menu-section-heading">
            <span>调试工具</span>
            <small>关闭</small>
          </div>
          <p className="muted-line">调试模式未启用，作弊选项已隐藏。</p>
        </div>
      )}
    </section>
  );
}
