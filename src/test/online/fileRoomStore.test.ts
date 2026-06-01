// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Command } from "../../domain/types";
import { FileRoomStore } from "../../../server/rooms/fileRoomStore.ts";
import type { StoredOnlineRoom } from "../../../server/rooms/types.ts";

const tempDirs: string[] = [];

async function createStore(now = () => Date.now()) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "zombie-catan-room-store-"));
  tempDirs.push(rootDir);
  return new FileRoomStore({ rootDir, now });
}

function sampleRoom(overrides: Partial<StoredOnlineRoom> = {}): StoredOnlineRoom {
  return {
    roomCode: "ABCD12",
    hostPlayerId: "p1",
    status: "lobby",
    fogEnabled: true,
    targetPlayerCount: 3,
    createdAt: 1_000,
    updatedAt: 1_000,
    seats: [
      {
        playerId: "p1",
        name: "Player 1",
        color: "#d84f3f",
        factionId: "red-rust",
        sessionToken: "token-1",
        connected: true,
        joinedAt: 1_000,
        lastSeenAt: 1_000
      }
    ],
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("FileRoomStore", () => {
  it("round-trips room snapshots and last commands through disk", async () => {
    const store = await createStore();
    const lastCommand: Command = { type: "rollDice", forced: [3, 4] };
    const room = sampleRoom({
      status: "active",
      updatedAt: 2_000,
      lastCommand,
      gameState: { phase: "action", currentPlayerId: "p1" } as StoredOnlineRoom["gameState"]
    });

    await store.saveRoom(room);
    const loaded = await store.loadRoom(room.roomCode);

    expect(loaded).toEqual(room);
  });

  it("can resolve a room by persisted session token for reconnects", async () => {
    const store = await createStore();
    const room = sampleRoom({
      roomCode: "EFGH34",
      seats: [
        sampleRoom().seats[0],
        {
          playerId: "p2",
          name: "Player 2",
          color: "#2b78d4",
          factionId: "blue-steel",
          sessionToken: "token-2",
          connected: false,
          joinedAt: 1_005,
          lastSeenAt: 1_500
        }
      ]
    });

    await store.saveRoom(room);
    const resolved = await store.findRoomBySession("EFGH34", "token-2");

    expect(resolved?.room.roomCode).toBe("EFGH34");
    expect(resolved?.seat.playerId).toBe("p2");
  });

  it("removes stale lobby and finished rooms during cleanup", async () => {
    const now = () => 10 * 24 * 60 * 60 * 1_000;
    const store = await createStore(now);
    await store.saveRoom(sampleRoom({ roomCode: "LIVE01", updatedAt: now() - 1_000 }));
    await store.saveRoom(sampleRoom({ roomCode: "LOBBY2", updatedAt: 0 }));
    await store.saveRoom(sampleRoom({ roomCode: "DONE03", status: "finished", updatedAt: 0 }));

    const removed = await store.removeExpiredRooms();

    expect(removed.sort()).toEqual(["DONE03", "LOBBY2"]);
    expect(await store.loadRoom("LIVE01")).toBeTruthy();
    expect(await store.loadRoom("LOBBY2")).toBeUndefined();
    expect(await store.loadRoom("DONE03")).toBeUndefined();
  });
});
