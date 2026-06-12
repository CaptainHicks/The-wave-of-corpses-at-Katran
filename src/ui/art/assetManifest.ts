import type { BuildingType, DevCardType, Resource, RouteType, TileType } from "../../domain/types";

export interface AssetRef {
  alt: string;
  fallbackColor: string;
  fallbackLabel: string;
  imageUrl?: string;
}

function asset(alt: string, fallbackColor: string, fallbackLabel: string, imageUrl?: string): AssetRef {
  return {
    alt,
    fallbackColor,
    fallbackLabel,
    imageUrl
  };
}

export const tileAssets: Record<TileType | "fog", AssetRef> = {
  farm: asset("Dried farm tile", "#b99a4b", "FARM", "/assets/tiles/farm.v1.webp"),
  forest: asset("Withered forest tile", "#536b45", "FOREST", "/assets/tiles/forest.v1.webp"),
  factory: asset("Abandoned factory tile", "#73736c", "FACTORY", "/assets/tiles/factory.v1.webp"),
  city: asset("Ruined city tile", "#9b5b3a", "CITY", "/assets/tiles/city.v1.webp"),
  military: asset("Military camp tile", "#686a48", "MIL", "/assets/tiles/military.v1.webp"),
  warehouse: asset("Abandoned warehouse tile", "#b88635", "WAREHOUSE", "/assets/tiles/warehouse.v1.webp"),
  infected: asset("Infected zone tile", "#3f5c4c", "INFECTED", "/assets/tiles/infected.v1.webp"),
  empty: asset("Empty wasteland tile", "#b8ad98", "EMPTY", "/assets/tiles/empty.v1.webp"),
  fog: asset("Unexplored fog tile", "#626a6d", "FOG", "/assets/tiles/fog.v1.webp")
};

export const resourceCardAssets: Record<Resource, AssetRef> = {
  food: asset("Food resource card", "#b78a3d", "FOOD", "/assets/cards/resources/food.v1.webp"),
  wood: asset("Wood resource card", "#4f6f42", "WOOD", "/assets/cards/resources/wood.v1.webp"),
  metal: asset("Metal resource card", "#747a7a", "METAL", "/assets/cards/resources/metal.v1.webp"),
  fuel: asset("Fuel resource card", "#8e5e2f", "FUEL", "/assets/cards/resources/fuel.v1.webp"),
  ammo: asset("Ammo resource card", "#8f4136", "AMMO", "/assets/cards/resources/ammo.v1.webp")
};

export const resourceIconAssets: Record<Resource, AssetRef> = {
  food: asset("Food resource icon", "#b78a3d", "FOOD", "/assets/hud/resources/food.v1.webp"),
  wood: asset("Wood resource icon", "#4f6f42", "WOOD", "/assets/hud/resources/wood.v1.webp"),
  metal: asset("Metal resource icon", "#747a7a", "METAL", "/assets/hud/resources/metal.v1.webp"),
  fuel: asset("Fuel resource icon", "#8e5e2f", "FUEL", "/assets/hud/resources/fuel.v1.webp"),
  ammo: asset("Ammo resource icon", "#8f4136", "AMMO", "/assets/hud/resources/ammo.v1.webp")
};

export const devCardAssets: Record<DevCardType | "back", AssetRef> = {
  back: asset("Development card back", "#27251f", "DEV", "/assets/cards/development/back.v1.webp"),
  militiaMobilization: asset(
    "Militia mobilization development card",
    "#526646",
    "MILITIA",
    "/assets/cards/development/militia-mobilization.v1.webp"
  ),
  roadCrew: asset("Road crew development card", "#7d6a44", "ROAD", "/assets/cards/development/road-crew.v1.webp"),
  airdrop: asset("Airdrop development card", "#52687a", "AIRDROP", "/assets/cards/development/airdrop.v1.webp"),
  requisition: asset(
    "Requisition development card",
    "#7d513f",
    "REQUISITION",
    "/assets/cards/development/requisition.v1.webp"
  ),
  merchant: asset("Merchant development card", "#7d5f92", "MERCHANT", "/assets/cards/development/merchant.v1.webp"),
  secretBase: asset("Secret base development card", "#4a4d56", "BASE", "/assets/cards/development/secret-base.v1.webp"),
  zombieApproaches: asset(
    "Zombie approaches development card",
    "#7a2f2b",
    "ZOMBIE",
    "/assets/cards/development/zombie-approaches.v1.webp"
  )
};

export const boardNumberTokenAssets: Record<number, string> = {
  1: "/assets/board/numbers/1.v1.webp",
  2: "/assets/board/numbers/2.v1.webp",
  3: "/assets/board/numbers/3.v1.webp",
  4: "/assets/board/numbers/4.v1.webp",
  5: "/assets/board/numbers/5.v1.webp",
  6: "/assets/board/numbers/6.v1.webp",
  7: "/assets/board/numbers/7.v1.webp",
  8: "/assets/board/numbers/8.v1.webp",
  9: "/assets/board/numbers/9.v1.webp",
  10: "/assets/board/numbers/10.v1.webp",
  11: "/assets/board/numbers/11.v1.webp",
  12: "/assets/board/numbers/12.v1.webp"
};

export const boardMarkerAssets = {
  blackMarket: "/assets/board/markers/black-market.v1.webp",
  zombieHorde: "/assets/board/markers/zombie-horde.v1.webp",
  merchant: "/assets/board/markers/merchant.v1.webp",
  militiaCountMarkers: {
    inactive: "/assets/board/markers/militia-inactive.v1.webp",
    active: "/assets/board/markers/militia-active.v1.webp"
  }
};

const pieceFoldersByPlayerId: Record<string, string> = {
  p1: "red",
  p2: "blue",
  p3: "green",
  p4: "yellow",
  p5: "purple",
  p6: "gray"
};

const pieceFoldersByFactionId: Record<string, string> = {
  "red-rust": "red",
  "blue-steel": "blue",
  "green-oasis": "green",
  "gold-sand": "yellow",
  "white-tower": "purple",
  "ash-merchant": "gray"
};

const pieceFoldersByColor: Record<string, string> = {
  "#d84f3f": "red",
  "#2b78d4": "blue",
  "#209468": "green",
  "#d49b28": "yellow",
  "#8e5bb7": "purple",
  "#5b7f86": "gray"
};

function resolvePieceFolder({
  playerId,
  factionId,
  color
}: {
  playerId: string;
  factionId?: string;
  color?: string;
}) {
  return (
    (factionId ? pieceFoldersByFactionId[factionId] : undefined) ??
    (color ? pieceFoldersByColor[color.toLowerCase()] : undefined) ??
    pieceFoldersByPlayerId[playerId]
  );
}

function routeAssets(folder: string): Record<RouteType, string> {
  return {
    transport: `/assets/board/routes/${folder}/transport.v1.webp`,
    convoy: `/assets/board/routes/${folder}/convoy.v1.webp`
  };
}

export const routePieceAssets: Record<string, Record<RouteType, string>> = {
  p1: {
    transport: "/assets/board/routes/red/transport.v1.webp",
    convoy: "/assets/board/routes/red/convoy.v1.webp"
  },
  p2: {
    transport: "/assets/board/routes/blue/transport.v1.webp",
    convoy: "/assets/board/routes/blue/convoy.v1.webp"
  },
  p3: {
    transport: "/assets/board/routes/green/transport.v1.webp",
    convoy: "/assets/board/routes/green/convoy.v1.webp"
  },
  p4: {
    transport: "/assets/board/routes/yellow/transport.v1.webp",
    convoy: "/assets/board/routes/yellow/convoy.v1.webp"
  },
  p5: {
    transport: "/assets/board/routes/purple/transport.v1.webp",
    convoy: "/assets/board/routes/purple/convoy.v1.webp"
  },
  p6: {
    transport: "/assets/board/routes/gray/transport.v1.webp",
    convoy: "/assets/board/routes/gray/convoy.v1.webp"
  }
};

export function getRoutePieceAsset({
  playerId,
  factionId,
  color,
  routeType
}: {
  playerId: string;
  factionId?: string;
  color?: string;
  routeType: RouteType;
}): string | undefined {
  const folder = resolvePieceFolder({ playerId, factionId, color });
  return folder ? routeAssets(folder)[routeType] : undefined;
}

export function getBuildingPieceAsset({
  playerId,
  factionId,
  color,
  buildingType,
  hasWatchtower,
  militiaCount
}: {
  playerId: string;
  factionId?: string;
  color?: string;
  buildingType: BuildingType;
  hasWatchtower: boolean;
  militiaCount: number;
}): string | undefined {
  const folder = resolvePieceFolder({ playerId, factionId, color });
  if (!folder) return undefined;

  const base = buildingType === "fortress" ? "fortress" : "camp";
  const cappedMilitia = Math.max(0, Math.min(2, militiaCount));
  const watchtowerPart = hasWatchtower ? "-watchtower" : "";
  const militiaPart = cappedMilitia > 0 ? `-militia-${cappedMilitia}` : "";
  return `/assets/board/buildings/${folder}/${base}${watchtowerPart}${militiaPart}.v1.webp`;
}
