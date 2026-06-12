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
  boardMarkerAssets.militiaCountMarkers.inactive,
  boardMarkerAssets.militiaCountMarkers.active,
  ...assetRefUrls([resourceCardAssets, devCardAssets])
]);

const warmedImages = new Map<string, HTMLImageElement>();
const warmedImageLoads = new Map<string, Promise<boolean>>();
let preloadStarted = false;
let criticalPreloadPromise: Promise<GameArtPreloadResult> | undefined;
let criticalPreloadResult: GameArtPreloadResult | undefined;

const CRITICAL_IMAGE_TIMEOUT_MS = 15000;

export interface GameArtPreloadResult {
  total: number;
  loaded: number;
  failed: number;
  complete: boolean;
}

export function preloadGameArtAssets(): Promise<GameArtPreloadResult> {
  const criticalPromise = preloadCriticalGameArtAssets();
  if (preloadStarted || !hasImagePreloadRuntime()) return criticalPromise;
  preloadStarted = true;

  scheduleIdleWarmup(() => {
    const criticalUrls = new Set(GAME_ART_CRITICAL_PRELOAD_URLS);
    void warmImageUrls(GAME_ART_PRELOAD_URLS.filter((url) => !criticalUrls.has(url)), "low");
  });
  return criticalPromise;
}

export function preloadCriticalGameArtAssets(): Promise<GameArtPreloadResult> {
  if (!hasImagePreloadRuntime()) {
    return Promise.resolve({
      total: GAME_ART_CRITICAL_PRELOAD_URLS.length,
      loaded: GAME_ART_CRITICAL_PRELOAD_URLS.length,
      failed: 0,
      complete: true
    });
  }

  criticalPreloadPromise ??= warmImageUrls(GAME_ART_CRITICAL_PRELOAD_URLS, "high").then((loadedStates) => {
    const loaded = loadedStates.filter(Boolean).length;
    criticalPreloadResult = {
      total: loadedStates.length,
      loaded,
      failed: loadedStates.length - loaded,
      complete: true
    };
    return criticalPreloadResult;
  });
  return criticalPreloadPromise;
}

export function isCriticalGameArtPreloadComplete(): boolean {
  return !hasImagePreloadRuntime() || Boolean(criticalPreloadResult?.complete);
}

/**
 * 在浏览器空闲时低优先级预热一组图片（复用同一套缓存去重 / decode / 超时逻辑）。
 * 用于首屏不直接显示、但很快会被导航到的图片，例如菜单二级面板配图。
 */
export function warmImageAssetsWhenIdle(urls: string[]) {
  if (!hasImagePreloadRuntime()) return;
  const targets = uniqueUrls(urls);
  if (targets.length === 0) return;
  scheduleIdleWarmup(() => {
    void warmImageUrls(targets, "low");
  });
}

function warmImageUrls(urls: string[], fetchPriority: "high" | "low" | "auto" = "auto") {
  return Promise.all(urls.map((url) => warmImageUrl(url, fetchPriority)));
}

function warmImageUrl(url: string, fetchPriority: "high" | "low" | "auto" = "auto"): Promise<boolean> {
  const existingLoad = warmedImageLoads.get(url);
  if (existingLoad) return existingLoad;

  const image = new Image();
  image.decoding = "async";
  image.loading = "eager";
  (image as HTMLImageElement & { fetchPriority?: "high" | "low" | "auto" }).fetchPriority = fetchPriority;
  warmedImages.set(url, image);

  const load = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      window.clearTimeout(timeoutId);
      resolve(loaded);
    };
    const decodeThenFinish = () => {
      if (typeof image.decode !== "function") {
        finish(true);
        return;
      }
      image.decode().then(() => finish(true)).catch(() => finish(true));
    };
    const timeoutId = window.setTimeout(() => finish(false), CRITICAL_IMAGE_TIMEOUT_MS);

    image.onload = decodeThenFinish;
    image.onerror = () => finish(false);
    image.src = url;

    if (image.complete) {
      window.queueMicrotask(() => {
        if (image.naturalWidth > 0) {
          decodeThenFinish();
        } else {
          finish(false);
        }
      });
    }
  });

  warmedImageLoads.set(url, load);
  return load;
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

function hasImagePreloadRuntime() {
  return (
    typeof window !== "undefined" &&
    typeof Image !== "undefined" &&
    !(typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("jsdom"))
  );
}
