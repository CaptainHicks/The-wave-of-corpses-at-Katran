import { Hammer, X } from "lucide-react";
import { COSTS, RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import type { Resource, Resources } from "../../domain/types";
import { resourceIconAssets } from "../art/assetManifest";

type CostKey =
  | "transport"
  | "convoy"
  | "camp"
  | "fortress"
  | "watchtower"
  | "militia"
  | "activateMilitia"
  | "devCard";

const COST_ITEMS: Array<{ key: CostKey; label: string; note: string; iconUrl: string }> = [
  { key: "transport", label: "运输线", note: "连接网络，计入最长补给线", iconUrl: "/assets/hud/transport.v1.webp" },
  { key: "convoy", label: "装甲车队", note: "可移动，能探索迷雾", iconUrl: "/assets/hud/convoy.v1.webp" },
  { key: "camp", label: "营地", note: "产出1张资源，值1分", iconUrl: "/assets/hud/camp.v1.webp" },
  { key: "fortress", label: "堡垒升级", note: "产出翻倍，值2分", iconUrl: "/assets/hud/fortress.v1.webp" },
  { key: "watchtower", label: "哨塔", note: "每座让手牌上限+2", iconUrl: "/assets/hud/watchtower.v1.webp" },
  { key: "militia", label: "征召民兵", note: "驻守己方建筑，每处最多2个", iconUrl: "/assets/hud/militia.v1.webp" },
  { key: "activateMilitia", label: "激活民兵", note: "参与防御，之后可移动/驱逐", iconUrl: "/assets/hud/militia.v1.webp" },
  { key: "devCard", label: "购买发展卡", note: "抽取发展卡，下回合可用", iconUrl: "/assets/hud/dev-card-back.v1.webp" }
];

export function BuildCostPanel({ onClose }: { onClose: () => void }) {
  return (
    <section className="themed-modal build-cost-modal" role="dialog" aria-modal="true" aria-labelledby="build-cost-title">
      <header className="build-cost-header">
        <div className="build-cost-heading">
          <span className="build-cost-emblem" aria-hidden="true">
            <Hammer size={21} />
          </span>
          <div>
            <span className="build-cost-kicker">工事手册</span>
            <h2 id="build-cost-title">建造成本</h2>
          </div>
        </div>
        <button type="button" className="icon-button modal-close-button" aria-label="关闭建造成本" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="cost-table">
        {COST_ITEMS.map((item) => {
          const tokens = getCostTokens(COSTS[item.key]);
          return (
            <div className={`cost-row cost-row-${item.key}`} key={item.key} aria-label={`${item.label}：${formatCost(COSTS[item.key])}`}>
              <span className="cost-piece-icon" aria-hidden="true">
                <img src={item.iconUrl} alt="" draggable={false} />
              </span>
              <span className="cost-row-copy">
                <span className="cost-row-label">{item.label}</span>
                <small>{item.note}</small>
              </span>
              <span className="cost-resource-list">
                {tokens.map((token) => (
                  <span className={`cost-resource-chip resource-${token.resource}`} key={token.resource} title={`${token.label} × ${token.amount}`}>
                    {token.iconUrl ? <img src={token.iconUrl} alt="" draggable={false} /> : <span aria-hidden="true">{token.fallbackLabel}</span>}
                    <span className="sr-only">{token.label}</span>
                    <strong>×{token.amount}</strong>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatCost(cost: Partial<Resources>): string {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_LABELS[resource]}×${cost[resource]}`)
    .join(" / ");
}

function getCostTokens(cost: Partial<Resources>) {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0).map((resource) => {
    const asset = resourceIconAssets[resource];
    return {
      resource,
      label: RESOURCE_LABELS[resource],
      amount: cost[resource] ?? 0,
      fallbackLabel: asset.fallbackLabel,
      iconUrl: asset.imageUrl
    } satisfies {
      resource: Resource;
      label: string;
      amount: number;
      fallbackLabel: string;
      iconUrl?: string;
    };
  });
}
