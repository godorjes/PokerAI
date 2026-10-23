import type { AiConnectionStatus } from "@/shared/api";
import type { ActionName, BotDecisionView } from "@/shared/contracts";

export interface AiConnectionResult {
  readonly status: Exclude<AiConnectionStatus, "not_configured">;
  readonly message: string;
  readonly usage: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
  } | null;
}

export interface AiSuggestion {
  readonly action: ActionName;
  readonly amountTo: number | null;
}

export interface AiGateway {
  testConnection(key: string, signal?: AbortSignal): Promise<AiConnectionResult>;
  decide(key: string, view: BotDecisionView, signal?: AbortSignal): Promise<AiSuggestion>;
}
