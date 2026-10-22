/**
 * Test-only deterministic table for the Stage B browser rebuy walkthrough.
 *
 * This module is only active when POKER_STAGE_B_TEST_TABLE=1 in a non-production
 * process. It is not an API parameter, never accepts client-provided cards, and
 * is not used by the production factory.
 */
import { PokerEngine } from "@pokertools/engine";
import { getCardCode } from "@pokertools/evaluator";
import { PokerTable } from "@/server/engine";
import { PLAYER_IDS } from "@/shared/contracts";

const RANKS = "23456789TJQKA";
const SUITS = "shdc";
const ALL_CARDS = [...RANKS].flatMap((rank) => [...SUITS].map((suit) => `${rank}${suit}`));
const CARD_CODES = new Map(ALL_CARDS.map((card) => [card, getCardCode(card)]));

const STACKS = [1, 1, 1000, 1000, 1000] as const;
const FIRST_CARDS = [
  "2c",
  "Kc",
  "6c",
  "8s",
  "9d",
  "3d",
  "Qc",
  "7d",
  "8h",
  "5d",
  "4c",
  "Ks",
  "Qh",
  "Jd",
  "7s",
  "8c",
  "9h",
  "2s",
];

function scriptedRandomProvider(): () => number {
  const desired = [...FIRST_CARDS, ...ALL_CARDS.filter((card) => !FIRST_CARDS.includes(card))];
  const codes = desired.map((card) => CARD_CODES.get(card));
  const pool = [...Array(52).keys()];
  const draws: number[] = [];
  for (let index = 51; index > 0; index -= 1) {
    const target = codes[index];
    const found = pool.indexOf(target!);
    draws.push((found + 0.5) / (index + 1));
    [pool[index], pool[found]] = [pool[found]!, pool[index]!];
  }
  draws.push(0.5);
  let drawIndex = 0;
  return () => draws[drawIndex++] ?? 0.5;
}

export function createStageBTestTableIfEnabled(): PokerTable | null {
  if (process.env.NODE_ENV === "production" || process.env.POKER_STAGE_B_TEST_TABLE !== "1") {
    return null;
  }

  const engine = new PokerEngine(
    {
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 5,
      randomProvider: scriptedRandomProvider(),
      validateIntegrity: true,
    },
    () => 1_700_000_000_000,
  );
  STACKS.forEach((stack, seat) => {
    engine.sit(seat, PLAYER_IDS[seat]!, PLAYER_IDS[seat]!, stack);
  });
  const restored = PokerEngine.restore({ ...engine.snapshot, buttonSeat: 4 });
  restored.deal();
  return new PokerTable(restored);
}
