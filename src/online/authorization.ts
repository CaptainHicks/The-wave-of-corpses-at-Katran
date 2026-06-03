import type { Command, GameState } from "../domain/types";

const ONLINE_BLOCKED_COMMANDS: Command["type"][] = [
  "createGame",
  "debugJumpPhase",
  "debugSetResources",
  "debugAdvanceZombieTrack",
  "debugRevealAllFog"
];

export class OnlineAuthorizationError extends Error {
  constructor(message = "这名玩家不能在联机模式中执行这个操作。") {
    super(message);
    this.name = "OnlineAuthorizationError";
  }
}

export function authorizeCommandForPlayer(state: GameState, viewerPlayerId: string, command: Command): true {
  if (ONLINE_BLOCKED_COMMANDS.includes(command.type)) {
    throw new OnlineAuthorizationError("调试和本地专用操作不能在联机模式中使用。");
  }

  if (command.type === "rollDice" && command.forced != null) {
    throw new OnlineAuthorizationError("联机模式不能指定骰子点数。");
  }

  const viewer = state.players.find((player) => player.id === viewerPlayerId);
  if (!viewer) {
    throw new OnlineAuthorizationError("你不在这个房间中。");
  }

  const requiredPlayerId = state.pending?.playerId ?? state.currentPlayerId;
  if (viewerPlayerId !== requiredPlayerId) {
    throw new OnlineAuthorizationError("只有当前行动玩家可以执行这个操作。");
  }

  if (command.type === "timeoutTurn" && command.expectedPlayerId && command.expectedPlayerId !== requiredPlayerId) {
    throw new OnlineAuthorizationError("超时操作已经和当前行动玩家不一致。");
  }

  return true;
}
