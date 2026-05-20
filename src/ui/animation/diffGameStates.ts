import { RESOURCES, ZOMBIE_TRACK_LIMIT } from "../../domain/constants";
import type { Command, GameState, PlayerState, Resource } from "../../domain/types";
import type { GameAnimationInput } from "./animationTypes";

export function diffGameStates(
  previous: GameState,
  next: GameState,
  command: Command,
  viewerPlayerId: string
): GameAnimationInput[] {
  const events: GameAnimationInput[] = [];
  const base = {
    turn: next.turn,
    commandType: command.type
  } as const;

  const add = (event: Omit<GameAnimationInput, "id" | "turn" | "commandType">) => {
    events.push({
      ...base,
      ...event,
      id: `anim-${next.turn}-${command.type}-${events.length}-${Date.now()}`
    });
  };

  if (command.type === "rollDice" && next.dice) {
    add({
      kind: "diceRoll",
      amount: next.dice[0] + next.dice[1],
      publicLabel: `${next.dice[0]} + ${next.dice[1]}`,
      durationMs: 920
    });
  }

  for (const nextPlayer of next.players) {
    const previousPlayer = previous.players.find((player) => player.id === nextPlayer.id);
    if (!previousPlayer) continue;
    addResourceDiffs(previousPlayer, nextPlayer, viewerPlayerId, add);
    const devDelta = nextPlayer.devCards.length - previousPlayer.devCards.length;
    if (devDelta > 0) {
      add({
        kind: "devCardDraw",
        playerId: nextPlayer.id,
        amount: devDelta,
        privateResource: nextPlayer.id !== viewerPlayerId,
        publicLabel: nextPlayer.id === viewerPlayerId ? "发展卡 +1" : "发展卡变化"
      });
    }
  }

  if (command.type === "playDevelopmentCard") {
    add({ kind: "devCardPlay", playerId: next.currentPlayerId, targetId: command.cardId, durationMs: 700 });
  }

  if (command.type === "playerTrade") {
    add({ kind: "tradeOffer", playerId: previous.currentPlayerId, durationMs: 640 });
  }

  if (command.type === "confirmPlayerTrade" && command.accept) {
    add({ kind: "tradeAccepted", playerId: previous.pending?.playerId, durationMs: 640 });
  }

  if (previous.zombieTileId !== next.zombieTileId) {
    add({ kind: "zombieMove", targetId: next.zombieTileId, durationMs: 760 });
  }

  if (previous.zombieTrack >= ZOMBIE_TRACK_LIMIT - 1 && next.zombieTrack === 0 && previous.zombieTrack !== next.zombieTrack) {
    add({
      kind: "zombieSiege",
      targetId: next.zombieTileId,
      publicLabel: "尸潮围城",
      durationMs: 2400
    });
  }

  if (previous.zombieTrack !== next.zombieTrack) {
    add({
      kind: "zombieTrackAdvance",
      amount: next.zombieTrack - previous.zombieTrack,
      publicLabel: `${next.zombieTrack}`,
      durationMs: 760
    });
  }

  return events;
}

function addResourceDiffs(
  previousPlayer: PlayerState,
  nextPlayer: PlayerState,
  viewerPlayerId: string,
  add: (event: Omit<GameAnimationInput, "id" | "turn" | "commandType">) => void
) {
  const isViewer = nextPlayer.id === viewerPlayerId;
  let privateGain = 0;
  let privateSpend = 0;

  for (const resource of RESOURCES) {
    const delta = nextPlayer.resources[resource] - previousPlayer.resources[resource];
    if (delta === 0) continue;
    if (isViewer) {
      add({
        kind: delta > 0 ? "resourceGain" : "resourceSpend",
        playerId: nextPlayer.id,
        resource,
        amount: Math.abs(delta),
        publicLabel: resource,
        durationMs: 680
      });
    } else if (delta > 0) {
      privateGain += delta;
    } else {
      privateSpend += Math.abs(delta);
    }
  }

  if (!isViewer && privateGain > 0) {
    addPrivateResourceChange(nextPlayer.id, "resourceGain", privateGain, add);
  }
  if (!isViewer && privateSpend > 0) {
    addPrivateResourceChange(nextPlayer.id, "resourceSpend", privateSpend, add);
  }
}

function addPrivateResourceChange(
  playerId: string,
  kind: "resourceGain" | "resourceSpend",
  amount: number,
  add: (event: Omit<GameAnimationInput, "id" | "turn" | "commandType">) => void
) {
  add({
    kind,
    playerId,
    amount,
    privateResource: true,
    publicLabel: kind === "resourceGain" ? "资源增加" : "资源消耗",
    durationMs: 520
  });
}
