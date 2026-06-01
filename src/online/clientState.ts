import { createResources } from "../domain/constants";
import type { GameState, PlayerState } from "../domain/types";
import type { OnlineGameView } from "./protocol";

export function materializeOnlineGameState(view: OnlineGameView): GameState {
  return {
    debugMode: view.publicState.debugMode,
    fogEnabled: view.publicState.fogEnabled,
    currentPlayerId: view.publicState.currentPlayerId,
    phase: view.publicState.phase,
    board: view.publicState.board,
    zombieTrack: view.publicState.zombieTrack,
    zombieTileId: view.publicState.zombieTileId,
    merchant: view.publicState.merchant,
    devDeck: [],
    log: view.publicState.log,
    rng: { seed: `online-${view.roomMeta.roomCode}`, counter: view.publicState.turn },
    turn: view.publicState.turn,
    setup: view.publicState.setup,
    awards: view.publicState.awards,
    dice: view.publicState.dice,
    winnerId: view.publicState.winnerId,
    pending: view.viewerPrivate.pending,
    players: view.publicState.players.map((player) => materializePlayer(player, view))
  };
}

export function buildOnlineViewRevision(view: OnlineGameView): string {
  const pending = view.publicState.pending;
  const latestLog = view.publicState.log[view.publicState.log.length - 1];
  const latestLogId = latestLog?.id;

  return JSON.stringify({
    roomCode: view.roomMeta.roomCode,
    viewerPlayerId: view.viewerPlayerId,
    turn: view.publicState.turn,
    currentPlayerId: view.publicState.currentPlayerId,
    phase: view.publicState.phase,
    pending: pending
      ? {
          kind: pending.kind,
          playerId: pending.playerId,
          amount: pending.amount,
          reason: pending.reason,
          targetPlayerId: pending.targetPlayerId,
          actorId: pending.actorId
        }
      : null,
    lastCommand: view.lastCommand ?? null,
    latestLogId: latestLogId ?? null
  });
}

function materializePlayer(viewerSafePlayer: OnlineGameView["publicState"]["players"][number], view: OnlineGameView): PlayerState {
  const isViewer = viewerSafePlayer.id === view.viewerPlayerId;

  return {
    id: viewerSafePlayer.id,
    name: viewerSafePlayer.name,
    color: viewerSafePlayer.color,
    factionId: viewerSafePlayer.factionId,
    resources: isViewer ? view.viewerPrivate.resources : createResources(),
    devCards: isViewer ? view.viewerPrivate.devCards : viewerSafePlayer.revealedDevCards,
    militia: viewerSafePlayer.militia,
    defenderTokens: viewerSafePlayer.defenderTokens,
    movedConvoyThisTurn: viewerSafePlayer.movedConvoyThisTurn,
    pieces: viewerSafePlayer.pieces,
    usedDevCardThisTurn: viewerSafePlayer.usedDevCardThisTurn
  };
}
