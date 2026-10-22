/**
 * Shared, serialisable contracts for the Stage A rule engine.
 *
 * This module intentionally contains no engine internals: route handlers,
 * bots, and the UI can depend on these types without seeing the full state.
 */

export const SEAT_IDS = [0, 1, 2, 3, 4] as const;
export type SeatId = (typeof SEAT_IDS)[number];

export const PLAYER_IDS = ["human", "ai-1", "ai-2", "ai-3", "ai-4"] as const;
export type PlayerId = (typeof PLAYER_IDS)[number];

export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
export const STARTING_STACK = 1_000;
export const MAX_SEATS = 5;

export type StreetName = "preflop" | "flop" | "turn" | "river" | "showdown";
export type ActionName = "fold" | "check" | "call" | "bet" | "raise" | "all_in";
export type PublicActionName = ActionName | "uncalled_return";

export interface ActionInput {
  readonly action: ActionName;
  /**
   * Required for bet/raise, and must be the total amount the player is
   * committing to on this street. It is never an increment.
   * Must be null for fold/check/call/all_in.
   */
  readonly amountTo: number | null;
}

export interface LegalActionView {
  readonly actions: readonly ActionName[];
  readonly toCall: number;
  readonly minBetTo: number | null;
  readonly minRaiseTo: number | null;
  readonly maxTo: number;
  readonly canOnlyShortAllIn: boolean;
}

export type PlayerStatusName =
  "active" | "folded" | "all_in" | "sitting_out" | "waiting" | "busted" | "reserved";

export interface PublicPlayerView {
  readonly seat: SeatId;
  readonly playerId: PlayerId;
  readonly name: string;
  readonly stack: number;
  readonly betThisStreet: number;
  readonly totalInvestedThisHand: number;
  readonly status: PlayerStatusName;
  readonly isAllIn: boolean;
  readonly isFolded: boolean;
  /**
   * Own cards for the viewer, or explicitly shown cards at showdown.
   * null means no hand. Null entries inside the array mean hidden cards.
   */
  readonly cards: readonly (string | null)[] | null;
  readonly cardsShown: boolean;
}

export interface PublicPotView {
  readonly type: "main" | "side";
  readonly amount: number;
  readonly eligibleSeats: readonly SeatId[];
  readonly capPerPlayer: number;
}

export interface PublicActionView {
  readonly eventId: string;
  readonly type: PublicActionName;
  readonly seat: SeatId | null;
  readonly playerId: PlayerId | null;
  readonly street: StreetName;
  /** bet/raise target; null for other actions. */
  readonly amountTo: number | null;
  /** Actual chips moved. null for fold/check; amount for call/uncalled return. */
  readonly amount: number | null;
  readonly potAfter: number;
  readonly stackAfter: number | null;
}

export interface WinnerView {
  readonly seat: SeatId;
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly hand: readonly string[] | null;
  readonly handRank: string | null;
}

export interface PublicTableView {
  readonly handId: string;
  readonly handNumber: number;
  readonly maxPlayers: number;
  readonly buttonSeat: SeatId | null;
  readonly bigBlindSeat: SeatId | null;
  readonly street: StreetName;
  readonly board: readonly string[];
  readonly actionTo: PlayerId | null;
  readonly actionToSeat: SeatId | null;
  readonly potTotal: number;
  readonly pots: readonly PublicPotView[];
  readonly currentBets: Readonly<Record<PlayerId, number>>;
  readonly players: readonly PublicPlayerView[];
  readonly actions: readonly PublicActionView[];
  readonly winners: readonly WinnerView[] | null;
  readonly viewer: PlayerId | null;
  readonly legalActions: LegalActionView | null;
}

export interface BotDecisionView extends PublicTableView {
  readonly selfPlayerId: PlayerId;
  readonly selfSeat: SeatId;
  readonly legalActions: LegalActionView;
}

export interface ActionEvent {
  readonly eventId: string;
  readonly handId: string;
  readonly turnId: string;
  readonly playerId: PlayerId;
  readonly seat: SeatId;
  readonly street: StreetName;
  readonly action: ActionName;
  readonly amountTo: number | null;
  readonly chipsMoved: number;
  readonly potAfter: number;
  readonly stackAfter: number;
  readonly createdAt: number;
}

export interface ActionResult {
  readonly event: ActionEvent;
  readonly state: PublicTableView;
}

export type EngineErrorCode =
  "NOT_YOUR_TURN" | "INVALID_ACTION" | "NO_CHIPS" | "INVALID_AMOUNT" | "HAND_COMPLETE" | "INTERNAL";

export class TableError extends Error {
  readonly code: EngineErrorCode;
  readonly reason: string | undefined;

  constructor(code: EngineErrorCode, message: string, reason?: string) {
    super(message);
    this.name = "TableError";
    this.code = code;
    this.reason = reason;
  }
}

export function isSeatId(value: number): value is SeatId {
  return Number.isInteger(value) && value >= 0 && value < MAX_SEATS;
}

export function seatPlayerId(seat: SeatId): PlayerId {
  return PLAYER_IDS[seat];
}

export function playerIdToSeat(playerId: string): SeatId | null {
  const index = PLAYER_IDS.indexOf(playerId as PlayerId);
  return index === -1 ? null : (index as SeatId);
}
