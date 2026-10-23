import type { ActionInput, ActionName, PlayerId, PublicTableView, SeatId } from "./contracts";

export const DEEPSEEK_KEY_HEADER = "x-deepseek-api-key";

export type GamePhase = "playing" | "settled";
export type AiMode = "disabled" | "enabled";
export type AiDecisionSource = "deepseek" | "local_no_key" | "local_fallback";

export interface PendingDecisionView {
  readonly decisionId: string;
  readonly actorId: PlayerId;
  readonly turnId: string;
  readonly deadlineAt: number;
}

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
  readonly aiEpoch: number;
  readonly pendingDecision: PendingDecisionView | null;
  readonly table: PublicTableView;
  readonly canStartNextHand: boolean;
  readonly rebuyRequired: boolean;
  readonly topUps: readonly TopUpEvent[];
}

export interface BotDecisionResponse extends GameStateResponse {
  readonly status: "committed" | "pending";
  readonly action?: ActionInput;
  readonly source?: AiDecisionSource;
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
  readonly aiEpoch: number;
}

export type AiModeOperation = "enable" | "disable" | "rotate";

export interface AiModeRequest {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly requestId: string;
  readonly operation: AiModeOperation;
}

export interface AiTestRequest {
  readonly requestId: string;
}

export type AiConnectionStatus =
  | "available"
  | "key_invalid"
  | "insufficient_balance"
  | "rate_limited"
  | "unavailable"
  | "not_configured";

export interface AiTestResponse {
  readonly requestId: string;
  readonly status: AiConnectionStatus;
  readonly message: string;
  readonly usage: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
  } | null;
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
