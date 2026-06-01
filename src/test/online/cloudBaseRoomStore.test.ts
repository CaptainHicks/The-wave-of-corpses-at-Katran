// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  CloudBaseRoomStore,
  getCloudBaseRuntimeInfo,
  resolveCloudBaseInitOptions
} from "../../../server/rooms/cloudBaseRoomStore.ts";
import type { StoredOnlineRoom } from "../../../server/rooms/types.ts";

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

function createFakeDb(
  initialRooms: StoredOnlineRoom[] = [],
  options: { supportsTransactions?: boolean; documentGetShape?: "array" | "object"; hiddenAfterSetReads?: number } = {}
) {
  const docs = new Map(initialRooms.map((room) => [room.roomCode, { ...room, _id: room.roomCode }]));
  const hiddenReads = new Map<string, number>();
  let transactionCount = 0;
  const toDocumentGetResult = (doc: (StoredOnlineRoom & { _id: string }) | undefined) => {
    if (options.documentGetShape === "object") {
      return { data: doc ? structuredClone(doc) : undefined };
    }
    return { data: doc ? [structuredClone(doc)] : [] };
  };

  const db = {
    command: {
      lt(value: number) {
        return { __op: "lt", value };
      }
    },
    collection() {
      return {
        doc(id: string) {
          return {
            async get() {
              const remainingHiddenReads = hiddenReads.get(id) ?? 0;
              if (remainingHiddenReads > 0) {
                hiddenReads.set(id, remainingHiddenReads - 1);
                return toDocumentGetResult(undefined);
              }
              const doc = docs.get(id);
              return toDocumentGetResult(doc);
            },
            async set(data: unknown) {
              docs.set(id, { ...(data as Record<string, unknown>), _id: id });
              if (options.hiddenAfterSetReads) {
                hiddenReads.set(id, options.hiddenAfterSetReads);
              }
              return {};
            },
            async remove() {
              docs.delete(id);
              return {};
            }
          };
        },
        where(query: Record<string, unknown>) {
          return {
            async get() {
              const data = [...docs.values()].filter((doc) => matchesQuery(doc, query)).map((doc) => structuredClone(doc));
              return { data };
            }
          };
        }
      };
    },
    snapshot() {
      return [...docs.values()];
    },
    transactionCount() {
      return transactionCount;
    }
  };

  if (!options.supportsTransactions) return db;

  return {
    ...db,
    async runTransaction<T>(task: (transaction: { collection: typeof db.collection }) => Promise<T>) {
      transactionCount += 1;
      const result = await task({ collection: () => db.collection() });
      return { result };
    }
  };
}

describe("CloudBaseRoomStore", () => {
  it("maps CloudBase credential environment variables into init options", () => {
    expect(
      resolveCloudBaseInitOptions({
        CLOUDBASE_ENV_ID: "env-123",
        TENCENTCLOUD_SECRETID: "sid",
        TENCENTCLOUD_SECRETKEY: "skey",
        TENCENTCLOUD_SESSIONTOKEN: "stoken"
      })
    ).toEqual({
      env: "env-123",
      timeout: 5_000,
      secretId: "sid",
      secretKey: "skey",
      sessionToken: "stoken"
    });
  });

  it("prefers access keys and reports runtime auth mode for health checks", () => {
    expect(
      resolveCloudBaseInitOptions({
        TCB_ENV_ID: "env-abc",
        CLOUDBASE_APIKEY: "publish-key",
        TENCENTCLOUD_SECRETID: "sid",
        TENCENTCLOUD_SECRETKEY: "skey"
      })
    ).toEqual({
      env: "env-abc",
      timeout: 5_000,
      accessKey: "publish-key"
    });

    expect(
      getCloudBaseRuntimeInfo({
        TCB_ENV_ID: "env-abc",
        CLOUDBASE_APIKEY: "publish-key",
        CLOUDBASE_SDK_TIMEOUT_MS: "7000"
      })
    ).toEqual({
      environmentId: "env-abc",
      authMode: "access-key",
      timeoutMs: 7_000
    });
  });

  it("uses the project CloudBase environment id as a production fallback", () => {
    expect(resolveCloudBaseInitOptions({}).env).toBe("zombie-catan-d8g07asiy5e3f05c1");
    expect(getCloudBaseRuntimeInfo({}).environmentId).toBe("zombie-catan-d8g07asiy5e3f05c1");
  });

  it("round-trips room snapshots through the CloudBase collection API", async () => {
    const db = createFakeDb();
    const store = new CloudBaseRoomStore({ db });
    const room = sampleRoom({
      status: "active",
      updatedAt: 2_000,
      gameState: { phase: "action", currentPlayerId: "p1" } as StoredOnlineRoom["gameState"]
    });

    await store.saveRoom(room);
    const loaded = await store.loadRoom(room.roomCode);

    expect(loaded).toEqual(room);
  });

  it("loads room snapshots when CloudBase doc.get returns a single document object", async () => {
    const room = sampleRoom();
    const db = createFakeDb([room], { documentGetShape: "object" });
    const store = new CloudBaseRoomStore({ db });

    const loaded = await store.loadRoom(room.roomCode);

    expect(loaded).toEqual(room);
  });

  it("runs room updates through CloudBase database transactions when available", async () => {
    const room = sampleRoom();
    const db = createFakeDb([room], { supportsTransactions: true });
    const store = new CloudBaseRoomStore({ db });

    const result = await store.withRoomTransaction(room.roomCode, async (transaction) => {
      const loaded = await transaction.loadRoom();
      expect(loaded?.roomCode).toBe(room.roomCode);
      await transaction.saveRoom({
        ...loaded!,
        seats: [
          ...loaded!.seats,
          {
            playerId: "p2",
            name: "Guest",
            color: "#2b78d4",
            factionId: "blue-steel",
            sessionToken: "token-2",
            connected: true,
            joinedAt: 1_100,
            lastSeenAt: 1_100
          }
        ]
      });
      return "updated";
    });

    expect(result).toBe("updated");
    expect(db.transactionCount()).toBe(1);
    expect(db.snapshot()[0].seats.map((seat) => seat.name)).toEqual(["Player 1", "Guest"]);
  });

  it("loads transaction room snapshots when CloudBase doc.get returns a single document object", async () => {
    const room = sampleRoom();
    const db = createFakeDb([room], { supportsTransactions: true, documentGetShape: "object" });
    const store = new CloudBaseRoomStore({ db });

    const loaded = await store.withRoomTransaction(room.roomCode, (transaction) => transaction.loadRoom());

    expect(loaded).toEqual(room);
  });

  it("serves recently saved rooms while CloudBase has not made the write visible yet", async () => {
    const room = sampleRoom();
    const db = createFakeDb([], { hiddenAfterSetReads: 2 });
    const store = new CloudBaseRoomStore({ db });

    await store.saveRoom(room);

    await expect(store.loadRoom(room.roomCode)).resolves.toEqual(room);
    await expect(store.withRoomTransaction(room.roomCode, (transaction) => transaction.loadRoom())).resolves.toEqual(room);
  });

  it("can resolve a room by session token after loading the room document", async () => {
    const room = sampleRoom({
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
    const db = createFakeDb([room]);
    const store = new CloudBaseRoomStore({ db });

    const resolved = await store.findRoomBySession(room.roomCode, "token-2");

    expect(resolved?.seat.playerId).toBe("p2");
  });

  it("removes stale lobbies and stale finished rooms while keeping fresh rooms", async () => {
    const now = () => 10 * 24 * 60 * 60 * 1_000;
    const db = createFakeDb([
      sampleRoom({ roomCode: "LIVE01", updatedAt: now() - 1_000 }),
      sampleRoom({ roomCode: "LOBBY2", updatedAt: 0 }),
      sampleRoom({ roomCode: "DONE03", status: "finished", updatedAt: 0 })
    ]);
    const store = new CloudBaseRoomStore({ db, now });

    const removed = await store.removeExpiredRooms();

    expect(removed.sort()).toEqual(["DONE03", "LOBBY2"]);
    expect(db.snapshot().map((room) => room.roomCode)).toEqual(["LIVE01"]);
  });
});

function matchesQuery(doc: Record<string, unknown>, query: Record<string, unknown>) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = doc[key];
    if (expected && typeof expected === "object" && "__op" in expected) {
      const operator = expected as { __op: string; value: number };
      if (operator.__op === "lt") {
        return typeof actual === "number" && actual < operator.value;
      }
    }
    return actual === expected;
  });
}
