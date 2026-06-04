import type { DevCardType, Phase, Resource, RouteType } from "../domain/types";

export type ActionTab = "trade" | "build" | "militia" | "development";

export type UiTool =
  | "initialCamp"
  | "initialRoute"
  | "transport"
  | "convoy"
  | "camp"
  | "fortress"
  | "watchtower"
  | "recruit"
  | "activateMilitia"
  | "merchant"
  | "zombie"
  | "none";

export type UiSelection =
  | { kind: "moveConvoy"; fromEdgeId?: string }
  | { kind: "moveMilitia"; militiaId?: string }
  | { kind: "expelZombie"; militiaId: string }
  | { kind: "devMerchant"; cardId: string }
  | { kind: "devMilitia"; cardId: string; vertexIds: string[] }
  | { kind: "devRequisition"; cardId: string }
  | {
      kind: "devRoadCrew";
      cardId: string;
      routeType: RouteType;
      routes: Array<{ edgeId: string; routeType: RouteType }>;
    };

export type UiOperationContext =
  | { kind: "actionTab"; tab: ActionTab }
  | { kind: "bankTrade"; give?: Resource; receive?: Resource; rate: number; canTrade: boolean }
  | { kind: "playerTrade"; target: "public" | "direct"; offerTotal: number; requestTotal: number }
  | { kind: "developmentShop"; canBuy: boolean; deckCount: number }
  | { kind: "devCardHand"; cardType: DevCardType; playable: boolean; reason?: string }
  | { kind: "resourcePicker"; mode: "choose" | "discard"; selected: number; amount: number };

export const phaseLabels: Record<Phase, string> = {
  setup: "初始设置",
  prepare: "准备",
  dice: "掷骰",
  zombie: "尸潮",
  action: "行动",
  victory: "胜利"
};

export const PUBLIC_TRADE_TARGET = "__public_trade__";

export type InteractionMode = "hot-seat" | "online";
