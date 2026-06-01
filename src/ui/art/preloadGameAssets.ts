import { PLAYER_FACTIONS } from "../../domain/constants";
import type { BuildingType, RouteType } from "../../domain/types";
import {
  boardMarkerAssets,
  boardNumberTokenAssets,
  devCardAssets,
  getBuildingPieceAsset,
  getRoutePieceAsset,
  resourceCardAssets,
  resourceIconAssets,
  tileAssets
} from "./assetManifest";

const BUILDING_TYPES: BuildingType[] = ["camp", "fortress"];
const ROUTE_TYPES: RouteType[] = ["transport", "convoy"];
const MILITIA_COUNTS = [0, 1, 2];

const HUD_ASSET_URLS = [
  "/assets/game/play-bg.v1.webp",
  "/assets/hud/camp.v1.webp",
  "/assets/hud/convoy.v1.webp",
  "/assets/hud/dev-card-back.v1.webp",
  "/assets/hud/dice.v1.webp",
  "/assets/hud/fortress.v1.webp",
  "/assets/hud/hourglass.v1.webp",
  "/assets/hud/longest-supply.v1.webp",
  "/assets/hud/militia.v1.webp",
  "/assets/hud/transport.v1.webp",
  "/assets/hud/watchtower.v1.webp",
  ...PLAYER_FACTIONS.map((faction) => faction.portrait)
];

function assetRefUrls(records: Array<Record<string, { imageUrl?: string }>>) {
  return records.flatMap((record) => Object.values(record).flatMap((asset) => (asset.imageUrl ? [asset.imageUrl] : [])));
}

function buildingPieceUrls() {
  return PLAYER_FACTIONS.flatMap((faction, index) => {
    const playerId = `p${index + 1}`;
    return BUILDING_TYPES.flatMap((buildingType) =>
      [false, true].flatMap((hasWatchtower) =>
        MILITIA_COUNTS.flatMap((militiaCount) => {
          const url = getBuildingPieceAsset({
            playerId,
            factionId: faction.id,
            color: faction.color,
            buildingType,
            hasWatchtower,
            militiaCount
          });
          return url ? [url] : [];
        })
      )
    );
  });
}

function routePieceUrls() {
  return PLAYER_FACTIONS.flatMap((faction, index) => {
    const playerId = `p${index + 1}`;
    return ROUTE_TYPES.flatMap((routeType) => {
      const url = getRoutePieceAsset({
        playerId,
        factionId: faction.id,
        color: faction.color,
        routeType
      });
      return url ? [url] : [];
    });
  });
}

function uniqueUrls(urls: string[]) {
  return [...new Set(urls.filter(Boolean))];
}

export const GAME_ART_CRITICAL_PRELOAD_URLS = uniqueUrls([
  "/assets/game/play-bg.v1.webp",
  ...assetRefUrls([tileAssets]),
  ...Object.values(boardNumberTokenAssets),
  boardMarkerAssets.blackMarket,
  boardMarkerAssets.zombieHorde,
  boardMarkerAssets.merchant,
  ...PLAYER_FACTIONS.map((faction, index) =>
    getBuildingPieceAsset({
      playerId: `p${index + 1}`,
      factionId: faction.id,
      color: faction.color,
      buildingType: "camp",
      hasWatchtower: false,
      militiaCount: 0
    })
  ).filter((url): url is string => Boolean(url)),
  ...routePieceUrls(),
  ...HUD_ASSET_URLS,
  ...assetRefUrls([resourceIconAssets])
]);

export const GAME_ART_PRELOAD_URLS = uniqueUrls([
  ...GAME_ART_CRITICAL_PRELOAD_URLS,
  ...buildingPieceUrls(),
  boardMarkerAssets.militiaLightning.inactive,
  boardMarkerAssets.militiaLightning.active,
  ...assetRefUrls([resourceCardAssets, devCardAssets])
]);

const warmedImages = new Map<string, HTMLImageElement>();
let preloadStarted = false;

export function preloadGameArtAssets() {
  if (preloadStarted || typeof window === "undefined" || typeof Image === "undefined") return;
  preloadStarted = true;

  warmImageUrls(GAME_ART_CRITICAL_PRELOAD_URLS);
  scheduleIdleWarmup(() => {
    const criticalUrls = new Set(GAME_ART_CRITICAL_PRELOAD_URLS);
    warmImageUrls(GAME_ART_PRELOAD_URLS.filter((url) => !criticalUrls.has(url)));
  });
}

function warmImageUrls(urls: string[]) {
  urls.forEach((url) => warmImageUrl(url));
}

function warmImageUrl(url: string) {
  if (warmedImages.has(url)) return;
  const image = new Image();
  image.decoding = "async";
  image.loading = "eager";
  image.src = url;
  warmedImages.set(url, image);
  if (typeof image.decode === "function") {
    void image.decode().catch(() => undefined);
  }
}

function scheduleIdleWarmup(callback: () => void) {
  const requestIdle = (
    window as Window & {
      requestIdleCallback?: (handler: () => void, options?: { timeout?: number }) => number;
    }
  ).requestIdleCallback;

  if (requestIdle) {
    requestIdle(callback, { timeout: 1200 });
    return;
  }

  window.setTimeout(callback, 0);
}
