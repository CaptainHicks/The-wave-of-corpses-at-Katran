import { Package } from "lucide-react";
import { RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import type { GameState } from "../../domain/types";
import { resourceIconAssets } from "../art/assetManifest";

export function ResourceInfoPanel({
  state,
  viewerPlayerId = state.currentPlayerId
}: {
  state: GameState;
  viewerPlayerId?: string;
}) {
  const viewer = state.players.find((player) => player.id === viewerPlayerId);
  const resources = viewer?.resources;

  return (
    <section className="panel compact rail-section resource-info-panel" aria-label="当前资源">
      <h2>
        <Package size={18} />
        当前资源
        <span className="resource-owner">{viewer?.name ?? "-"}</span>
      </h2>
      <div className="rail-resource-grid">
        {RESOURCES.map((resource) => {
          const asset = resourceIconAssets[resource];
          const amount = resources?.[resource] ?? 0;

          return (
            <div
              key={resource}
              className={`rail-resource-item resource-${resource} ${amount === 0 ? "empty" : ""}`}
              aria-label={`${RESOURCE_LABELS[resource]} ${amount}`}
              title={`${RESOURCE_LABELS[resource]} ${amount}`}
            >
              <span className="rail-resource-icon" aria-hidden="true">
                {asset.imageUrl ? (
                  <img src={asset.imageUrl} alt="" draggable={false} />
                ) : (
                  <span className="rail-resource-fallback">{asset.fallbackLabel}</span>
                )}
              </span>
              <span className="rail-resource-label">{RESOURCE_LABELS[resource]}</span>
              <strong>{amount}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
