import type { StoredOnlineRoom, StoredRoomSeat } from "./types";

export const LOBBY_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RoomStore {
  saveRoom(room: StoredOnlineRoom): Promise<void>;
  loadRoom(roomCode: string): Promise<StoredOnlineRoom | undefined>;
  deleteRoom(roomCode: string): Promise<void>;
  withRoomTransaction?<T>(roomCode: string, task: (transaction: RoomStoreTransaction) => Promise<T>): Promise<T>;
  findRoomBySession(
    roomCode: string,
    sessionToken: string
  ): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat } | undefined>;
  removeExpiredRooms(): Promise<string[]>;
}

export interface RoomStoreTransaction {
  loadRoom(): Promise<StoredOnlineRoom | undefined>;
  saveRoom(room: StoredOnlineRoom): Promise<void>;
  deleteRoom(): Promise<void>;
}

export async function runRoomStoreTransaction<T>(
  store: RoomStore,
  roomCode: string,
  task: (transaction: RoomStoreTransaction) => Promise<T>
): Promise<T> {
  if (store.withRoomTransaction) {
    return store.withRoomTransaction(roomCode, task);
  }

  return task({
    loadRoom: () => store.loadRoom(roomCode),
    saveRoom: (room) => store.saveRoom(room),
    deleteRoom: () => store.deleteRoom(roomCode)
  });
}
