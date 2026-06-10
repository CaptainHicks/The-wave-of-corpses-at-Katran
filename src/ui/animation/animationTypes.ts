import type { Command, Resource } from "../../domain/types";

export type GameAnimationKind =
  | "diceRoll"
  | "resourceGain"
  | "resourceSpend"
  | "devCardDraw"
  | "devCardPlay"
  | "tradeOffer"
  | "tradeAccepted"
  | "zombieMove"
  | "zombieTrackAdvance"
  | "zombieSiege";

export interface ZombieSiegeResolution {
  strength: number;
  defense: number;
  successful: boolean;
  outcome: "defenderPoint" | "developmentCards" | "fortressDowngrade" | "none";
  playerNames: string[];
}

export interface GameAnimationEvent {
  id: string;
  kind: GameAnimationKind;
  turn: number;
  commandType?: Command["type"];
  playerId?: string;
  targetId?: string;
  resource?: Resource;
  amount?: number;
  publicLabel?: string;
  createdAt: number;
  durationMs: number;
  privateResource?: boolean;
  zombieSiegeResolution?: ZombieSiegeResolution;
}

export type GameAnimationInput = Omit<GameAnimationEvent, "createdAt" | "durationMs"> &
  Partial<Pick<GameAnimationEvent, "createdAt" | "durationMs">>;
