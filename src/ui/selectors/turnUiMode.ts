import type { GameState } from "../../domain/types";

export type TurnUiMode = "mustRoll" | "pending" | "freeAction" | "victory";

export function getTurnUiMode(state: GameState): TurnUiMode {
  if (state.phase === "victory") return "victory";
  if (state.pending) return "pending";
  if (state.phase === "prepare" || state.phase === "dice") return "mustRoll";
  return "freeAction";
}
