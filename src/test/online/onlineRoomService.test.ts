// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileRoomStore } from "../../../server/rooms/fileRoomStore";
import { OnlineRoomError, OnlineRoomService } from "../../../server/rooms/onlineRoomService";

const tempDirs: string[] = [];

async function createService() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "zombie-catan-online-room-service-"));
  tempDirs.push(rootDir);
  const store = new FileRoomStore({ rootDir, now: () => 10_000 });
  return new OnlineRoomService({ store, now: () => 10_000 });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("OnlineRoomService", () => {
  it("creates a lobby, lets a second player join, and starts the game when full", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      color: "#d84f3f",
      factionId: "red-rust",
      targetPlayerCount: 2,
      fogEnabled: true
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest",
      color: "#2b78d4",
      factionId: "blue-steel"
    });

    const started = await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    expect(host.seat.playerId).toBe("p1");
    expect(guest.seat.playerId).toBe("p2");
    expect(started.status).toBe("active");
    expect(started.gameState?.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(started.gameState?.phase).toBe("setup");
  });

  it("refuses to start until the lobby is full", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      color: "#d84f3f",
      factionId: "red-rust",
      targetPlayerCount: 3,
      fogEnabled: false
    });

    await expect(
      service.startRoom({ roomCode: host.room.roomCode, viewerPlayerId: host.seat.playerId })
    ).rejects.toThrow(OnlineRoomError);
  });

  it("enforces online authorization when applying commands", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      color: "#d84f3f",
      factionId: "red-rust",
      targetPlayerCount: 2,
      fogEnabled: true
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest",
      color: "#2b78d4",
      factionId: "blue-steel"
    });
    await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    await expect(
      service.applyPlayerCommand({
        roomCode: host.room.roomCode,
        viewerPlayerId: guest.seat.playerId,
        command: { type: "placeInitialCamp", vertexId: "v-0-0" }
      })
    ).rejects.toThrow(OnlineRoomError);
  });

  it("restores persisted sessions after a disconnect", async () => {
    const service = await createService();
    const created = await service.createRoom({
      name: "Host",
      color: "#d84f3f",
      factionId: "red-rust",
      targetPlayerCount: 2,
      fogEnabled: true
    });

    await service.markDisconnected({
      roomCode: created.room.roomCode,
      playerId: created.seat.playerId
    });
    const resumed = await service.resumeSession({
      roomCode: created.room.roomCode,
      sessionToken: created.seat.sessionToken
    });

    expect(resumed?.seat.playerId).toBe(created.seat.playerId);
    expect(resumed?.seat.connected).toBe(true);
  });
});
