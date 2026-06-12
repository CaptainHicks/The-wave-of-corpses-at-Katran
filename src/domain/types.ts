export type Resource = "food" | "wood" | "metal" | "fuel" | "ammo";

export type TileType =
  | "farm"
  | "forest"
  | "factory"
  | "city"
  | "military"
  | "warehouse"
  | "infected"
  | "empty";

export type Phase =
  | "setup"
  | "prepare"
  | "dice"
  | "zombie"
  | "action"
  | "victory";

export type BuildingType = "camp" | "fortress";
export type RouteType = "transport" | "convoy";
export type MilitiaStatus = "inactive" | "readying" | "active";

export type DevCardType =
  | "militiaMobilization"
  | "roadCrew"
  | "airdrop"
  | "requisition"
  | "merchant"
  | "secretBase"
  | "zombieApproaches";

export type BlackMarket =
  | { type: "generic" }
  | { type: "specific"; resource: Resource };

export type Resources = Record<Resource, number>;

export interface RngState {
  seed: string;
  counter: number;
}

export interface TileState {
  id: string;
  row: number;
  col: number;
  q: number;
  r: number;
  x: number;
  y: number;
  type: TileType;
  hiddenType: TileType;
  number?: number;
  revealed: boolean;
  cluster: "large" | "small" | "empty";
}

export interface EdgeState {
  id: string;
  vertexIds: [string, string];
  tileIds: string[];
  blackMarket?: BlackMarket;
  route?: {
    ownerId: string;
    type: RouteType;
    /** 该路线放置时所处的回合,用于禁止本回合刚建造的装甲车队立即移动。 */
    placedTurn?: number;
  };
}

export interface VertexState {
  id: string;
  x: number;
  y: number;
  tileIds: string[];
  edgeIds: string[];
  building?: {
    ownerId: string;
    type: BuildingType;
  };
  watchtowerOwnerId?: string;
}

export interface BoardState {
  tiles: Record<string, TileState>;
  edges: Record<string, EdgeState>;
  vertices: Record<string, VertexState>;
  rows: string[][];
  structureId?: string;
  structureSignature?: string;
}

export interface DevCard {
  id: string;
  type: DevCardType;
  purchasedTurn: number;
  revealed?: boolean;
}

export interface Militia {
  id: string;
  vertexId: string;
  status: MilitiaStatus;
  ownerId: string;
  activatedTurn?: number;
}

export type AiStrategyKind = "expansion" | "fortification" | "supply" | "militia" | "development";

export interface AiStrategyPlan {
  kind: AiStrategyKind;
  chosenTurn: number;
  reviewedTurn: number;
  commitmentUntilTurn: number;
  progress: number;
  lastProgressTurn: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  factionId?: string;
  controller?: "human" | "ai";
  aiStrategy?: AiStrategyPlan;
  resources: Resources;
  devCards: DevCard[];
  militia: Militia[];
  defenderTokens: number;
  movedConvoyThisTurn: boolean;
  /** 本回合内已经发起过的玩家交易报价签名,用于防止 AI 反复提出同一笔交易。 */
  tradeOffersThisTurn?: string[];
  pieces: {
    camps: number;
    fortresses: number;
    transports: number;
    convoys: number;
    militia: number;
    watchtowers: number;
  };
  usedDevCardThisTurn: boolean;
}

export type PendingChoice =
  | {
      kind: "setupRoute";
      playerId: string;
      campVertexId: string;
      secondCamp: boolean;
    }
  | {
      kind: "chooseResource";
      playerId: string;
      amount: number;
      reason:
        | "warehouse-production"
        | "initial-warehouse"
        | "explore-warehouse"
        | "airdrop"
        | "zombie-approaches";
      next?: PendingChoice;
    }
  | {
      kind: "discard";
      playerId: string;
      amount: number;
      next?: PendingChoice;
    }
  | {
      kind: "moveZombie";
      playerId: string;
      stealAfterMove: boolean;
    }
  | {
      kind: "stealResource";
      playerId: string;
      targetPlayerIds: string[];
    }
  | {
      kind: "confirmTrade";
      playerId: string;
      actorId: string;
      targetPlayerId: string;
      candidateTargetIds?: string[];
      declinedTargetIds?: string[];
      offer: Partial<Resources>;
      request: Partial<Resources>;
    }
  | {
      kind: "downgradeFortress";
      playerId: string;
      vertexIds: string[];
      next?: PendingChoice;
    };

export interface GameEvent {
  id: string;
  turn: number;
  message: string;
}

export interface GameState {
  players: PlayerState[];
  debugMode?: boolean;
  fogEnabled?: boolean;
  currentPlayerId: string;
  phase: Phase;
  board: BoardState;
  zombieTrack: number;
  zombieTileId: string;
  merchant: { tileId: string; controllerId?: string };
  devDeck: DevCard[];
  pending?: PendingChoice;
  log: GameEvent[];
  rng: RngState;
  turn: number;
  setup: {
    order: string[];
    placementIndex: number;
    round: 1 | 2;
  };
  awards: {
    longestSupply?: { playerId: string; length: number };
    strongestMilitia?: { playerId: string; count: number };
    newResourceZones?: Record<string, string[]>;
  };
  dice?: [number, number];
  winnerId?: string;
}

export type Command =
  | {
      type: "createGame";
      players: Array<{ name: string; color: string; factionId?: string; controller?: "human" | "ai" }>;
      seed?: string;
      debugMode?: boolean;
      fogEnabled?: boolean;
      boardStructureId?: string;
    }
  | { type: "placeInitialCamp"; vertexId: string }
  | { type: "placeInitialRoute"; edgeId: string }
  | { type: "rollDice"; forced?: [number, number] }
  | { type: "moveZombie"; tileId: string }
  | { type: "stealResource"; targetPlayerId?: string }
  | { type: "discardResources"; resources: Partial<Resources> }
  | { type: "chooseResource"; resources: Partial<Resources> }
  | { type: "endPhase" }
  | { type: "endTurn" }
  | { type: "timeoutTurn"; expectedPlayerId?: string; expectedTurn?: number }
  | {
      type: "bankTrade";
      give: Resource;
      receive: Resource;
      rate?: 2 | 3 | 4;
    }
  | {
      type: "playerTrade";
      targetPlayerId?: string;
      offer: Partial<Resources>;
      request: Partial<Resources>;
    }
  | { type: "confirmPlayerTrade"; accept: boolean }
  | { type: "buildRoute"; edgeId: string; routeType: RouteType; free?: boolean }
  | { type: "buildCamp"; vertexId: string; free?: boolean }
  | { type: "upgradeFortress"; vertexId: string; free?: boolean }
  | { type: "buildWatchtower"; vertexId: string; free?: boolean }
  | { type: "recruitMilitia"; vertexId: string; free?: boolean }
  | { type: "moveConvoy"; fromEdgeId: string; toEdgeId: string }
  | { type: "activateMilitia"; militiaId: string }
  | { type: "moveMilitia"; militiaId: string; toVertexId: string }
  | {
      type: "expelZombie";
      militiaId: string;
      toTileId: string;
      targetPlayerId?: string;
    }
  | { type: "buyDevelopmentCard" }
  | { type: "playDevelopmentCard"; cardId: string; payload?: Record<string, unknown> }
  | { type: "downgradeFortress"; vertexId: string }
  | { type: "debugSetResources"; playerId: string; resources: Resources }
  | { type: "debugJumpPhase"; phase: Phase }
  | { type: "debugAdvanceZombieTrack" }
  | { type: "debugRevealAllFog" };

export interface ScoreBreakdown {
  total: number;
  camps: number;
  fortresses: number;
  longestSupply: number;
  strongestMilitia: number;
  secretBases: number;
  defenderTokens: number;
  merchant: number;
  newResourceZones: number;
}
