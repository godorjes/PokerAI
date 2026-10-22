import type { PokerTable } from "@/server/engine";
import { makeTestTable } from "./table";

export const G04_STACKS = [100, 300, 500, 1000, 1000] as const;

const G04_CARDS = [
  "As",
  "Ks",
  "Qs",
  "Js",
  "2d",
  "Ah",
  "Kh",
  "Qh",
  "Jh",
  "2c",
  "6c",
  "7c",
  "2s",
  "3h",
  "4d",
  "5c",
  "9s",
  "8c",
];

/**
 * A/B/C invest 100/300/500, D invests 50 and folds, E folds with no
 * investment. C's final 200 is uncalled and must be returned.
 *
 * Seats: 0=A (button), 1=B (SB), 2=C (BB), 3=D (UTG), 4=E (CO).
 */
export function playG04Scenario(): PokerTable {
  const table = makeTestTable({
    stacks: G04_STACKS,
    button: 0,
    firstCards: G04_CARDS,
  });

  // Preflop: D raises to 50, E folds, A/B/C call. Everyone has 50 invested.
  table.act(3, { action: "raise", amountTo: 50 });
  table.act(4, { action: "fold", amountTo: null });
  table.act(0, { action: "call", amountTo: null });
  table.act(1, { action: "call", amountTo: null });
  table.act(2, { action: "call", amountTo: null });

  // Flop: B checks, C shoves 450, D folds, A calls all-in for 50,
  // B calls all-in for 250. C's 200 excess is uncalled.
  table.act(1, { action: "check", amountTo: null });
  table.act(2, { action: "bet", amountTo: 450 });
  table.act(3, { action: "fold", amountTo: null });
  table.act(0, { action: "call", amountTo: null });
  table.act(1, { action: "call", amountTo: null });

  return table;
}
