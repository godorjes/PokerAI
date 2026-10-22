import type { PokerTable } from "@/server/engine";
import type { BotDecisionResponse, GameStateResponse, TopUpEvent } from "@/shared/api";

export interface LedgerEntry {
  readonly fingerprint: string;
  readonly response: GameStateResponse | BotDecisionResponse;
}

export interface GameSession {
  readonly gameId: string;
  readonly ownerId: string;
  readonly table: PokerTable;
  stateVersion: number;
  createdAt: number;
  lastSeenAt: number;
  readonly requestLedger: Map<string, LedgerEntry>;
  readonly topUps: TopUpEvent[];
}
