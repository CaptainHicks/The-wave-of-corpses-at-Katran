import type { CSSProperties } from "react";
import { RESOURCE_LABELS } from "../../domain/constants";
import type { Resource } from "../../domain/types";
import { resourceCardAssets } from "../art/assetManifest";

export function ResourceCardStack({
  resource,
  amount,
  changed
}: {
  resource: Resource;
  amount: number;
  changed: boolean;
}) {
  const asset = resourceCardAssets[resource];
  const style = { "--card-fallback": asset.fallbackColor } as CSSProperties;

  return (
    <article
      className={`resource-card-stack ${amount === 0 ? "empty" : ""} ${changed ? "changed" : ""}`}
      style={style}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      data-resource-card={resource}
      aria-label={`${RESOURCE_LABELS[resource]} ${amount} 张`}
    >
      <span className="card-face-art" aria-hidden="true">
        {asset.imageUrl ? (
          <img src={asset.imageUrl} alt="" draggable={false} />
        ) : (
          <span className="card-face-fallback">{asset.fallbackLabel}</span>
        )}
      </span>
      <strong className="card-count">{amount}</strong>
    </article>
  );
}
