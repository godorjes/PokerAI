import type {
  BotDecisionView,
  LegalActionView,
  PlayerId,
  PlayerStatusName,
  SeatId,
  StreetName,
} from "@/shared/contracts";
import { positionForSeat, type BotStyleConfig } from "@/server/bot-strategy/styles";

export const DECISION_PROTOCOL_VERSION = "poker-ai.decision.v1";
export const DECISION_PROMPT_VERSION = "stage-d.v1";

export interface BotDecisionPlayer {
  readonly seat: SeatId;
  readonly playerId: PlayerId;
  readonly name: string;
  readonly position: string;
  readonly stack: number;
  readonly betThisStreet: number;
  readonly totalInvestedThisHand: number;
  readonly status: PlayerStatusName;
  readonly isAllIn: boolean;
  readonly isFolded: boolean;
}

export interface BotSelfView extends BotDecisionPlayer {
  /** Only the acting bot's own hole cards are present. */
  readonly cards: readonly string[];
}

export interface BotPublicAction {
  readonly type: string;
  readonly seat: SeatId | null;
  readonly playerId: PlayerId | null;
  readonly street: StreetName;
  readonly amountTo: number | null;
  readonly amount: number | null;
  readonly potAfter: number;
  readonly stackAfter: number | null;
}

export interface BotDecisionInput {
  readonly protocolVersion: typeof DECISION_PROTOCOL_VERSION;
  readonly promptVersion: typeof DECISION_PROMPT_VERSION;
  readonly handNumber: number;
  readonly street: StreetName;
  readonly board: readonly string[];
  readonly buttonSeat: SeatId | null;
  readonly bigBlindSeat: SeatId | null;
  readonly self: BotSelfView;
  readonly players: readonly BotDecisionPlayer[];
  readonly potTotal: number;
  readonly pots: BotDecisionView["pots"];
  readonly currentBets: BotDecisionView["currentBets"];
  readonly currentHandActions: readonly BotPublicAction[];
  readonly legalActions: LegalActionView;
  readonly style: {
    readonly id: string;
    readonly name: string;
    readonly guidance: string;
  };
}

/**
 * Explicit allow-list projection for one bot decision.
 *
 * The source PublicTableView currently hides opponent cards, but this builder
 * does not rely on that. It copies only public fields plus the actor's own
 * hole cards; the deck, opponent hands, winners' private data and model hints
 * are not part of the DTO.
 */
export function buildBotDecisionInput(
  view: BotDecisionView,
  style: BotStyleConfig,
): BotDecisionInput {
  if (view.selfSeat !== style.seat) {
    throw new Error(`Seat ${view.selfSeat} cannot use style for seat ${style.seat}`);
  }

  const publicPlayer = (player: BotDecisionView["players"][number]): BotDecisionPlayer => ({
    seat: player.seat,
    playerId: player.playerId,
    name: player.name,
    position: positionForSeat(player.seat, view.buttonSeat),
    stack: player.stack,
    betThisStreet: player.betThisStreet,
    totalInvestedThisHand: player.totalInvestedThisHand,
    status: player.status,
    isAllIn: player.isAllIn,
    isFolded: player.isFolded,
  });

  const selfPublic = view.players.find((player) => player.seat === view.selfSeat);
  if (!selfPublic) throw new Error(`No player row for seat ${view.selfSeat}`);
  const ownCards = (selfPublic.cards ?? []).filter(
    (card): card is string => typeof card === "string",
  );
  if (ownCards.length !== 2) {
    throw new Error(`Seat ${view.selfSeat} has no two-card self hand`);
  }

  const self: BotSelfView = {
    ...publicPlayer(selfPublic),
    cards: [...ownCards],
  };

  return {
    protocolVersion: DECISION_PROTOCOL_VERSION,
    promptVersion: DECISION_PROMPT_VERSION,
    handNumber: view.handNumber,
    street: view.street,
    board: [...view.board],
    buttonSeat: view.buttonSeat,
    bigBlindSeat: view.bigBlindSeat,
    self,
    players: view.players.map(publicPlayer),
    potTotal: view.potTotal,
    pots: view.pots.map((pot) => ({
      type: pot.type,
      amount: pot.amount,
      eligibleSeats: [...pot.eligibleSeats],
      capPerPlayer: pot.capPerPlayer,
    })),
    currentBets: { ...view.currentBets },
    currentHandActions: view.actions.map((action) => ({
      type: action.type,
      seat: action.seat,
      playerId: action.playerId,
      street: action.street,
      amountTo: action.amountTo,
      amount: action.amount,
      potAfter: action.potAfter,
      stackAfter: action.stackAfter,
    })),
    legalActions: {
      actions: [...view.legalActions.actions],
      toCall: view.legalActions.toCall,
      minBetTo: view.legalActions.minBetTo,
      minRaiseTo: view.legalActions.minRaiseTo,
      maxTo: view.legalActions.maxTo,
      canOnlyShortAllIn: view.legalActions.canOnlyShortAllIn,
    },
    style: {
      id: style.styleId,
      name: style.name,
      guidance: style.guidance,
    },
  };
}
