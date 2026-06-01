import type { Command, GameState } from "../domain/types";

const ONLINE_BLOCKED_COMMANDS: Command["type"][] = ["createGame", "debugJumpPhase", "debugSetResources"];

export class OnlineAuthorizationError extends Error {
  constructor(message = "This player cannot issue that command in online mode.") {
    super(message);
    this.name = "OnlineAuthorizationError";
  }
}

export function authorizeCommandForPlayer(state: GameState, viewerPlayerId: string, command: Command): true {
  if (ONLINE_BLOCKED_COMMANDS.includes(command.type)) {
    throw new OnlineAuthorizationError("Debug and local-only commands are disabled in online mode.");
  }

  if (command.type === "rollDice" && command.forced != null) {
    throw new OnlineAuthorizationError("Forced dice rolls are disabled in online mode.");
  }

  const viewer = state.players.find((player) => player.id === viewerPlayerId);
  if (!viewer) {
    throw new OnlineAuthorizationError("Viewer is not part of this room.");
  }

  const requiredPlayerId = state.pending?.playerId ?? state.currentPlayerId;
  if (viewerPlayerId !== requiredPlayerId) {
    throw new OnlineAuthorizationError("Only the active online player may submit this command.");
  }

  return true;
}
