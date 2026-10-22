import { describe, expect, it } from "vitest";
import { evaluateStrings, getCardCode, rank, rankDescription } from "@pokertools/evaluator";

// HandRank is an ambient const enum in the dependency, so numeric values are
// used here to stay compatible with isolatedModules.
const STRAIGHT = 4;
const ONE_PAIR = 7;

function rankOf(cards: readonly string[]): number {
  return rank(cards.map((card) => getCardCode(card)));
}

describe("G09 five-card ranking and kickers", () => {
  it("recognises A2345 as a five-high straight and ranks it below 23456", () => {
    const wheel = ["As", "2h", "3d", "4c", "5s"];
    const sixHigh = ["2s", "3h", "4d", "5c", "6s"];

    expect(rankOf(wheel)).toBe(STRAIGHT);
    expect(rankDescription(rankOf(wheel))).toBe("Straight");
    expect(rankOf(sixHigh)).toBe(STRAIGHT);
    // Lower evaluator score is stronger.
    expect(evaluateStrings(wheel)).toBeGreaterThan(evaluateStrings(sixHigh));
  });

  it("uses kickers instead of treating all one-pair hands as equal", () => {
    const pairWithQueen = ["As", "Ah", "Kd", "Qc", "5s"];
    const pairWithJack = ["As", "Ah", "Kd", "Jc", "5s"];

    expect(rankOf(pairWithQueen)).toBe(ONE_PAIR);
    expect(evaluateStrings(pairWithQueen)).toBeLessThan(evaluateStrings(pairWithJack));
  });

  it("uses the board when the board is the best five-card hand", () => {
    const board = ["Ts", "Js", "Qs", "Ks", "As"];
    const withLowHoleCards = [...board, "2h", "3d"];
    const withOtherHoleCards = [...board, "4h", "5d"];

    expect(evaluateStrings(withLowHoleCards)).toBe(1);
    expect(evaluateStrings(withOtherHoleCards)).toBe(1);
    expect(evaluateStrings(withLowHoleCards)).toBe(evaluateStrings(withOtherHoleCards));
  });

  it("does not break ties by suit or by card string ordering", () => {
    const spades = ["As", "Kd", "Qh", "Jc", "9s"];
    const hearts = ["Ah", "Ks", "Qd", "Js", "9h"];

    expect(rankOf(spades)).toBe(rankOf(hearts));
    expect(evaluateStrings(spades)).toBe(evaluateStrings(hearts));
  });
});
