import { describe, expect, it } from "vitest";
import { playG04Scenario } from "../support/g04";
import { stackOf, winnerAmount } from "../support/table";

describe("G04 side pots and uncalled amount", () => {
  it("builds a 350 main pot and a 400 side pot, returning C's uncalled 200", () => {
    const table = playG04Scenario();
    const view = table.publicView();

    expect(view.street).toBe("showdown");
    expect(view.board).toHaveLength(5);
    expect(view.potTotal).toBe(0);

    // A wins the 350 main pot; B wins the 400 side pot; C is refunded 200.
    expect(winnerAmount(table, 0)).toBe(350);
    expect(winnerAmount(table, 1)).toBe(400);
    expect(winnerAmount(table, 2)).toBe(0);

    expect(stackOf(table, 0)).toBe(350);
    expect(stackOf(table, 1)).toBe(400);
    expect(stackOf(table, 2)).toBe(200);
    expect(stackOf(table, 3)).toBe(950);
    expect(stackOf(table, 4)).toBe(1000);

    // Chips are conserved: 100 + 300 + 500 + 1,000 + 1,000.
    const total = ([0, 1, 2, 3, 4] as const).reduce<number>(
      (sum, seat) => sum + stackOf(table, seat),
      0,
    );
    expect(total).toBe(2900);

    const uncalled = view.actions.find((action) => action.type === "uncalled_return");
    expect(uncalled).toMatchObject({
      playerId: "ai-2",
      amount: 200,
      amountTo: null,
    });
  });
});
