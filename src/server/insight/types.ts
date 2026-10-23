import type { ActionName, PlayerId, SeatId, StreetName } from "@/shared/contracts";

/**
 * Immutable public snapshot captured when an action is committed.
 *
 * It intentionally has no hole cards, deck, private decision summary,
 * confidence label, opponent intents or free-form internal reason.
 */
export interface PublicActionSnapshot {
  readonly actionEventId: string;
  readonly handId: string;
  readonly seat: SeatId;
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly action: ActionName;
  readonly amountTo: number | null;
  readonly amount: number;
  readonly street: StreetName;
  readonly potBefore: number;
  readonly potAfter: number;
  readonly stackAfter: number;
  readonly boardBefore: readonly string[];
  readonly buttonSeat: SeatId | null;
  readonly bigBlindSeat: SeatId | null;
}
