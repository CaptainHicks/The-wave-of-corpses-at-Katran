import { calculateScore, resourceTotal } from "../domain/rules";
import type { Command, DevCard, GameState, PendingChoice, PlayerState, Resources } from "../domain/types";

export interface RoomMetaSnapshot {
  roomCode: string;
  hostPlayerId: string;
  status: "lobby" | "active" | "finished";
  connectedPlayerIds: string[];
}

export interface LobbyRoomMetaSnapshot extends RoomMetaSnapshot {
  targetPlayerCount: number;
  fogEnabled: boolean;
}

export interface RoomCreateRequest {
  name: string;
  color: string;
  factionId?: string;
  targetPlayerCount: number;
  fogEnabled: boolean;
}

export interface RoomJoinRequest {
  roomCode: string;
  name: string;
  color: string;
  factionId?: string;
}

export interface RoomResumeRequest {
  roomCode: string;
  sessionToken: string;
}

export interface RoomStartRequest {
  roomCode: string;
}

export interface RoomCommandRequest {
  roomCode: string;
  command: Command;
}

export interface OnlineEventSuccess {
  ok: true;
  roomCode: string;
  viewerPlayerId: string;
  sessionToken?: string;
}

export interface OnlineEventFailure {
  ok: false;
  error: string;
}

export type OnlineEventAck = OnlineEventSuccess | OnlineEventFailure;

export interface PublicOnlinePlayerState
  extends Pick<
    PlayerState,
    | "id"
    | "name"
    | "color"
    | "factionId"
    | "militia"
    | "defenderTokens"
    | "movedConvoyThisTurn"
    | "pieces"
    | "usedDevCardThisTurn"
  > {
  score: number;
  resourceCount: number;
  devCardCount: number;
  revealedDevCards: DevCard[];
  connected: boolean;
}

export interface PublicPendingState {
  kind: PendingChoice["kind"];
  playerId: string;
  amount?: number;
  reason?: PendingChoice extends infer T ? T extends { reason: infer R } ? R : never : never;
  secondCamp?: boolean;
  campVertexId?: string;
  stealAfterMove?: boolean;
  targetPlayerIds?: string[];
  targetPlayerId?: string;
  candidateTargetIds?: string[];
  declinedTargetIds?: string[];
  vertexIds?: string[];
  actorId?: string;
}

export interface PublicOnlineGameState {
  debugMode?: boolean;
  fogEnabled?: boolean;
  currentPlayerId: string;
  phase: GameState["phase"];
  board: GameState["board"];
  zombieTrack: number;
  zombieTileId: string;
  merchant: GameState["merchant"];
  log: GameState["log"];
  turn: number;
  setup: GameState["setup"];
  awards: GameState["awards"];
  dice?: [number, number];
  winnerId?: string;
  players: PublicOnlinePlayerState[];
  pending?: PublicPendingState;
}

export interface ViewerPrivateState {
  resources: Resources;
  devCards: DevCard[];
  pending?: PendingChoice;
}

export interface OnlineGameView {
  kind: "game";
  viewerPlayerId: string;
  publicState: PublicOnlineGameState;
  viewerPrivate: ViewerPrivateState;
  roomMeta: RoomMetaSnapshot;
  lastCommand?: Command;
}

export interface LobbySeatView {
  playerId: string;
  name: string;
  color: string;
  factionId?: string;
  connected: boolean;
}

export interface LobbyView {
  kind: "lobby";
  viewerPlayerId: string;
  roomMeta: LobbyRoomMetaSnapshot;
  seats: LobbySeatView[];
  canStart: boolean;
}

export type RoomView = LobbyView | OnlineGameView;

export function buildOnlineGameView(
  roomMeta: RoomMetaSnapshot,
  state: GameState,
  viewerPlayerId: string,
  lastCommand?: Command
): OnlineGameView {
  const viewer = state.players.find((player) => player.id === viewerPlayerId);
  if (!viewer) {
    throw new Error(`Viewer ${viewerPlayerId} does not belong to this game.`);
  }

  return {
    kind: "game",
    viewerPlayerId,
    publicState: {
      debugMode: state.debugMode,
      fogEnabled: state.fogEnabled,
      currentPlayerId: state.currentPlayerId,
      phase: state.phase,
      board: state.board,
      zombieTrack: state.zombieTrack,
      zombieTileId: state.zombieTileId,
      merchant: state.merchant,
      log: state.log,
      turn: state.turn,
      setup: state.setup,
      awards: state.awards,
      dice: state.dice,
      winnerId: state.winnerId,
      players: state.players.map((player) => buildPublicPlayer(player, state, roomMeta.connectedPlayerIds)),
      pending: sanitizePendingForPublic(state.pending)
    },
    viewerPrivate: {
      resources: viewer.resources,
      devCards: viewer.devCards,
      pending: state.pending?.playerId === viewerPlayerId ? state.pending : undefined
    },
    roomMeta,
    lastCommand
  };
}

export function buildLobbyView(
  roomMeta: LobbyRoomMetaSnapshot,
  seats: Array<{
    playerId: string;
    name: string;
    color: string;
    factionId?: string;
    connected: boolean;
  }>,
  viewerPlayerId: string
): LobbyView {
  return {
    kind: "lobby",
    viewerPlayerId,
    roomMeta,
    seats: seats.map((seat) => ({
      playerId: seat.playerId,
      name: seat.name,
      color: seat.color,
      factionId: seat.factionId,
      connected: seat.connected
    })),
    canStart: viewerPlayerId === roomMeta.hostPlayerId && seats.length === roomMeta.targetPlayerCount
  };
}

function buildPublicPlayer(
  player: PlayerState,
  state: GameState,
  connectedPlayerIds: string[]
): PublicOnlinePlayerState {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    factionId: player.factionId,
    militia: player.militia,
    defenderTokens: player.defenderTokens,
    movedConvoyThisTurn: player.movedConvoyThisTurn,
    pieces: player.pieces,
    usedDevCardThisTurn: player.usedDevCardThisTurn,
    score: calculateScore(state, player.id).total,
    resourceCount: resourceTotal(player.resources),
    devCardCount: player.devCards.length,
    revealedDevCards: player.devCards.filter((card) => card.revealed),
    connected: connectedPlayerIds.includes(player.id)
  };
}

function sanitizePendingForPublic(pending?: PendingChoice): PublicPendingState | undefined {
  if (!pending) return undefined;

  switch (pending.kind) {
    case "setupRoute":
      return {
        kind: pending.kind,
        playerId: pending.playerId,
        campVertexId: pending.campVertexId,
        secondCamp: pending.secondCamp
      };
    case "chooseResource":
      return {
        kind: pending.kind,
        playerId: pending.playerId,
        amount: pending.amount,
        reason: pending.reason
      };
    case "discard":
      return {
        kind: pending.kind,
        playerId: pending.playerId,
        amount: pending.amount
      };
    case "moveZombie":
      return {
        kind: pending.kind,
        playerId: pending.playerId,
        stealAfterMove: pending.stealAfterMove
      };
    case "stealResource":
      return {
        kind: pending.kind,
        playerId: pending.playerId,
        targetPlayerIds: pending.targetPlayerIds
      };
    case "confirmTrade":
      return {
        kind: pending.kind,
        playerId: pending.playerId,
        actorId: pending.actorId,
        targetPlayerId: pending.targetPlayerId,
        candidateTargetIds: pending.candidateTargetIds,
        declinedTargetIds: pending.declinedTargetIds
      };
    case "downgradeFortress":
      return {
        kind: pending.kind,
        playerId: pending.playerId,
        vertexIds: pending.vertexIds
      };
    default:
      return pending satisfies never;
  }
}
