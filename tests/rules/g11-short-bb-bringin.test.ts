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

describe("G11 short big blind and the preflop bring-in", () => {
  it("keeps the bring-in at 10, allows a raise to 20, and skips the all-in BB", () => {
    const table = makeTestTable({
      stacks: [1000, 5, 3, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    expect(table.currentActorSeat).toBe(3);
    expect(table.publicView().players[1]?.status).toBe("all_in");
    expect(table.publicView().players[2]?.status).toBe("all_in");
    expect(table.legalActions(3)).toMatchObject({
      toCall: 10,
      minRaiseTo: 20,
      actions: expect.arrayContaining(["call", "raise"]),
    });

    table.act(3, { action: "call", amountTo: null });
    expect(stackOf(table, 3)).toBe(990);
    expect(table.currentActorSeat).toBe(4);
    expect(table.publicView().players[2]?.status).toBe("all_in");
    expect(table.legalActions(4)).toMatchObject({
      toCall: 10,
      minRaiseTo: 20,
    });

    const raise = table.act(4, { action: "raise", amountTo: 20 });
    expect(raise.event.amountTo).toBe(20);
    expect(raise.event.chipsMoved).toBe(20);
    expect(stackOf(table, 4)).toBe(980);
  });
});
