import type { Command, GameState } from "../../src/domain/types";

export type OnlineRoomStatus = "lobby" | "active" | "finished";

export interface StoredRoomSeat {
  playerId: string;
  name: string;
  color: string;
  factionId?: string;
  sessionToken: string;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface StoredOnlineRoom {
  roomCode: string;
  hostPlayerId: string;
  status: OnlineRoomStatus;
  fogEnabled: boolean;
  targetPlayerCount: number;
  createdAt: number;
  updatedAt: number;
  seats: StoredRoomSeat[];
  gameState?: GameState;
  lastCommand?: Command;
}
