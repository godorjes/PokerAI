import { randomInt } from "node:crypto";
import {
  ActionType,
  IllegalActionError,
  PlayerStatus,
  PokerEngine,
  Street,
  type ActionRecord,
  type GameState,
  type Player,
} from "@pokertools/engine";
import {
  BIG_BLIND,
  MAX_SEATS,
  PLAYER_IDS,
  SEAT_IDS,
  SMALL_BLIND,
  STARTING_STACK,
  TableError,
  isSeatId,
  type ActionEvent,
  type ActionInput,
  type ActionResult,
  type BotDecisionView,
  type LegalActionView,
  type PlayerId,
  type PlayerStatusName,
  type PublicActionView,
  type PublicPotView,
  type PublicTableView,
  type SeatId,
  type StreetName,
  type WinnerView,
} from "@/shared/contracts";
import { toEngineAction } from "./action-mapper";
import { deriveLegalActions } from "./legal-actions";

const PLAYER_STATUS: Record<PlayerStatus, PlayerStatusName> = {
  [PlayerStatus.ACTIVE]: "active",
  [PlayerStatus.FOLDED]: "folded",
  [PlayerStatus.ALL_IN]: "all_in",
  [PlayerStatus.SITTING_OUT]: "sitting_out",
  [PlayerStatus.WAITING]: "waiting",
  [PlayerStatus.BUSTED]: "busted",
  [PlayerStatus.RESERVED]: "reserved",
};

function toStreetName(street: Street | string | undefined): StreetName {
  switch (street) {
    case Street.PREFLOP:
      return "preflop";
    case Street.FLOP:
      return "flop";
    case Street.TURN:
      return "turn";
    case Street.RIVER:
      return "river";
    default:
      return "showdown";
  }
}

function toPlayerId(value: string): PlayerId {
  if ((PLAYER_IDS as readonly string[]).includes(value)) {
    return value as PlayerId;
  }
  throw new TableError("INTERNAL", `Unknown player id ${value}`);
}

function toSeatId(value: number): SeatId {
  if (!isSeatId(value)) {
    throw new TableError("INTERNAL", `Invalid seat ${value}`);
  }
  return value;
}

function aggregateWinners(state: GameState): WinnerView[] | null {
  if (state.winners === null) return null;

  const bySeat = new Map<number, WinnerView>();
  for (const winner of state.winners) {
    const seat = toSeatId(winner.seat);
    const player = state.players[seat];
    if (!player) continue;
    const existing = bySeat.get(seat);
    if (existing) {
      bySeat.set(seat, {
        ...existing,
        amount: existing.amount + winner.amount,
        hand: existing.hand ?? winner.hand,
        handRank: existing.handRank ?? winner.handRank,
      });
    } else {
      bySeat.set(seat, {
        seat,
        playerId: toPlayerId(player.id),
        amount: winner.amount,
        hand: winner.hand,
        handRank: winner.handRank,
      });
    }
  }

  return [...bySeat.values()].sort((left, right) => left.seat - right.seat);
}

function publicPots(state: GameState): PublicPotView[] {
  return state.pots.map((pot) => ({
    type: pot.type === "MAIN" ? "main" : "side",
    amount: pot.amount,
    eligibleSeats: pot.eligibleSeats.filter(isSeatId),
    capPerPlayer: pot.capPerPlayer,
  }));
}

function currentBetsByPlayer(state: GameState): Readonly<Record<PlayerId, number>> {
  const result = Object.fromEntries(PLAYER_IDS.map((id) => [id, 0])) as Record<PlayerId, number>;
  for (const [seat, amount] of state.currentBets.entries()) {
    const player = state.players[seat];
    if (player) result[toPlayerId(player.id)] = amount;
  }
  return result;
}

function publicActions(state: GameState): PublicActionView[] {
  const result: PublicActionView[] = [];

  for (const [index, record] of state.actionHistory.entries()) {
    const action = record.action;
    const player = record.seat === null ? null : state.players[record.seat];
    const base = {
      eventId: `${state.handId}:history:${index}`,
      seat: record.seat === null ? null : toSeatId(record.seat),
      playerId: player ? toPlayerId(player.id) : null,
      street: toStreetName(record.street),
      potAfter: record.resultingPot,
      stackAfter: record.resultingStack,
      amountTo:
        "amount" in action && (action.type === ActionType.BET || action.type === ActionType.RAISE)
          ? action.amount
          : null,
      amount:
        "amount" in action && action.type === ActionType.CALL ? (action.amount ?? null) : null,
    };

    switch (action.type) {
      case ActionType.FOLD:
        result.push({ ...base, type: "fold" });
        break;
      case ActionType.CHECK:
        result.push({ ...base, type: "check" });
        break;
      case ActionType.CALL:
        result.push({ ...base, type: "call" });
        break;
      case ActionType.BET:
        result.push({ ...base, type: "bet" });
        break;
      case ActionType.RAISE:
        result.push({ ...base, type: "raise" });
        break;
      case ActionType.UNCALLED_BET_RETURNED:
        result.push({
          ...base,
          type: "uncalled_return",
          amountTo: null,
          amount: action.amount,
        });
        break;
      default:
        break;
    }
  }

  return result;
}

function visibleCards(
  state: GameState,
  player: Player,
  viewer: PlayerId | null,
): { cards: readonly (string | null)[] | null; shown: boolean } {
  if (!player.hand || player.hand.length === 0) {
    return { cards: null, shown: false };
  }

  if (viewer === player.id) {
    return { cards: player.hand, shown: true };
  }

  if (state.street !== Street.SHOWDOWN || player.shownCards === null) {
    return { cards: null, shown: false };
  }

  const shown = new Set(player.shownCards);
  return {
    cards: player.hand.map((card, index) => (shown.has(index) ? card : null)),
    shown: shown.size > 0,
  };
}

function publicPlayer(
  state: GameState,
  player: Player,
  viewer: PlayerId | null,
): PublicTableView["players"][number] {
  const cards = visibleCards(state, player, viewer);
  return {
    seat: toSeatId(player.seat),
    playerId: toPlayerId(player.id),
    name: player.name,
    stack: player.stack,
    betThisStreet: player.betThisStreet,
    totalInvestedThisHand: player.totalInvestedThisHand,
    status: PLAYER_STATUS[player.status],
    isAllIn: player.status === PlayerStatus.ALL_IN,
    isFolded: player.status === PlayerStatus.FOLDED,
    cards: cards.cards,
    cardsShown: cards.shown,
  };
}

function findActionRecord(
  state: GameState,
  seat: SeatId,
): { record: ActionRecord; index: number } | undefined {
  for (let index = state.actionHistory.length - 1; index >= 0; index -= 1) {
    const record = state.actionHistory[index];
    if (record?.seat === seat && record.action.type !== ActionType.UNCALLED_BET_RETURNED) {
      return { record, index };
    }
  }
  return undefined;
}

/**
 * Server-side wrapper around the selected Stage A rule library.
 *
 * The raw engine state is deliberately private. All outward state goes
 * through explicit allow-listed DTO builders.
 */
export class PokerTable {
  private readonly engine: PokerEngine;

  constructor(engine: PokerEngine) {
    const players = engine.state.players.filter((player): player is Player => player !== null);
    if (players.length !== MAX_SEATS) {
      throw new TableError(
        "INTERNAL",
        `Stage A requires exactly ${MAX_SEATS} seated players, found ${players.length}`,
      );
    }
    const ids = new Set(players.map((player) => player.id));
    for (const id of PLAYER_IDS) {
      if (!ids.has(id)) {
        throw new TableError("INTERNAL", `Missing required player ${id}`);
      }
    }
    this.engine = engine;
  }

  get currentActorSeat(): SeatId | null {
    const seat = this.engine.state.actionTo;
    return seat === null ? null : toSeatId(seat);
  }

  get handId(): string {
    return this.engine.state.handId;
  }

  get handNumber(): number {
    return this.engine.state.handNumber;
  }

  get turnId(): string {
    return `${this.engine.state.handId}:${this.engine.state.actionHistory.length}`;
  }

  get isSettled(): boolean {
    const state = this.engine.state;
    return state.street === Street.SHOWDOWN && state.winners !== null;
  }

  /**
   * Adds chips to the player's pendingAddOn. The library merges this at the
   * next DEAL, so it is only valid between hands.
   */
  addChips(seat: SeatId, amount: number): void {
    if (!this.isSettled) {
      throw new TableError("HAND_COMPLETE", "Cannot top up during a hand");
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new TableError("INVALID_AMOUNT", "Top-up must be a positive safe integer");
    }
    const player = this.engine.state.players[seat];
    if (!player) {
      throw new TableError("INTERNAL", `No player in seat ${seat}`);
    }
    this.engine.act({
      type: ActionType.ADD_CHIPS,
      playerId: player.id,
      amount,
    });
  }

  startNextHand(): void {
    if (!this.isSettled) {
      throw new TableError("HAND_COMPLETE", "Cannot start the next hand before settlement");
    }
    this.engine.deal();
  }

  legalActions(seat: SeatId): LegalActionView | null {
    return deriveLegalActions(this.engine.state, seat);
  }

  act(seat: SeatId, input: ActionInput): ActionResult {
    const before = this.engine.state;
    const beforePlayer = before.players[seat];
    if (!beforePlayer) {
      throw new TableError("NOT_YOUR_TURN", `No player in seat ${seat}`);
    }

    const engineAction = toEngineAction(before, seat, input);
    const turnId = `${before.handId}:${before.actionHistory.length}`;

    try {
      this.engine.act(engineAction);
    } catch (error) {
      if (error instanceof IllegalActionError) {
        const reason = error.code;
        if (reason === "NOT_YOUR_TURN") {
          throw new TableError("NOT_YOUR_TURN", error.message, reason);
        }
        if (reason === "NO_CHIPS") {
          throw new TableError("NO_CHIPS", error.message, reason);
        }
        if (reason === "INVALID_AMOUNT") {
          throw new TableError("INVALID_AMOUNT", error.message, reason);
        }
        throw new TableError("INVALID_ACTION", error.message, reason);
      }
      throw new TableError(
        "INTERNAL",
        error instanceof Error ? error.message : "Unknown engine error",
      );
    }

    const after = this.engine.state;
    const found = findActionRecord(after, seat);
    if (!found) {
      throw new TableError("INTERNAL", "Engine committed an action without a history record");
    }
    const { record, index: actionIndex } = found;

    const resultingStack = record.resultingStack;
    const chipsMoved = Math.max(0, beforePlayer.stack - resultingStack);
    const event: ActionEvent = {
      // Same stable id exposed by PublicActionView.actions, so insight callers
      // can bind to an already submitted public action rather than a private id.
      eventId: `${before.handId}:history:${actionIndex}`,
      handId: before.handId,
      turnId,
      playerId: toPlayerId(beforePlayer.id),
      seat,
      street: toStreetName(record.street),
      action: input.action,
      amountTo: input.action === "bet" || input.action === "raise" ? input.amountTo : null,
      chipsMoved,
      potAfter: record.resultingPot,
      stackAfter: resultingStack,
      createdAt: Date.now(),
    };

    return { event, state: this.publicView(seat) };
  }

  publicView(viewer: SeatId | null = null): PublicTableView {
    const state = this.engine.state;
    const viewerId = viewer === null ? null : toPlayerId(PLAYER_IDS[viewer]);
    const players = state.players
      .filter((player): player is Player => player !== null)
      .map((player) => publicPlayer(state, player, viewerId))
      .sort((left, right) => left.seat - right.seat);

    const actorSeat = state.actionTo === null ? null : toSeatId(state.actionTo);
    const actor = actorSeat === null ? null : state.players[actorSeat];
    const potTotal =
      state.pots.reduce((total, pot) => total + pot.amount, 0) +
      [...state.currentBets.values()].reduce((total, amount) => total + amount, 0);

    return {
      handId: state.handId,
      handNumber: state.handNumber,
      maxPlayers: state.maxPlayers,
      buttonSeat: state.buttonSeat === null ? null : toSeatId(state.buttonSeat),
      bigBlindSeat: state.bigBlindSeat === null ? null : toSeatId(state.bigBlindSeat),
      street: toStreetName(state.street),
      board: state.board,
      actionTo: actor ? toPlayerId(actor.id) : null,
      actionToSeat: actorSeat,
      potTotal,
      pots: publicPots(state),
      currentBets: currentBetsByPlayer(state),
      players,
      actions: publicActions(state),
      winners: aggregateWinners(state),
      viewer: viewerId,
      legalActions: viewer === null ? null : this.legalActions(viewer),
    };
  }

  botView(seat: SeatId): BotDecisionView {
    const state = this.publicView(seat);
    const legal = this.legalActions(seat);
    if (!legal) {
      throw new TableError("NOT_YOUR_TURN", `It is not seat ${seat}'s turn`);
    }
    const player = PLAYER_IDS[seat];
    return {
      ...state,
      selfPlayerId: player,
      selfSeat: seat,
      legalActions: legal,
    };
  }
}

/**
 * Production table factory.
 *
 * The first button is selected with Node's CSPRNG. The library's DEAL action
 * advances the button by one, so the restored pre-deal snapshot is set one
 * seat before the desired button. This uses only the library's public
 * snapshot/restore API and is covered by the test harness.
 */
export function createPokerTable(): PokerTable {
  const engine = new PokerEngine({
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    maxPlayers: MAX_SEATS,
    validateIntegrity: true,
  });

  for (const seat of SEAT_IDS) {
    engine.sit(seat, PLAYER_IDS[seat], PLAYER_IDS[seat], STARTING_STACK);
  }

  const firstButton = randomInt(0, MAX_SEATS) as SeatId;
  const preDealButton = ((firstButton + MAX_SEATS - 1) % MAX_SEATS) as SeatId;
  const restored = PokerEngine.restore({ ...engine.snapshot, buttonSeat: preDealButton });
  restored.deal();
  return new PokerTable(restored);
}
