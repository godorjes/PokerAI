import type { PokerTable } from "@/server/engine";
import type { AiMode, BotDecisionResponse, GameStateResponse, TopUpEvent } from "@/shared/api";
import type { PlayerId, SeatId } from "@/shared/contracts";
import type { AsyncMutex } from "./mutex";

export interface LedgerEntry {
  readonly fingerprint: string;
  readonly response: GameStateResponse | BotDecisionResponse;
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
  pendingDecision: PendingDecision | null;
  createdAt: number;
  lastSeenAt: number;
  readonly requestLedger: Map<string, LedgerEntry>;
  readonly topUps: TopUpEvent[];
}
