import { describe, expect, it } from "vitest";
import { makeTestTable, stackOf } from "../support/table";

const CARDS = [
  "As",
  "Ks",
  "Qs",
  "Js",
  "Ts",
  "Ah",
  "Kh",
  "Qh",
  "Jh",
  "Th",
  "2c",
  "3c",
  "4c",
  "5c",
  "7c",
  "8c",
  "9c",
  "2d",
];

describe("G01 amountTo is a total street commitment", () => {
  it("deducts only the increment when the big blind raises from 10 to 30", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    for (const seat of [3, 4, 0, 1] as const) {
      table.act(seat, { action: "call", amountTo: null });
    }

    // BB has 10 invested. Raising to 30 must deduct exactly 20 more.
    const result = table.act(2, { action: "raise", amountTo: 30 });

    expect(result.event.action).toBe("raise");
    expect(result.event.amountTo).toBe(30);
    expect(result.event.chipsMoved).toBe(20);
    expect(stackOf(table, 2)).toBe(970);
    expect(table.publicView().currentBets["ai-2"]).toBe(30);
    expect(table.publicView().actions.at(-1)).toMatchObject({
      type: "raise",
      playerId: "ai-2",
      amountTo: 30,
      stackAfter: 970,
    });
  });
});
