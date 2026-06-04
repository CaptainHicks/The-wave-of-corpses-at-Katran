import { DEV_CARD_LABELS, RESOURCE_LABELS } from "../domain/constants";
import type { GameState } from "../domain/types";
import type { UiOperationContext, UiSelection, UiTool } from "./gameUiTypes";

export function getOperationHint(
  state: GameState,
  tool: UiTool,
  selection?: UiSelection,
  operationContext?: UiOperationContext
) {
  return stripTrailingPunctuation(getRawOperationHint(state, tool, selection, operationContext));
}

function getRawOperationHint(
  state: GameState,
  tool: UiTool,
  selection?: UiSelection,
  operationContext?: UiOperationContext
) {
  if (state.phase === "victory") return undefined;

  if (operationContext?.kind === "resourcePicker") {
    return getOperationContextHint(operationContext);
  }

  if (state.pending) {
    return getPendingHint(state.pending);
  }

  if (selection) {
    return getSelectionHint(selection);
  }

  if (tool !== "none") {
    return toolHints[tool];
  }

  if (operationContext) {
    return getOperationContextHint(operationContext);
  }

  if (state.phase === "setup") {
    return "请选择一个合法交叉点放置初始营地。";
  }

  return undefined;
}

function stripTrailingPunctuation(hint: string | undefined) {
  return hint?.trim().replace(/[。.]$/, "");
}

function getPendingHint(pending: NonNullable<GameState["pending"]>) {
  if (pending.kind === "setupRoute") {
    return "请选择一条连接刚放置营地的合法资源边，放置初始运输线。";
  }
  if (pending.kind === "chooseResource") {
    return `请选择 ${pending.amount} 张资源，完成当前待处理事项。`;
  }
  if (pending.kind === "discard") {
    return `请选择要弃掉的 ${pending.amount} 张资源。`;
  }
  if (pending.kind === "moveZombie") {
    return "请选择一个已翻开的地块，移动尸潮。";
  }
  if (pending.kind === "stealResource") {
    return "请选择一名相邻玩家随机抽取 1 张资源，或选择跳过。";
  }
  if (pending.kind === "confirmTrade") {
    return "请确认是否接受这笔交易。";
  }
  if (pending.kind === "downgradeFortress") {
    return "请选择一座带高亮的己方堡垒，将其降级为营地。";
  }

  return undefined;
}

function getSelectionHint(selection: UiSelection) {
  if (selection.kind === "moveConvoy") {
    return selection.fromEdgeId ? "再选择装甲车队要移动到的合法边。" : "先在地图上选择要移动的己方装甲车队。";
  }
  if (selection.kind === "moveMilitia") {
    return selection.militiaId
      ? "再选择通过己方路线相连且可驻守的目标营地或堡垒。"
      : "先在地图上选择要移动的已激活民兵所在营地或堡垒。";
  }
  if (selection.kind === "expelZombie") {
    return "请选择尸潮要被驱逐到的另一个已翻开地块。";
  }
  if (selection.kind === "devMerchant") {
    return "请选择商人要移动到的已翻开资源地块。";
  }
  if (selection.kind === "devMilitia") {
    return "请选择民兵动员要部署的己方营地或堡垒，最多 2 个。";
  }
  if (selection.kind === "devRequisition") {
    return "请选择一种资源，征用所有其他玩家手中的该资源。";
  }
  if (selection.kind === "devRoadCrew") {
    return selection.routes.length > 0 ? "可继续选择第二条路线，或使用已选路线。" : "选择开路队要免费建造的第一条路线。";
  }

  return undefined;
}

const toolHints: Record<Exclude<UiTool, "none">, string> = {
  initialCamp: "请选择一个合法交叉点放置初始营地。",
  initialRoute: "请选择一条连接刚放置营地的合法资源边。",
  transport: "在地图上点击合法边，建造运输线。",
  convoy: "在地图上点击合法边，建造装甲车队。",
  camp: "在地图上点击连通己方路线且符合距离规则的交叉点建造营地。",
  fortress: "点击己方营地，将其升级为堡垒。",
  watchtower: "点击己方营地或堡垒，建造哨塔。",
  recruit: "点击己方营地或堡垒征召民兵，每处最多驻守 2 个。",
  activateMilitia: "点击驻有未激活民兵的己方营地或堡垒，激活 1 个民兵。",
  merchant: "点击已翻开的资源地块移动商人。",
  zombie: "点击一个已翻开的地块，移动尸潮。"
};

function getOperationContextHint(context: UiOperationContext) {
  if (context.kind === "actionTab") {
    return undefined;
  }

  if (context.kind === "bankTrade") {
    if (!context.give) return "先选择要支出的资源。";
    if (!context.receive) return "再选择想获得的资源。";
    if (context.give === context.receive) return "支出和获得不能是同一种资源。";
    if (!context.canTrade) return `资源不足，当前需要 ${context.rate} 个${RESOURCE_LABELS[context.give]}才能兑换。`;
    return `点击 ${context.rate}:1 兑换，完成银行/黑市交易。`;
  }

  if (context.kind === "playerTrade") {
    if (context.offerTotal === 0) return "在“给出”里用加号选择你要交出的资源。";
    if (context.requestTotal === 0) return "在“换取”里用加号选择你想要的资源。";
    return context.target === "public"
      ? "点击提出交易，其他玩家会按顺序回应这份公开报价。"
      : "点击提出交易，目标玩家会确认是否接受。";
  }

  if (context.kind === "developmentShop") {
    return undefined;
  }

  if (context.kind === "devCardHand") {
    const cardName = DEV_CARD_LABELS[context.cardType];
    if (!context.playable) return `这张${cardName}现在不能打出：${context.reason ?? "条件未满足"}。`;
    const cardHints: Record<typeof context.cardType, string> = {
      militiaMobilization: "下一步在地图选择要部署民兵的己方营地或堡垒。",
      roadCrew: "下一步选择路线类型，并在地图上点选最多两条合法边。",
      airdrop: "下一步选择要获得的资源。",
      requisition: "下一步选择一种要征用的资源。",
      merchant: "下一步在地图选择要移动到的资源地块。",
      secretBase: "会立即结算胜利点。",
      zombieApproaches: "会立即推进尸潮进度。"
    };
    return `${cardName}可打出。${cardHints[context.cardType]}`;
  }

  if (context.kind === "resourcePicker") {
    const remaining = Math.max(0, context.amount - context.selected);
    if (remaining > 0) return `还需要选择 ${remaining} 张资源。`;
    return "已选满，点击确认完成。";
  }

  return undefined;
}
