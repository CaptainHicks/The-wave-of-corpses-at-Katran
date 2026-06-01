import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredOnlineRoom, StoredRoomSeat } from "./types";
import { ACTIVE_ROOM_TTL_MS, LOBBY_TTL_MS, type RoomStore, type RoomStoreTransaction } from "./roomStore";

export class FileRoomStore implements RoomStore {
  private readonly rootDir: string;
  private readonly now: () => number;

  constructor({ rootDir, now = () => Date.now() }: { rootDir: string; now?: () => number }) {
    this.rootDir = rootDir;
    this.now = now;
  }

  async saveRoom(room: StoredOnlineRoom): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const nextRoom = { ...room, updatedAt: room.updatedAt ?? this.now() };
    const targetPath = this.getRoomPath(room.roomCode);
    const tempPath = `${targetPath}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tempPath, JSON.stringify(nextRoom, null, 2), "utf8");
    await rename(tempPath, targetPath);
  }

  async loadRoom(roomCode: string): Promise<StoredOnlineRoom | undefined> {
    try {
      const raw = await readFile(this.getRoomPath(roomCode), "utf8");
      return JSON.parse(raw) as StoredOnlineRoom;
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }

  async deleteRoom(roomCode: string): Promise<void> {
    await rm(this.getRoomPath(roomCode), { force: true });
  }

  async withRoomTransaction<T>(roomCode: string, task: (transaction: RoomStoreTransaction) => Promise<T>): Promise<T> {
    return task({
      loadRoom: () => this.loadRoom(roomCode),
      saveRoom: (room) => this.saveRoom(room),
      deleteRoom: () => this.deleteRoom(roomCode)
    });
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
    let entries: string[] = [];
    try {
      entries = await readdir(this.rootDir);
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }

    const removed: string[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const room = await this.loadRoom(path.basename(entry, ".json"));
      if (!room) continue;
      if (!this.isExpired(room)) continue;
      await rm(this.getRoomPath(room.roomCode), { force: true });
      removed.push(room.roomCode);
    }
    return removed;
  }

  private getRoomPath(roomCode: string) {
    return path.join(this.rootDir, `${roomCode}.json`);
  }

  private isExpired(room: StoredOnlineRoom) {
    const ttl = room.status === "lobby" ? LOBBY_TTL_MS : ACTIVE_ROOM_TTL_MS;
    return this.now() - room.updatedAt > ttl;
  }
}

function isMissingFileError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
