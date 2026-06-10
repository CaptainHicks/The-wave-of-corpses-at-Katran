import crypto from "node:crypto";
import { PLAYER_FACTIONS } from "../../src/domain/constants";
import { runAiUntilHuman } from "../../src/domain/ai";
import { authorizeCommandForPlayer, OnlineAuthorizationError } from "../../src/online/authorization";
import { applyCommand, createGame } from "../../src/domain/rules";
import type { Command } from "../../src/domain/types";
import { runRoomStoreTransaction, type RoomStore, type RoomStoreTransaction } from "./roomStore";
import type { StoredOnlineRoom, StoredRoomSeat } from "./types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UNSELECTED_SEAT_COLOR = "#6f6657";
const MAX_CHAT_MESSAGES = 80;
const MAX_CHAT_MESSAGE_LENGTH = 160;

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
    aiPlayerCount?: number;
    fogEnabled: boolean;
  }): Promise<{ room: StoredOnlineRoom; seat: StoredRoomSeat }> {
    await this.store.removeExpiredRooms();
    assertTargetPlayerCount(input.targetPlayerCount);
    const aiPlayerCount = input.aiPlayerCount ?? 0;
    assertAiPlayerCount(aiPlayerCount, input.targetPlayerCount);

    const timestamp = this.now();
    const roomCode = await this.generateRoomCode();
    const seat = this.createSeat(1, input, timestamp);
    const aiSeats = Array.from({ length: aiPlayerCount }, (_, index) => {
      const faction = PLAYER_FACTIONS[index + 1];
      return this.createSeat(index + 2, { name: `${faction.name} AI` }, timestamp, {
        controller: "ai",
        factionId: faction.id
      });
    });
    const room: StoredOnlineRoom = {
      roomCode,
      hostPlayerId: seat.playerId,
      status: "lobby",
      fogEnabled: input.fogEnabled,
      targetPlayerCount: input.targetPlayerCount,
      createdAt: timestamp,
      updatedAt: timestamp,
      seats: [seat, ...aiSeats],
      chatMessages: [
        this.createSystemChatMessage(`${seat.name} 创建了房间。`, timestamp),
        ...(aiSeats.length > 0 ? [this.createSystemChatMessage(`已加入 ${aiSeats.length} 名 AI 玩家。`, timestamp)] : [])
      ]
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
      const name = normalizePlayerName(input.name);
      if (!name) {
        throw new OnlineRoomError("请输入玩家名称。");
      }

      const disconnectedSeat = findDisconnectedSeatByName(room.seats, name);
      if (disconnectedSeat) {
        const timestamp = this.now();
        const sessionToken = crypto.randomUUID();
        const nextRoom: StoredOnlineRoom = {
          ...room,
          updatedAt: timestamp,
          seats: room.seats.map((seat) =>
            seat.playerId === disconnectedSeat.playerId
              ? { ...seat, connected: true, lastSeenAt: timestamp, sessionToken }
              : seat
          ),
          chatMessages: this.appendChatMessage(
            room,
            this.createSystemChatMessage(`${disconnectedSeat.name} 重新接入了房间。`, timestamp)
          )
        };
        await transaction.saveRoom(nextRoom);
        return {
          room: nextRoom,
          seat: nextRoom.seats.find((seat) => seat.playerId === disconnectedSeat.playerId)!
        };
      }

      if (room.status !== "lobby") {
        throw new OnlineRoomError("这个房间已经不能加入了。");
      }
      if (room.seats.length >= room.targetPlayerCount) {
        throw new OnlineRoomError("这个房间已经满员了。");
      }

      const timestamp = this.now();
      const seat = this.createSeat(nextSeatIndex(room.seats), { name }, timestamp);
      const nextRoom: StoredOnlineRoom = {
        ...room,
        updatedAt: timestamp,
        seats: [...room.seats, seat],
        chatMessages: this.appendChatMessage(room, this.createSystemChatMessage(`${seat.name} 加入了房间。`, timestamp))
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
        throw new OnlineRoomError("只有在房间大厅里才能更换阵营。");
      }

      const seat = room.seats.find((entry) => entry.playerId === input.playerId);
      if (!seat) {
        throw new OnlineRoomError("没有在这个房间里找到你的玩家席位。");
      }
      if (seat.controller === "ai") {
        throw new OnlineRoomError("AI 玩家阵营由系统管理。");
      }

      if (input.factionId) {
        const faction = PLAYER_FACTIONS.find((entry) => entry.id === input.factionId);
        if (!faction) {
          throw new OnlineRoomError("未知阵营。");
        }
        const takenByOtherPlayer = room.seats.some(
          (entry) => entry.playerId !== input.playerId && entry.factionId === input.factionId
        );
        if (takenByOtherPlayer) {
          throw new OnlineRoomError("这个阵营已经被其他玩家选择了。");
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
        throw new OnlineRoomError("这个房间已经开始游戏了。");
      }
      if (room.hostPlayerId !== input.viewerPlayerId) {
        throw new OnlineRoomError("只有房主可以开始游戏。");
      }
      if (room.seats.length !== room.targetPlayerCount) {
        throw new OnlineRoomError("房间满员后，房主才能开始游戏。");
      }
      if (room.seats.some((seat) => !seat.factionId)) {
        throw new OnlineRoomError("所有玩家都选择阵营后，房主才能开始游戏。");
      }

      const timestamp = this.now();
      const createdGameState = createGame(
        room.seats.map((seat) => ({
          name: seat.name,
          color: seat.color,
          factionId: seat.factionId,
          controller: seat.controller ?? "human"
        })),
        `online-${room.roomCode}-${room.createdAt}`,
        false,
        room.fogEnabled
      );
      const gameState = runAiUntilHuman(createdGameState).state;
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
        throw new OnlineRoomError("这个房间当前不在游戏中。");
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
      const aiResult = runAiUntilHuman(nextState);
      const nextRoom: StoredOnlineRoom = {
        ...room,
        status: aiResult.state.phase === "victory" ? "finished" : "active",
        updatedAt: this.now(),
        gameState: aiResult.state,
        lastCommand: aiResult.lastCommand ?? input.command
      };
      await transaction.saveRoom(nextRoom);
      return nextRoom;
    });
  }

  async sendChatMessage(input: {
    roomCode: string;
    viewerPlayerId: string;
    text: string;
  }): Promise<StoredOnlineRoom> {
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await this.getRoomOrThrowFrom(transaction, input.roomCode);
      if (room.status !== "lobby") {
        throw new OnlineRoomError("只有在房间大厅里才能发送聊天消息。");
      }

      const seat = room.seats.find((entry) => entry.playerId === input.viewerPlayerId);
      if (!seat) {
        throw new OnlineRoomError("没有在这个房间里找到你的玩家席位。");
      }

      const text = normalizeChatMessage(input.text);
      if (!text) {
        throw new OnlineRoomError("请输入聊天内容。");
      }

      const timestamp = this.now();
      const nextRoom: StoredOnlineRoom = {
        ...room,
        updatedAt: timestamp,
        seats: room.seats.map((entry) =>
          entry.playerId === seat.playerId ? { ...entry, lastSeenAt: timestamp } : entry
        ),
        chatMessages: this.appendChatMessage(room, {
          id: crypto.randomUUID(),
          kind: "player",
          playerId: seat.playerId,
          playerName: seat.name,
          text,
          createdAt: timestamp
        })
      };
      await transaction.saveRoom(nextRoom);
      return nextRoom;
    });
  }

  async returnToLobby(input: {
    roomCode: string;
    viewerPlayerId: string;
  }): Promise<StoredOnlineRoom> {
    return this.withRoomLock(input.roomCode, async (transaction) => {
      const room = await this.getRoomOrThrowFrom(transaction, input.roomCode);
      if (!room.seats.some((seat) => seat.playerId === input.viewerPlayerId)) {
        throw new OnlineRoomError("你不在这个房间中。");
      }
      if (room.status === "active") {
        throw new OnlineRoomError("这个房间还在游戏中。");
      }
      if (room.status === "lobby") {
        return room;
      }

      const timestamp = this.now();
      const nextRoom: StoredOnlineRoom = {
        ...room,
        status: "lobby",
        updatedAt: timestamp,
        gameState: undefined,
        lastCommand: undefined
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
      if (nextSeats.length === 0 || nextSeats.every((seat) => seat.controller === "ai")) {
        await transaction.deleteRoom();
        return undefined;
      }

      const timestamp = this.now();
      const nextRoom: StoredOnlineRoom = {
        ...room,
        hostPlayerId:
          room.hostPlayerId === input.playerId
            ? nextSeats.find((seat) => seat.controller !== "ai")?.playerId ?? nextSeats[0].playerId
            : room.hostPlayerId,
        updatedAt: timestamp,
        seats: nextSeats,
        chatMessages: this.appendChatMessage(
          room,
          this.createSystemChatMessage(`${room.seats.find((seat) => seat.playerId === input.playerId)?.name ?? "玩家"} 离开了房间。`, timestamp)
        )
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
    throw new OnlineRoomError("房间码生成失败，请稍后重试。");
  }

  private createSeat(
    joinIndex: number,
    input: { name: string },
    timestamp: number,
    options: { controller?: StoredRoomSeat["controller"]; factionId?: string } = {}
  ): StoredRoomSeat {
    const name = normalizePlayerName(input.name);
    if (!name) {
      throw new OnlineRoomError("请输入玩家名称。");
    }

    return {
      playerId: `p${joinIndex}`,
      name,
      color: resolveSeatColor(options.factionId),
      factionId: options.factionId,
      controller: options.controller ?? "human",
      sessionToken: crypto.randomUUID(),
      connected: options.controller !== "ai",
      joinedAt: timestamp,
      lastSeenAt: timestamp
    };
  }

  private async getRoomOrThrow(roomCode: string) {
    const room = await this.store.loadRoom(roomCode);
    if (!room) {
      throw new OnlineRoomError("没有找到这个房间。");
    }
    return room;
  }

  private async getRoomOrThrowFrom(transaction: RoomStoreTransaction, roomCode: string) {
    const room = await transaction.loadRoom();
    if (!room) {
      throw new OnlineRoomError("没有找到这个房间。");
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

  private appendChatMessage(room: StoredOnlineRoom, message: NonNullable<StoredOnlineRoom["chatMessages"]>[number]) {
    return [...(room.chatMessages ?? []), message].slice(-MAX_CHAT_MESSAGES);
  }

  private createSystemChatMessage(text: string, timestamp: number) {
    return {
      id: crypto.randomUUID(),
      kind: "system" as const,
      text,
      createdAt: timestamp
    };
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
    throw new OnlineRoomError("在线房间支持 2 到 6 名玩家。");
  }
}

function assertAiPlayerCount(aiPlayerCount: number, targetPlayerCount: number) {
  if (!Number.isInteger(aiPlayerCount) || aiPlayerCount < 0 || aiPlayerCount >= targetPlayerCount) {
    throw new OnlineRoomError("在线房间至少需要保留 1 名人类玩家席位。");
  }
}

function nextSeatIndex(seats: StoredRoomSeat[]) {
  return seats.reduce((max, seat) => {
    const match = /^p(\d+)$/.exec(seat.playerId);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0) + 1;
}

function normalizePlayerName(name: string) {
  return name.trim();
}

function normalizeChatMessage(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
}

function findDisconnectedSeatByName(seats: StoredRoomSeat[], name: string) {
  const normalizedName = name.toLocaleLowerCase();
  const matches = seats.filter(
    (seat) =>
      seat.controller !== "ai" &&
      !seat.connected &&
      normalizePlayerName(seat.name).toLocaleLowerCase() === normalizedName
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function randomCode(length: number) {
  return Array.from(crypto.randomBytes(length))
    .map((value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length])
    .join("");
}
