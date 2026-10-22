import type { ActionInput, ActionName, PlayerId, PublicTableView, SeatId } from "./contracts";

export type GamePhase = "playing" | "settled";
export type AiMode = "disabled";

export interface TopUpEvent {
  readonly seat: SeatId;
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly kind: "auto_bot" | "human_rebuy";
  readonly handNumber: number;
}

export interface GameStateResponse {
  readonly gameId: string;
  readonly stateVersion: number;
  readonly turnId: string;
  readonly handId: string;
  readonly handNumber: number;
  readonly phase: GamePhase;
  readonly settled: boolean;
  readonly humanSeat: SeatId;
  readonly humanPlayerId: PlayerId;
  readonly aiMode: AiMode;
  readonly table: PublicTableView;
  readonly canStartNextHand: boolean;
  readonly rebuyRequired: boolean;
  readonly topUps: readonly TopUpEvent[];
}

export interface BotDecisionResponse extends GameStateResponse {
  readonly action: ActionInput;
  readonly source: "local_no_key";
}

export interface StartGameRequest {
  readonly requestId?: string;
  readonly restart?: boolean;
}

export interface GameActionRequest {
  readonly gameId: string;
  readonly handId: string;
  readonly turnId: string;
  readonly expectedVersion: number;
  readonly requestId: string;
  readonly action: ActionName;
  readonly amountTo: number | null;
}

export interface NextHandRequest {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly requestId: string;
  readonly rebuy?: boolean;
}

export interface BotDecisionRequest {
  readonly gameId: string;
  readonly handId: string;
  readonly turnId: string;
  readonly expectedVersion: number;
  readonly requestId: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly latest?: {
    readonly stateVersion: number;
    readonly turnId: string;
  };
}
