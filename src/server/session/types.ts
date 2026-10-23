import type { PokerTable } from "@/server/engine";
import type {
  AiMode,
  BotDecisionResponse,
  GameStateResponse,
  LastAiDecisionView,
  TopUpEvent,
} from "@/shared/api";
import type { PlayerId, SeatId } from "@/shared/contracts";
import type { PublicActionSnapshot } from "@/server/insight/types";
import type { AsyncMutex } from "./mutex";

export interface LedgerEntry {
  readonly fingerprint: string;
  readonly response: GameStateResponse | BotDecisionResponse;
}

export interface AiStatsState {
  requests: number;
  successes: number;
  failures: number;
  rejected: number;
  retries: number;
  deepseekActions: number;
  localNoKeyActions: number;
  localFallbackActions: number;
  connectionRequests: number;
  connectionSuccesses: number;
  connectionFailures: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usageUnconfirmed: number;
}

export function createEmptyAiStats(): AiStatsState {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    rejected: 0,
    retries: 0,
    deepseekActions: 0,
    localNoKeyActions: 0,
    localFallbackActions: 0,
    connectionRequests: 0,
    connectionSuccesses: 0,
    connectionFailures: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    usageUnconfirmed: 0,
  };
}

export interface PendingDecision {
  readonly decisionId: string;
  readonly actorSeat: SeatId;
  readonly actorId: PlayerId;
  readonly handId: string;
  readonly turnId: string;
  readonly expectedVersion: number;
  readonly aiEpoch: number;
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly requestId: string;
}

export interface GameSession {
  readonly gameId: string;
  readonly ownerId: string;
  readonly table: PokerTable;
  readonly lock: AsyncMutex;
  stateVersion: number;
  aiMode: AiMode;
  aiEpoch: number;
  aiStats: AiStatsState;
  lastDecision: LastAiDecisionView | null;
  pendingDecision: PendingDecision | null;
  createdAt: number;
  lastSeenAt: number;
  readonly requestLedger: Map<string, LedgerEntry>;
  readonly publicActionSnapshots: Map<string, PublicActionSnapshot>;
  readonly topUps: TopUpEvent[];
}
