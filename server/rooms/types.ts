import type { Command, GameState } from "../../src/domain/types";

export type OnlineRoomStatus = "lobby" | "active" | "finished";

export interface StoredRoomSeat {
  playerId: string;
  name: string;
  color: string;
  factionId?: string;
  controller?: "human" | "ai";
  sessionToken: string;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface StoredLobbyChatMessage {
  id: string;
  kind: "system" | "player";
  playerId?: string;
  playerName?: string;
  text: string;
  createdAt: number;
}

export interface StoredOnlineRoom {
  roomCode: string;
  hostPlayerId: string;
  status: OnlineRoomStatus;
  fogEnabled: boolean;
  boardStructureId?: string;
  targetPlayerCount: number;
  createdAt: number;
  updatedAt: number;
  seats: StoredRoomSeat[];
  chatMessages?: StoredLobbyChatMessage[];
  gameState?: GameState;
  lastCommand?: Command;
}
