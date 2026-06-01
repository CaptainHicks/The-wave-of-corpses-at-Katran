import crypto from "node:crypto";
import { PLAYER_FACTIONS } from "../../src/domain/constants";
import { authorizeCommandForPlayer, OnlineAuthorizationError } from "../../src/online/authorization";
import { applyCommand, createGame } from "../../src/domain/rules";
import type { Command } from "../../src/domain/types";
import { runRoomStoreTransaction, type RoomStore, type RoomStoreTransaction } from "./roomStore";
import type { StoredOnlineRoom, StoredRoomSeat } from "./types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UNSELECTED_SEAT_COLOR = "#6f6657";

export class OnlineRoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnlineRoomError";
  }
}

export class OnlineRoomService {
  private readonly store: RoomStore;
  private readonly now: () => number;
  private readonly roomLocks = new Map<string, Promise<void>>();

  constructor({ store, now = () => Date.now() }: { store: RoomStore; now?: () => number }) {
    this.store = store;
    this.now = now;
  }

  async createRoom(input: {
    name: string;
    targetPlayerCount: number;
    fogEnabled: boolean;
  }): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat }> {
    await this.store.removeExpiredRooms();
    assertTargetPlayerCount(input.targetPlayerCount);

    const timestamp = this.now();
    const roomCode = await this.generateRoomCode();
    const seat = this.createSeat(1, input, timestamp);
    const room: StoredOnlineRoom = {
      roomCode,
      hostPlayerId: seat.playerId,
      status: "lobby",
      fogEnabled: input.fogEnabled,
      targetPlayerCount: input.targetPlayerCount,
      createdAt: timestamp,
      updatedAt: timestamp,
      seats: [seat]
    };
    await this.store.saveRoom(room);
    return { room, seat };
  }

  async joinRoom(input: {
    roomCode: string;
    name: string;
  }): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat }> {
    await this.store.removeExpiredRooms();
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await this.getRoomOrThrowFrom(transaction, input.roomCode);
      if (room.status !== "lobby") {
        throw new OnlineRoomError("This room is no longer accepting players.");
      }
      if (room.seats.length >= room.targetPlayerCount) {
        throw new OnlineRoomError("This room is already full.");
      }

      const timestamp = this.now();
      const seat = this.createSeat(nextSeatIndex(room.seats), input, timestamp);
      const nextRoom: StoredOnlineRoom = {
        ...room,
        updatedAt: timestamp,
        seats: [...room.seats, seat]
      };
      await transaction.saveRoom(nextRoom);
      return { room: nextRoom, seat };
    });
  }

  async chooseFaction(input: {
    roomCode: string;
    playerId: string;
    factionId?: string;
  }): Promise<StoredOnlineRoom> {
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await this.getRoomOrThrowFrom(transaction, input.roomCode);
      if (room.status !== "lobby") {
        throw new OnlineRoomError("Factions can only be changed while the room is in the lobby.");
      }

      const seat = room.seats.find((entry) => entry.playerId === input.playerId);
      if (!seat) {
        throw new OnlineRoomError("Player seat not found in this room.");
      }

      if (input.factionId) {
        const faction = PLAYER_FACTIONS.find((entry) => entry.id === input.factionId);
        if (!faction) {
          throw new OnlineRoomError("Unknown faction.");
        }
        const takenByOtherPlayer = room.seats.some(
          (entry) => entry.playerId !== input.playerId && entry.factionId === input.factionId
        );
        if (takenByOtherPlayer) {
          throw new OnlineRoomError("That faction has already been chosen by another player.");
        }
      }

      const timestamp = this.now();
      const nextRoom: StoredOnlineRoom = {
        ...room,
        updatedAt: timestamp,
        seats: room.seats.map((entry) =>
          entry.playerId === input.playerId
            ? {
                ...entry,
                factionId: input.factionId,
                color: resolveSeatColor(input.factionId),
                lastSeenAt: timestamp
              }
            : entry
        )
      };
      await transaction.saveRoom(nextRoom);
      return nextRoom;
    });
  }

  async startRoom(input: {
    roomCode: string;
    viewerPlayerId: string;
  }): Promise<StoredOnlineRoom> {
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await this.getRoomOrThrowFrom(transaction, input.roomCode);
      if (room.status !== "lobby") {
        throw new OnlineRoomError("This room has already started.");
      }
      if (room.hostPlayerId !== input.viewerPlayerId) {
        throw new OnlineRoomError("Only the host can start the room.");
      }
      if (room.seats.length !== room.targetPlayerCount) {
        throw new OnlineRoomError("The room must be full before the host can start the game.");
      }
      if (room.seats.some((seat) => !seat.factionId)) {
        throw new OnlineRoomError("Every player must choose a faction before the host can start the game.");
      }

      const timestamp = this.now();
      const gameState = createGame(
        room.seats.map((seat) => ({
          name: seat.name,
          color: seat.color,
          factionId: seat.factionId
        })),
        `online-${room.roomCode}-${room.createdAt}`,
        false,
        room.fogEnabled
      );
      const nextRoom: StoredOnlineRoom = {
        ...room,
        status: gameState.phase === "victory" ? "finished" : "active",
        updatedAt: timestamp,
        gameState,
        lastCommand: undefined
      };
      await transaction.saveRoom(nextRoom);
      return nextRoom;
    });
  }

  async applyPlayerCommand(input: {
    roomCode: string;
    viewerPlayerId: string;
    command: Command;
  }): Promise<StoredOnlineRoom> {
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await this.getRoomOrThrowFrom(transaction, input.roomCode);
      if (room.status !== "active" || !room.gameState) {
        throw new OnlineRoomError("This room is not in an active game.");
      }

      try {
        authorizeCommandForPlayer(room.gameState, input.viewerPlayerId, input.command);
      } catch (error) {
        if (error instanceof OnlineAuthorizationError) {
          throw new OnlineRoomError(error.message);
        }
        throw error;
      }

      const nextState = applyCommand(room.gameState, input.command);
      const nextRoom: StoredOnlineRoom = {
        ...room,
        status: nextState.phase === "victory" ? "finished" : "active",
        updatedAt: this.now(),
        gameState: nextState,
        lastCommand: input.command
      };
      await transaction.saveRoom(nextRoom);
      return nextRoom;
    });
  }

  async resumeSession(input: {
    roomCode: string;
    sessionToken: string;
  }): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat } | undefined> {
    await this.store.removeExpiredRooms();
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await transaction.loadRoom();
      if (!room) return undefined;
      const resolvedSeat = room.seats.find((seat) => seat.sessionToken === input.sessionToken);
      if (!resolvedSeat) return undefined;

      const timestamp = this.now();
      const nextRoom: StoredOnlineRoom = {
        ...room,
        updatedAt: timestamp,
        seats: room.seats.map((seat) =>
          seat.sessionToken === input.sessionToken
            ? { ...seat, connected: true, lastSeenAt: timestamp }
            : seat
        )
      };
      await transaction.saveRoom(nextRoom);
      return {
        room: nextRoom,
        seat: nextRoom.seats.find((seat) => seat.sessionToken === input.sessionToken)!
      };
    });
  }

  async markDisconnected(input: { roomCode: string; playerId: string }): Promise<StoredOnlineRoom | undefined> {
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await transaction.loadRoom();
      if (!room) return undefined;
      return this.saveDisconnectedRoom(transaction, room, input.playerId);
    });
  }

  async leaveRoom(input: { roomCode: string; playerId: string }): Promise<StoredOnlineRoom | undefined> {
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await transaction.loadRoom();
      if (!room) return undefined;
      if (room.status !== "lobby") {
        return this.saveDisconnectedRoom(transaction, room, input.playerId);
      }

      const nextSeats = room.seats.filter((seat) => seat.playerId !== input.playerId);
      if (nextSeats.length === room.seats.length) return room;
      if (nextSeats.length === 0) {
        await transaction.deleteRoom();
        return undefined;
      }

      const timestamp = this.now();
      const nextRoom: StoredOnlineRoom = {
        ...room,
        hostPlayerId: room.hostPlayerId === input.playerId ? nextSeats[0].playerId : room.hostPlayerId,
        updatedAt: timestamp,
        seats: nextSeats
      };
      await transaction.saveRoom(nextRoom);
      return nextRoom;
    });
  }

  async getRoom(roomCode: string): Promise<StoredOnlineRoom | undefined> {
    return this.store.loadRoom(roomCode);
  }

  async inspectRoom(input: { roomCode: string }): Promise<StoredOnlineRoom> {
    await this.store.removeExpiredRooms();
    return this.getRoomOrThrow(input.roomCode);
  }

  private async generateRoomCode() {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const roomCode = randomCode(6);
      const existing = await this.store.loadRoom(roomCode);
      if (!existing) return roomCode;
    }
    throw new OnlineRoomError("Failed to allocate a unique room code.");
  }

  private createSeat(
    joinIndex: number,
    input: { name: string },
    timestamp: number
  ): StoredRoomSeat {
    const name = input.name.trim();
    if (!name) {
      throw new OnlineRoomError("Player name is required.");
    }

    return {
      playerId: `p${joinIndex}`,
      name,
      color: resolveSeatColor(undefined),
      factionId: undefined,
      sessionToken: crypto.randomUUID(),
      connected: true,
      joinedAt: timestamp,
      lastSeenAt: timestamp
    };
  }

  private async getRoomOrThrow(roomCode: string) {
    const room = await this.store.loadRoom(roomCode);
    if (!room) {
      throw new OnlineRoomError("Room not found.");
    }
    return room;
  }

  private async getRoomOrThrowFrom(transaction: RoomStoreTransaction, roomCode: string) {
    const room = await transaction.loadRoom();
    if (!room) {
      throw new OnlineRoomError("Room not found.");
    }
    return room;
  }

  private async saveDisconnectedRoom(transaction: RoomStoreTransaction, room: StoredOnlineRoom, playerId: string) {
    const timestamp = this.now();
    const nextRoom: StoredOnlineRoom = {
      ...room,
      updatedAt: timestamp,
      seats: room.seats.map((seat) =>
        seat.playerId === playerId ? { ...seat, connected: false, lastSeenAt: timestamp } : seat
      )
    };
    await transaction.saveRoom(nextRoom);
    return nextRoom;
  }

  private async withRoomLock<T>(roomCode: string, task: (transaction: RoomStoreTransaction) => Promise<T>): Promise<T> {
    const previous = this.roomLocks.get(roomCode) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current, () => current);
    this.roomLocks.set(roomCode, queued);

    await previous.catch(() => undefined);
    try {
      return await runRoomStoreTransaction(this.store, roomCode, task);
    } finally {
      release();
      if (this.roomLocks.get(roomCode) === queued) {
        this.roomLocks.delete(roomCode);
      }
    }
  }
}

function resolveSeatColor(factionId?: string) {
  if (!factionId) return UNSELECTED_SEAT_COLOR;
  return PLAYER_FACTIONS.find((faction) => faction.id === factionId)?.color ?? UNSELECTED_SEAT_COLOR;
}

function assertTargetPlayerCount(targetPlayerCount: number) {
  if (targetPlayerCount < 2 || targetPlayerCount > 6) {
    throw new OnlineRoomError("Online rooms support 2 to 6 players.");
  }
}

function nextSeatIndex(seats: StoredRoomSeat[]) {
  return seats.reduce((max, seat) => {
    const match = /^p(\d+)$/.exec(seat.playerId);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0) + 1;
}

function randomCode(length: number) {
  return Array.from(crypto.randomBytes(length))
    .map((value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length])
    .join("");
}
