import type { Phase, RouteType } from "../domain/types";

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
  | { kind: "moveMilitia"; militiaId: string }
  | { kind: "expelZombie"; militiaId: string }
  | { kind: "devMerchant"; cardId: string }
  | { kind: "devMilitia"; cardId: string }
  | {
      kind: "devRoadCrew";
      cardId: string;
      routeType: RouteType;
      routes: Array<{ edgeId: string; routeType: RouteType }>;
    };

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
