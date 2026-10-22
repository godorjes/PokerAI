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

describe("G07 one all-in does not end betting", () => {
  it("continues action for players who can still bet, without dealing the board early", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 100, 1000],
      button: 0,
      firstCards: CARDS,
    });

    table.act(3, { action: "all_in", amountTo: null });
    expect(stackOf(table, 3)).toBe(0);
    expect(table.currentActorSeat).toBe(4);
    expect(table.publicView().street).toBe("preflop");
    expect(table.publicView().board).toEqual([]);

    table.act(4, { action: "call", amountTo: null });
    expect(table.currentActorSeat).toBe(0);
    expect(table.legalActions(0)?.actions).toContain("raise");

    const result = table.act(0, { action: "raise", amountTo: 200 });
    expect(result.event.action).toBe("raise");
    expect(table.publicView().street).toBe("preflop");
    expect(table.publicView().board).toEqual([]);
    expect(table.publicView().players[3]?.status).toBe("all_in");
  });
});
