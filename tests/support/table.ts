import { PokerEngine } from "@pokertools/engine";
import { getCardCode } from "@pokertools/evaluator";
import { PokerTable } from "@/server/engine";
import { BIG_BLIND, PLAYER_IDS, SMALL_BLIND, type SeatId } from "@/shared/contracts";

const RANKS = "23456789TJQKA";
const SUITS = "shdc";
export const ALL_CARDS = [...RANKS].flatMap((rank) => [...SUITS].map((suit) => `${rank}${suit}`));

const CARD_CODES = new Map(ALL_CARDS.map((card) => [card, getCardCode(card)]));

export interface TestTableOptions {
  /** Five stacks, indexed by seat. */
  readonly stacks: readonly [number, number, number, number, number];
  /** Desired button seat for the first hand. */
  readonly button: SeatId;
  /**
   * Desired leading deck order. For a full five-handed hand, hole cards are
   * dealt first (two rounds over seats 0..4), followed by burn/flop,
   * burn/turn, burn/river.
   */
  readonly firstCards: readonly string[];
}

/**
 * Builds a deterministic Fisher-Yates draw sequence for a desired deck.
 *
 * The engine's shuffle uses `Math.floor(rng() * (i + 1))`. Returning the
 * midpoint of each target bucket avoids floating-point boundary ambiguity.
 */
export function scriptedRandomProvider(firstCards: readonly string[]): () => number {
  const desired = [...firstCards, ...ALL_CARDS.filter((card) => !firstCards.includes(card))];
  const unique = new Set(desired);
  if (desired.length !== 52 || unique.size !== 52) {
    throw new Error("firstCards must not contain duplicates and must lead to a 52-card deck");
  }

  const desiredCodes = desired.map((card) => CARD_CODES.get(card));
  if (desiredCodes.some((code) => code === undefined)) {
    throw new Error("firstCards contains an unknown card");
  }

  const pool = [...Array(52).keys()];
  const draws: number[] = [];
  for (let index = 51; index > 0; index -= 1) {
    const target = desiredCodes[index];
    const j = pool.indexOf(target!);
    if (j < 0 || j > index) {
      throw new Error(`Cannot construct deck at index ${index}`);
    }
    draws.push((j + 0.5) / (index + 1));
    [pool[index], pool[j]] = [pool[j]!, pool[index]!];
  }
  // One extra draw is consumed by the engine for the hand id.
  draws.push(0.5);

  let drawIndex = 0;
  return () => draws[drawIndex++] ?? 0.5;
}

export function makeTestTable(options: TestTableOptions): PokerTable {
  const engine = new PokerEngine(
    {
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      maxPlayers: 5,
      randomProvider: scriptedRandomProvider(options.firstCards),
      validateIntegrity: true,
    },
    () => 1_700_000_000_000,
  );

  for (const seat of [0, 1, 2, 3, 4] as const) {
    engine.sit(seat, PLAYER_IDS[seat], PLAYER_IDS[seat], options.stacks[seat]);
  }

  // DEAL advances the button by one; set the pre-deal button accordingly.
  const preDealButton = ((options.button + 4) % 5) as SeatId;
  const restored = PokerEngine.restore({
    ...engine.snapshot,
    buttonSeat: preDealButton,
  });
  restored.deal();
  return new PokerTable(restored);
}

export function stackOf(table: PokerTable, seat: SeatId): number {
  const player = table.publicView().players[seat];
  if (!player) throw new Error(`No player in seat ${seat}`);
  return player.stack;
}

export function winnerAmount(table: PokerTable, seat: SeatId): number {
  return (table.publicView().winners ?? [])
    .filter((winner) => winner.seat === seat)
    .reduce((total, winner) => total + winner.amount, 0);
}
