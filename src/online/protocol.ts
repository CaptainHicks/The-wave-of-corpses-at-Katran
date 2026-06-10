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
  targetPlayerCount: number;
  aiPlayerCount?: number;
  fogEnabled: boolean;
}

export interface RoomJoinRequest {
  roomCode: string;
  name: string;
}

export interface RoomChooseFactionRequest {
  roomCode: string;
  factionId?: string;
}

export interface RoomResumeRequest {
  roomCode: string;
  sessionToken: string;
}

export interface RoomStartRequest {
  roomCode: string;
}

export interface RoomReturnToLobbyRequest {
  roomCode: string;
}

export interface RoomLeaveRequest {
  roomCode: string;
}

export interface RoomCommandRequest {
  roomCode: string;
  command: Command;
}

export interface RoomChatRequest {
  roomCode: string;
  text: string;
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
    | "controller"
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
  devDeckCount: number;
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
  controller?: PlayerState["controller"];
  connected: boolean;
}

export interface LobbyChatMessageView {
  id: string;
  kind: "system" | "player";
  playerId?: string;
  playerName?: string;
  text: string;
  createdAt: number;
}

export interface LobbyView {
  kind: "lobby";
  viewerPlayerId: string;
  roomMeta: LobbyRoomMetaSnapshot;
  seats: LobbySeatView[];
  chatMessages: LobbyChatMessageView[];
  canStart: boolean;
  startBlockedReason?: string;
}

export type RoomView = LobbyView | OnlineGameView;

export function buildOnlineGameView(
  roomMeta: RoomMetaSnapshot,
  state: GameState,
  viewerPlayerId: string,
  lastCommand?: Command
): OnlineGameView {
  return buildOnlineGameViewFromPublicState(buildPublicOnlineGameState(roomMeta, state), roomMeta, state, viewerPlayerId, lastCommand);
}

export function buildOnlineGameViews(
  roomMeta: RoomMetaSnapshot,
  state: GameState,
  viewerPlayerIds: string[],
  lastCommand?: Command
): OnlineGameView[] {
  const publicState = buildPublicOnlineGameState(roomMeta, state);
  return viewerPlayerIds.map((viewerPlayerId) =>
    buildOnlineGameViewFromPublicState(publicState, roomMeta, state, viewerPlayerId, lastCommand)
  );
}

export function buildPublicOnlineGameState(roomMeta: RoomMetaSnapshot, state: GameState): PublicOnlineGameState {
  return {
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
    devDeckCount: state.devDeck.length,
    players: buildPublicPlayers(state, roomMeta.connectedPlayerIds),
    pending: sanitizePendingForPublic(state.pending)
  };
}

function buildOnlineGameViewFromPublicState(
  publicState: PublicOnlineGameState,
  roomMeta: RoomMetaSnapshot,
  state: GameState,
  viewerPlayerId: string,
  lastCommand?: Command
): OnlineGameView {
  const viewer = state.players.find((player) => player.id === viewerPlayerId);
  if (!viewer) {
    throw new Error(`玩家 ${viewerPlayerId} 不属于这局游戏。`);
  }

  return {
    kind: "game",
    viewerPlayerId,
    publicState,
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
    controller?: PlayerState["controller"];
    connected: boolean;
  }>,
  viewerPlayerId: string,
  chatMessages: LobbyChatMessageView[] = []
): LobbyView {
  const roomFilled = seats.length === roomMeta.targetPlayerCount;
  const allFactionsChosen = seats.every((seat) => Boolean(seat.factionId));
  const roomReady = roomFilled && allFactionsChosen;
  const isHost = viewerPlayerId === roomMeta.hostPlayerId;

  return {
    kind: "lobby",
    viewerPlayerId,
    roomMeta,
    seats: buildLobbySeatViews(seats),
    chatMessages,
    canStart: isHost && roomReady,
    startBlockedReason: isHost
      ? roomFilled
        ? allFactionsChosen
          ? undefined
          : "所有玩家都选择阵营后，房主才能开始游戏。"
        : "房间满员后，房主才能开始游戏。"
      : "只有房主可以开始游戏。"
  };
}

function buildLobbySeatViews(
  seats: Array<{
    playerId: string;
    name: string;
    color: string;
    factionId?: string;
    controller?: PlayerState["controller"];
    connected: boolean;
  }>
): LobbySeatView[] {
  return seats.map((seat) => ({
    playerId: seat.playerId,
    name: seat.name,
    color: seat.color,
    factionId: seat.factionId,
    controller: seat.controller ?? "human",
    connected: seat.connected
  }));
}

function resolveJoinBlockedReason(roomMeta: LobbyRoomMetaSnapshot, seatCount: number) {
  if (roomMeta.status === "active") return "该房间已经开局，不能再加入。";
  if (roomMeta.status === "finished") return "该房间已经结束。";
  if (seatCount >= roomMeta.targetPlayerCount) return "该房间已满。";
  return undefined;
}

function buildPublicPlayer(
  player: PlayerState,
  connectedPlayerIds: string[],
  score: number
): PublicOnlinePlayerState {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    factionId: player.factionId,
    controller: player.controller ?? "human",
    militia: player.militia,
    defenderTokens: player.defenderTokens,
    movedConvoyThisTurn: player.movedConvoyThisTurn,
    pieces: player.pieces,
    usedDevCardThisTurn: player.usedDevCardThisTurn,
    score,
    resourceCount: resourceTotal(player.resources),
    devCardCount: player.devCards.length,
    revealedDevCards: player.devCards.filter((card) => card.revealed),
    connected: connectedPlayerIds.includes(player.id)
  };
}

function buildPublicPlayers(state: GameState, connectedPlayerIds: string[]): PublicOnlinePlayerState[] {
  const scores = new Map(state.players.map((player) => [player.id, calculateScore(state, player.id).total]));
  return state.players.map((player) => buildPublicPlayer(player, connectedPlayerIds, scores.get(player.id) ?? 0));
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
