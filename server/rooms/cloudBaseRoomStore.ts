import { createRequire } from "node:module";
import type { StoredOnlineRoom, StoredRoomSeat } from "./types";
import { ACTIVE_ROOM_TTL_MS, LOBBY_TTL_MS, type RoomStore, type RoomStoreTransaction } from "./roomStore";

const require = createRequire(import.meta.url);
const DEFAULT_CLOUDBASE_ENV_ID = "zombie-catan-d8g07asiy5e3f05c1";
const RECENT_ROOM_CACHE_TTL_MS = 30_000;

interface CloudBaseCommandLike {
  lt(value: number): unknown;
}

interface CloudBaseDocumentRefLike {
  get(): Promise<{ data?: unknown[] | unknown }>;
  set(data: unknown): Promise<unknown>;
  remove?(): Promise<unknown>;
  delete?(): Promise<unknown>;
}

interface CloudBaseQueryLike {
  get(): Promise<{ data?: unknown[] }>;
}

interface CloudBaseCollectionLike {
  doc(id: string): CloudBaseDocumentRefLike;
  where(query: Record<string, unknown>): CloudBaseQueryLike;
}

interface CloudBaseDbLike {
  command: CloudBaseCommandLike;
  collection(name: string): CloudBaseCollectionLike;
  runTransaction?<T>(
    task: (transaction: { collection(name: string): CloudBaseCollectionLike }) => Promise<T>
  ): Promise<{ result?: T } | T>;
}

interface CloudBaseRoomStoreOptions {
  collectionName?: string;
  now?: () => number;
  db?: CloudBaseDbLike;
  cacheTtlMs?: number;
}

type StoredOnlineRoomRecord = StoredOnlineRoom & { _id?: string };
type CloudBaseAuthMode = "access-key" | "temporary-credentials" | "secret-key" | "default";

export class CloudBaseRoomStore implements RoomStore {
  private readonly collectionName: string;
  private readonly now: () => number;
  private readonly dbFactory: () => CloudBaseDbLike;
  private readonly cacheTtlMs: number;
  private readonly recentRooms = new Map<string, { room: StoredOnlineRoom; expiresAt: number }>();
  private db?: CloudBaseDbLike;

  constructor({
    collectionName = process.env.CLOUDBASE_ROOM_COLLECTION ?? "online_rooms",
    now = () => Date.now(),
    db,
    cacheTtlMs = RECENT_ROOM_CACHE_TTL_MS
  }: CloudBaseRoomStoreOptions = {}) {
    this.collectionName = collectionName;
    this.now = now;
    this.cacheTtlMs = cacheTtlMs;
    this.dbFactory = () => db ?? createCloudBaseDatabase();
  }

  async saveRoom(room: StoredOnlineRoom): Promise<void> {
    const nextRoom = { ...room, updatedAt: room.updatedAt ?? this.now() };
    await this.collection().doc(room.roomCode).set(nextRoom);
    this.cacheRoom(nextRoom);
  }

  async loadRoom(roomCode: string): Promise<StoredOnlineRoom | undefined> {
    const result = await this.collection().doc(roomCode).get();
    const room = normalizeRoomGetResult(result.data);
    if (room) {
      this.cacheRoom(room);
      return room;
    }
    return this.loadCachedRoom(roomCode);
  }

  async deleteRoom(roomCode: string): Promise<void> {
    await removeCloudBaseDocument(this.collection().doc(roomCode));
    this.recentRooms.delete(roomCode);
  }

  async withRoomTransaction<T>(roomCode: string, task: (transaction: RoomStoreTransaction) => Promise<T>): Promise<T> {
    const database = this.database();
    if (!database.runTransaction) {
      return task({
        loadRoom: () => this.loadRoom(roomCode),
        saveRoom: (room) => this.saveRoom(room),
        deleteRoom: () => this.deleteRoom(roomCode)
      });
    }

    const transactionResult = await database.runTransaction(async (transaction) => {
      const document = transaction.collection(this.collectionName).doc(roomCode);
      return task({
        loadRoom: async () => {
          const result = await document.get();
          const room = normalizeRoomGetResult(result.data);
          if (room) {
            this.cacheRoom(room);
            return room;
          }
          return this.loadCachedRoom(roomCode);
        },
        saveRoom: async (room) => {
          const nextRoom = { ...room, updatedAt: room.updatedAt ?? this.now() };
          await document.set(nextRoom);
          this.cacheRoom(nextRoom);
        },
        deleteRoom: async () => {
          await removeCloudBaseDocument(document);
          this.recentRooms.delete(roomCode);
        }
      });
    });

    return unwrapTransactionResult(transactionResult);
  }

  async findRoomBySession(
    roomCode: string,
    sessionToken: string
  ): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat } | undefined> {
    const room = await this.loadRoom(roomCode);
    if (!room) return undefined;
    const seat = room.seats.find((entry) => entry.sessionToken === sessionToken);
    if (!seat) return undefined;
    return { room, seat };
  }

  async removeExpiredRooms(): Promise<string[]> {
    const _ = this.database().command;
    const staleLobbyCutoff = this.now() - LOBBY_TTL_MS;
    const staleActiveCutoff = this.now() - ACTIVE_ROOM_TTL_MS;

    const [staleLobbiesResult, staleActiveResult] = await Promise.all([
      this.collection()
        .where({
          status: "lobby",
          updatedAt: _.lt(staleLobbyCutoff)
        })
        .get(),
      this.collection()
        .where({
          updatedAt: _.lt(staleActiveCutoff)
        })
        .get()
    ]);

    const expiredRooms = dedupeRooms([
      ...(staleLobbiesResult.data ?? []),
      ...((staleActiveResult.data ?? []).filter((room) => {
        const normalized = normalizeRoomRecord(room);
        return normalized && normalized.status !== "lobby";
      }) as StoredOnlineRoomRecord[])
    ]);

    await Promise.all(expiredRooms.map((room) => removeCloudBaseDocument(this.collection().doc(room.roomCode))));
    return expiredRooms.map((room) => room.roomCode);
  }

  private collection() {
    return this.database().collection(this.collectionName);
  }

  private database() {
    if (!this.db) {
      const runtimeInfo = getCloudBaseRuntimeInfo();
      console.log(
        `[CloudBaseRoomStore] Initializing collection "${this.collectionName}" with auth mode "${runtimeInfo.authMode}".`
      );
      try {
        this.db = this.dbFactory();
      } catch (error) {
        console.error("[CloudBaseRoomStore] Failed to initialize CloudBase database.", error);
        throw error;
      }
    }

    return this.db;
  }

  private cacheRoom(room: StoredOnlineRoom) {
    if (this.cacheTtlMs <= 0) return;
    this.recentRooms.set(room.roomCode, {
      room: structuredClone(room),
      expiresAt: this.now() + this.cacheTtlMs
    });
  }

  private loadCachedRoom(roomCode: string) {
    const cached = this.recentRooms.get(roomCode);
    if (!cached) return undefined;
    if (cached.expiresAt <= this.now()) {
      this.recentRooms.delete(roomCode);
      return undefined;
    }
    return structuredClone(cached.room);
  }
}

function createCloudBaseDatabase(): CloudBaseDbLike {
  const initOptions = resolveCloudBaseInitOptions();
  if (!initOptions.env) {
    throw new Error("CLOUDBASE_ENV_ID or TCB_ENV_ID is required when ROOM_STORE_DRIVER=cloudbase.");
  }

  const cloudbase = require("@cloudbase/node-sdk") as {
    init(options: Record<string, unknown>): { database(): unknown };
  };
  const app = cloudbase.init(initOptions);

  return app.database() as unknown as CloudBaseDbLike;
}

export function resolveCloudBaseInitOptions(env: NodeJS.ProcessEnv = process.env) {
  const environmentId = resolveCloudBaseEnvironmentId(env);
  const accessKey = env.CLOUDBASE_APIKEY ?? env.TCB_API_KEY;
  const secretId = env.TENCENTCLOUD_SECRETID;
  const secretKey = env.TENCENTCLOUD_SECRETKEY;
  const sessionToken = env.TENCENTCLOUD_SESSIONTOKEN;
  const timeout = Number(env.CLOUDBASE_SDK_TIMEOUT_MS ?? 5_000);
  const options: Record<string, unknown> = {
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 5_000
  };

  if (environmentId) {
    options.env = environmentId;
  }

  if (accessKey) {
    options.accessKey = accessKey;
    return options;
  }

  if (secretId && secretKey && sessionToken) {
    options.secretId = secretId;
    options.secretKey = secretKey;
    options.sessionToken = sessionToken;
    return options;
  }

  if (secretId && secretKey && env.CLOUDBASE_EXPLICIT_SECRET_KEY_AUTH === "true") {
    options.secretId = secretId;
    options.secretKey = secretKey;
  }

  return options;
}

export function getCloudBaseRuntimeInfo(env: NodeJS.ProcessEnv = process.env) {
  const environmentId = resolveCloudBaseEnvironmentId(env);
  const timeout = Number(env.CLOUDBASE_SDK_TIMEOUT_MS ?? 5_000);

  return {
    environmentId,
    authMode: resolveCloudBaseAuthMode(env),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 5_000
  };
}

function resolveCloudBaseEnvironmentId(env: NodeJS.ProcessEnv) {
  return env.CLOUDBASE_ENV_ID ?? env.TCB_ENV_ID ?? env.TCB_ENV ?? DEFAULT_CLOUDBASE_ENV_ID;
}

function resolveCloudBaseAuthMode(env: NodeJS.ProcessEnv): CloudBaseAuthMode {
  if (env.CLOUDBASE_APIKEY ?? env.TCB_API_KEY) {
    return "access-key";
  }

  if (env.TENCENTCLOUD_SECRETID && env.TENCENTCLOUD_SECRETKEY && env.TENCENTCLOUD_SESSIONTOKEN) {
    return "temporary-credentials";
  }

  if (env.TENCENTCLOUD_SECRETID && env.TENCENTCLOUD_SECRETKEY) {
    return "secret-key";
  }

  return "default";
}

function normalizeRoomRecord(record: unknown): StoredOnlineRoom | undefined {
  if (!record || typeof record !== "object") return undefined;
  const { _id: _unused, ...room } = record as StoredOnlineRoomRecord;
  return room as StoredOnlineRoom;
}

function normalizeRoomGetResult(data: unknown[] | unknown): StoredOnlineRoom | undefined {
  return normalizeRoomRecord(Array.isArray(data) ? data[0] : data);
}

async function removeCloudBaseDocument(document: CloudBaseDocumentRefLike) {
  if (document.remove) {
    await document.remove();
    return;
  }
  if (document.delete) {
    await document.delete();
    return;
  }
  throw new Error("CloudBase document reference does not support remove/delete.");
}

function unwrapTransactionResult<T>(transactionResult: { result?: T } | T): T {
  if (transactionResult && typeof transactionResult === "object" && "result" in transactionResult) {
    return transactionResult.result as T;
  }
  return transactionResult as T;
}

function dedupeRooms(records: unknown[]): StoredOnlineRoom[] {
  const unique = new Map<string, StoredOnlineRoom>();
  for (const record of records) {
    const room = normalizeRoomRecord(record);
    if (!room) continue;
    unique.set(room.roomCode, room);
  }
  return [...unique.values()];
}
