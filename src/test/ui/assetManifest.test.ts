import { describe, expect, it } from "vitest";
import { getBuildingPieceAsset, getRoutePieceAsset } from "../../ui/art/assetManifest";

describe("board piece asset mapping", () => {
  it("uses faction assets before seat-number fallbacks", () => {
    expect(
      getBuildingPieceAsset({
        playerId: "p1",
        factionId: "white-tower",
        color: "#8e5bb7",
        buildingType: "camp",
        hasWatchtower: false,
        militiaCount: 0
      })
    ).toBe("/assets/board/buildings/purple/camp.v1.webp");

    expect(
      getRoutePieceAsset({
        playerId: "p1",
        factionId: "white-tower",
        color: "#8e5bb7",
        routeType: "transport"
      })
    ).toBe("/assets/board/routes/purple/transport.v1.webp");
  });

  it("keeps seat-number assets as a fallback for older saves", () => {
    expect(
      getBuildingPieceAsset({
        playerId: "p1",
        buildingType: "camp",
        hasWatchtower: false,
        militiaCount: 0
      })
    ).toBe("/assets/board/buildings/red/camp.v1.webp");
  });
});
