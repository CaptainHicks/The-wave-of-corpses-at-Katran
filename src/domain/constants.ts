import type { DevCardType, Resource, Resources, TileType } from "./types";

export const RESOURCES: Resource[] = ["food", "wood", "metal", "fuel", "ammo"];

export const RESOURCE_LABELS: Record<Resource, string> = {
  food: "食物",
  wood: "木材",
  metal: "金属",
  fuel: "燃料",
  ammo: "弹药"
};

export const TILE_LABELS: Record<TileType, string> = {
  farm: "农场",
  forest: "林地",
  factory: "废弃工厂",
  city: "废墟城区",
  military: "军事营地",
  warehouse: "废弃仓库",
  infected: "感染区",
  empty: "空地"
};

export const TILE_RESOURCE: Partial<Record<TileType, Resource>> = {
  farm: "food",
  forest: "wood",
  factory: "metal",
  city: "fuel",
  military: "ammo"
};

export const PLAYER_FACTIONS = [
  { id: "red-rust", name: "赤锈营地", color: "#d84f3f", portrait: "/assets/hud/player-3.v1.webp" },
  { id: "blue-steel", name: "蓝钢哨站", color: "#2b78d4", portrait: "/assets/hud/player-2.v1.webp" },
  { id: "green-oasis", name: "绿洲车队", color: "#209468", portrait: "/assets/hud/player-1.v1.webp" },
  { id: "gold-sand", name: "金砂堡垒", color: "#d49b28", portrait: "/assets/hud/player-4.v1.webp" },
  { id: "white-tower", name: "白塔公社", color: "#8e5bb7", portrait: "/assets/hud/player-5.v1.webp" },
  { id: "ash-merchant", name: "灰烬商队", color: "#5b7f86", portrait: "/assets/hud/player-6.v1.webp" }
] as const;

export const EMPTY_RESOURCES: Resources = {
  food: 0,
  wood: 0,
  metal: 0,
  fuel: 0,
  ammo: 0
};

export const PIECE_LIMITS = {
  camps: 5,
  fortresses: 4,
  transports: 15,
  convoys: 10,
  militia: 12,
  watchtowers: 4
};

export const COSTS: Record<string, Partial<Resources>> = {
  transport: { wood: 1, metal: 1 },
  convoy: { ammo: 1, fuel: 1 },
  camp: { food: 1, wood: 1, fuel: 1, ammo: 1 },
  fortress: { food: 2, metal: 3 },
  watchtower: { metal: 1, wood: 1 },
  militia: { metal: 1, ammo: 1 },
  activateMilitia: { food: 1 },
  devCard: { food: 1, metal: 1, ammo: 1 }
};

export const NUMBER_POOL = [
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  6,
  6,
  6,
  8,
  8,
  8,
  9,
  9,
  9,
  9,
  10,
  10,
  10,
  10,
  11,
  11,
  11,
  11,
  12,
  12
];

export const DEV_CARD_COUNTS: Record<DevCardType, number> = {
  militiaMobilization: 6,
  roadCrew: 2,
  airdrop: 2,
  requisition: 2,
  merchant: 2,
  secretBase: 5,
  zombieApproaches: 4
};

export const DEV_CARD_LABELS: Record<DevCardType, string> = {
  militiaMobilization: "民兵动员",
  roadCrew: "开路队",
  airdrop: "空投补给",
  requisition: "征用物资",
  merchant: "商人",
  secretBase: "秘密据点",
  zombieApproaches: "尸潮逼近"
};

export const VICTORY_POINTS_TO_WIN = 12;
export const BASE_HAND_LIMIT = 7;
export const WATCHTOWER_HAND_BONUS = 2;
export const ZOMBIE_TRACK_LIMIT = 6;

export function createResources(values: Partial<Resources> = {}): Resources {
  return { ...EMPTY_RESOURCES, ...values };
}
