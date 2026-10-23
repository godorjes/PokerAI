import type { AiConnectionStatus } from "@/shared/api";
import type { ActionName, PlayerId } from "@/shared/contracts";
import type { BotDecisionInput } from "./bot-input";

export type AiConfidenceLabel = "low" | "medium" | "high";

export interface AiUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface AiOpponentIntent {
  readonly targetPlayerId: PlayerId;
  readonly hypothesis: string;
  readonly confidenceLabel: AiConfidenceLabel;
}

export interface AiSuggestion {
  readonly action: ActionName;
  readonly amountTo: number | null;
  readonly decisionSummary?: string;
  readonly confidenceLabel?: AiConfidenceLabel;
  readonly opponentIntents?: readonly AiOpponentIntent[];
  readonly usage?: AiUsage | null;
  readonly model?: string;
}

export interface AiConnectionResult {
  readonly status: Exclude<AiConnectionStatus, "not_configured">;
  readonly message: string;
  readonly usage: AiUsage | null;
}

export type AiGatewayErrorCode =
  | "key_invalid"
  | "insufficient_balance"
  | "rate_limited"
  | "temporary"
  | "invalid_request"
  | "invalid_response"
  | "truncated"
  | "empty"
  | "network"
  | "timeout";

export class DeepSeekGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(
    code: AiGatewayErrorCode,
    message: string,
    options: { retryable?: boolean; httpStatus?: number } = {},
  ) {
    super(message);
    this.name = "DeepSeekGatewayError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface AiGateway {
  testConnection(key: string, signal?: AbortSignal): Promise<AiConnectionResult>;
  decide(key: string, input: BotDecisionInput, signal?: AbortSignal): Promise<AiSuggestion>;
}
