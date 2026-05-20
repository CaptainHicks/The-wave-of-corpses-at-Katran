import { Check, X } from "lucide-react";
import { RESOURCE_LABELS, RESOURCES } from "../../domain/constants";
import type { Resources } from "../../domain/types";

export function TradeOfferModal({
  actorName,
  responderName,
  remainingNames,
  offer,
  request,
  responderResources,
  onAccept,
  onReject
}: {
  actorName?: string;
  responderName?: string;
  remainingNames: string[];
  offer: Partial<Resources>;
  request: Partial<Resources>;
  responderResources?: Resources;
  onAccept: () => void;
  onReject: () => void;
}) {
  const responderCanPay = canPayBundle(responderResources, request);

  return (
    <div className="themed-modal trade-offer-modal">
      <header>
        <span>公开报价</span>
        <strong>{responderName} 回应</strong>
      </header>
      <div className="trade-offer-grid">
        <div>
          <small>{actorName} 给出</small>
          <b>{formatResourceBundle(offer)}</b>
        </div>
        <div>
          <small>{actorName} 要求</small>
          <b>{formatResourceBundle(request)}</b>
        </div>
      </div>
      <p className="muted-line">
        {remainingNames.length > 0 ? `若拒绝，之后轮到 ${remainingNames.join("、")}。` : "这是最后一位响应玩家。"}
      </p>
      <p className={responderCanPay ? "pending-status ok" : "pending-status blocked"}>
        {responderCanPay ? "资源足够，可以接受。" : "资源不足，不能接受这份报价。"}
      </p>
      <div className="inline-actions">
        <button className="primary" disabled={!responderCanPay} onClick={onAccept}>
          <Check size={16} />
          接受交易
        </button>
        <button onClick={onReject}>
          <X size={16} />
          拒绝
        </button>
      </div>
    </div>
  );
}

function formatResourceBundle(resources: Partial<Resources>): string {
  const parts = RESOURCES
    .filter((resource) => (resources[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_LABELS[resource]}×${resources[resource]}`);
  return parts.length > 0 ? parts.join("、") : "无";
}

function canPayBundle(resources: Resources | undefined, bundle: Partial<Resources>): boolean {
  if (!resources) return false;
  return RESOURCES.every((resource) => resources[resource] >= (bundle[resource] ?? 0));
}
