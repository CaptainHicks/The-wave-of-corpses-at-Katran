import { describe, expect, it } from "vitest";
import { boardMarkerAssets, boardNumberTokenAssets, getBuildingPieceAsset, getRoutePieceAsset, tileAssets } from "../../ui/art/assetManifest";
import {
  GAME_ART_CRITICAL_PRELOAD_URLS,
  GAME_ART_PRELOAD_URLS,
  isCriticalGameArtPreloadComplete,
  preloadCriticalGameArtAssets
} from "../../ui/art/preloadGameAssets";

describe("game art preloading", () => {
  it("warms the first setup placement assets before the game board opens", () => {
    expect(GAME_ART_CRITICAL_PRELOAD_URLS).toContain("/assets/game/play-bg.v1.webp");
    expect(GAME_ART_CRITICAL_PRELOAD_URLS).toContain(tileAssets.farm.imageUrl);
    expect(GAME_ART_CRITICAL_PRELOAD_URLS).toContain(boardNumberTokenAssets[8]);
    expect(GAME_ART_CRITICAL_PRELOAD_URLS).toContain(boardMarkerAssets.blackMarket);
    expect(GAME_ART_CRITICAL_PRELOAD_URLS).toContain(
      getBuildingPieceAsset({
        playerId: "p1",
        factionId: "red-rust",
        color: "#d84f3f",
        buildingType: "camp",
        hasWatchtower: false,
        militiaCount: 0
      })
    );
    expect(GAME_ART_CRITICAL_PRELOAD_URLS).toContain(
      getRoutePieceAsset({
        playerId: "p1",
        factionId: "red-rust",
        color: "#d84f3f",
        routeType: "transport"
      })
    );
  });

  it("keeps the preload list unique while including later board piece variants", () => {
    expect(new Set(GAME_ART_PRELOAD_URLS).size).toBe(GAME_ART_PRELOAD_URLS.length);
    expect(GAME_ART_PRELOAD_URLS).toContain("/assets/board/buildings/purple/camp.v1.webp");
    expect(GAME_ART_PRELOAD_URLS).toContain("/assets/board/buildings/red/camp-watchtower-militia-2.v1.webp");
    expect(GAME_ART_PRELOAD_URLS).toContain(boardMarkerAssets.militiaCountMarkers.active);
  });

  it("does not block tests or server rendering while waiting for browser image decode", async () => {
    await expect(preloadCriticalGameArtAssets()).resolves.toEqual({
      total: GAME_ART_CRITICAL_PRELOAD_URLS.length,
      loaded: GAME_ART_CRITICAL_PRELOAD_URLS.length,
      failed: 0,
      complete: true
    });
    expect(isCriticalGameArtPreloadComplete()).toBe(true);
  });
});
