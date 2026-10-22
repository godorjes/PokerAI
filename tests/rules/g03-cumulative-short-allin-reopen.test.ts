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

describe("G03 cumulative short all-ins can reopen betting", () => {
  it("reopens A after 30 -> 45 -> 50 and offers a minimum raise to 70", () => {
    const table = makeTestTable({
      stacks: [50, 1000, 1000, 1000, 45],
      button: 0,
      firstCards: CARDS,
    });

    table.act(3, { action: "raise", amountTo: 30 });
    table.act(4, { action: "all_in", amountTo: null });

    const shortAllIn = table.act(0, { action: "all_in", amountTo: null });
    expect(shortAllIn.event.amountTo).toBeNull();
    expect(stackOf(table, 0)).toBe(0);
    expect(table.publicView().players[0]?.status).toBe("all_in");

    table.act(1, { action: "call", amountTo: null });
    table.act(2, { action: "call", amountTo: null });

    expect(table.currentActorSeat).toBe(3);
    const actions = table.legalActions(3);
    expect(actions).not.toBeNull();
    expect(actions?.toCall).toBe(20);
    expect(actions?.minRaiseTo).toBe(70);
    expect(actions?.actions).toContain("raise");
    expect(actions?.canOnlyShortAllIn).toBe(false);

    const result = table.act(3, { action: "raise", amountTo: 70 });
    expect(result.event.amountTo).toBe(70);
    expect(result.event.chipsMoved).toBe(40);
    expect(result.event.stackAfter).toBe(930);
    expect(stackOf(table, 3)).toBe(930);
    expect(table.publicView().currentBets["ai-3"]).toBe(70);
  });
});
