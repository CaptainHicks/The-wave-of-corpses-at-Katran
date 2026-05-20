import crypto from "node:crypto";
import { authorizeCommandForPlayer, OnlineAuthorizationError } from "../../src/online/authorization";
import { applyCommand, createGame } from "../../src/domain/rules";
import type { Command } from "../../src/domain/types";
import { FileRoomStore } from "./fileRoomStore";
import type { StoredOnlineRoom, StoredRoomSeat } from "./types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class OnlineRoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnlineRoomError";
  }
}

export class OnlineRoomService {
  private readonly store: FileRoomStore;
  private readonly now: () => number;

  constructor({ store, now = () => Date.now() }: { store: FileRoomStore; now?: () => number }) {
    this.store = store;
    this.now = now;
  }

  async createRoom(input: {
    name: string;
    color: string;
    factionId?: string;
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
    color: string;
    factionId?: string;
  }): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat }> {
    await this.store.removeExpiredRooms();
    const room = await this.getRoomOrThrow(input.roomCode);
    if (room.status !== "lobby") {
      throw new OnlineRoomError("This room is no longer accepting players.");
    }
    if (room.seats.length >= room.targetPlayerCount) {
      throw new OnlineRoomError("This room is already full.");
    }
    if (input.factionId && room.seats.some((seat) => seat.factionId === input.factionId)) {
      throw new OnlineRoomError("That faction is already taken.");
    }

    const timestamp = this.now();
    const seat = this.createSeat(room.seats.length + 1, input, timestamp);
    const nextRoom: StoredOnlineRoom = {
      ...room,
      updatedAt: timestamp,
      seats: [...room.seats, seat]
    };
    await this.store.saveRoom(nextRoom);
    return { room: nextRoom, seat };
  }

  async startRoom(input: {
    roomCode: string;
    viewerPlayerId: string;
  }): Promise<StoredOnlineRoom> {
    const room = await this.getRoomOrThrow(input.roomCode);
    if (room.status !== "lobby") {
      throw new OnlineRoomError("This room has already started.");
    }
    if (room.hostPlayerId !== input.viewerPlayerId) {
      throw new OnlineRoomError("Only the host can start the room.");
    }
    if (room.seats.length !== room.targetPlayerCount) {
      throw new OnlineRoomError("The room must be full before the host can start the game.");
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
    await this.store.saveRoom(nextRoom);
    return nextRoom;
  }

  async applyPlayerCommand(input: {
    roomCode: string;
    viewerPlayerId: string;
    command: Command;
  }): Promise<StoredOnlineRoom> {
    const room = await this.getRoomOrThrow(input.roomCode);
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
    await this.store.saveRoom(nextRoom);
    return nextRoom;
  }

  async resumeSession(input: {
    roomCode: string;
    sessionToken: string;
  }): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat } | undefined> {
    await this.store.removeExpiredRooms();
    const resolved = await this.store.findRoomBySession(input.roomCode, input.sessionToken);
    if (!resolved) return undefined;

    const timestamp = this.now();
    const nextRoom: StoredOnlineRoom = {
      ...resolved.room,
      updatedAt: timestamp,
      seats: resolved.room.seats.map((seat) =>
        seat.sessionToken === input.sessionToken
          ? { ...seat, connected: true, lastSeenAt: timestamp }
          : seat
      )
    };
    await this.store.saveRoom(nextRoom);
    return {
      room: nextRoom,
      seat: nextRoom.seats.find((seat) => seat.sessionToken === input.sessionToken)!
    };
  }

  async markDisconnected(input: { roomCode: string; playerId: string }): Promise<StoredOnlineRoom | undefined> {
    const room = await this.store.loadRoom(input.roomCode);
    if (!room) return undefined;
    const timestamp = this.now();
    const nextRoom: StoredOnlineRoom = {
      ...room,
      updatedAt: timestamp,
      seats: room.seats.map((seat) =>
        seat.playerId === input.playerId ? { ...seat, connected: false, lastSeenAt: timestamp } : seat
      )
    };
    await this.store.saveRoom(nextRoom);
    return nextRoom;
  }

  async getRoom(roomCode: string): Promise<StoredOnlineRoom | undefined> {
    return this.store.loadRoom(roomCode);
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
    input: { name: string; color: string; factionId?: string },
    timestamp: number
  ): StoredRoomSeat {
    const name = input.name.trim();
    if (!name) {
      throw new OnlineRoomError("Player name is required.");
    }

    return {
      playerId: `p${joinIndex}`,
      name,
      color: input.color,
      factionId: input.factionId,
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
}

function assertTargetPlayerCount(targetPlayerCount: number) {
  if (targetPlayerCount < 2 || targetPlayerCount > 6) {
    throw new OnlineRoomError("Online rooms support 2 to 6 players.");
  }
}

function randomCode(length: number) {
  return Array.from(crypto.randomBytes(length))
    .map((value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length])
    .join("");
}
