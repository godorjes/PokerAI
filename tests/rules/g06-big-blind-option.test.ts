import { describe, expect, it } from "vitest";
import { makeTestTable } from "../support/table";

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

describe("G06 big blind option after a limped preflop", () => {
  it("keeps action on the big blind to check or raise instead of dealing the flop", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    for (const seat of [3, 4, 0, 1] as const) {
      table.act(seat, { action: "call", amountTo: null });
    }

    expect(table.currentActorSeat).toBe(2);
    expect(table.publicView().street).toBe("preflop");
    expect(table.publicView().board).toEqual([]);
    expect(table.legalActions(2)).toMatchObject({
      toCall: 0,
      minRaiseTo: 20,
      actions: expect.arrayContaining(["check", "raise"]),
    });

    const result = table.act(2, { action: "check", amountTo: null });
    expect(result.event.action).toBe("check");
    expect(table.publicView().street).toBe("flop");
    expect(table.publicView().board).toHaveLength(3);
  });
});
