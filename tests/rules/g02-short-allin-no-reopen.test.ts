import { describe, expect, it } from "vitest";
import { TableError } from "@/shared/contracts";
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

describe("G02 short all-in does not reopen betting", () => {
  it("offers C a full raise to 65, then does not reopen A after the short all-in", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 45],
      button: 0,
      firstCards: CARDS,
    });

    table.act(3, { action: "raise", amountTo: 30 });
    const allIn = table.act(4, { action: "all_in", amountTo: null });

    expect(allIn.event.action).toBe("all_in");
    expect(allIn.event.amountTo).toBeNull();
    expect(stackOf(table, 4)).toBe(0);
    expect(table.publicView().players[4]?.status).toBe("all_in");

    const cActions = table.legalActions(0);
    expect(cActions).not.toBeNull();
    expect(cActions?.toCall).toBe(45);
    expect(cActions?.minRaiseTo).toBe(65);
    expect(cActions?.actions).toContain("raise");
    expect(cActions?.actions).toContain("all_in");
    expect(cActions?.canOnlyShortAllIn).toBe(false);

    table.act(0, { action: "call", amountTo: null });
    table.act(1, { action: "call", amountTo: null });
    table.act(2, { action: "call", amountTo: null });

    expect(table.currentActorSeat).toBe(3);
    const aActions = table.legalActions(3);
    expect(aActions).not.toBeNull();
    expect(aActions?.toCall).toBe(15);
    expect(aActions?.minRaiseTo).toBeNull();
    expect(aActions?.actions).not.toContain("raise");
    expect(aActions?.actions).toEqual(["fold", "call"]);

    const historyBefore = table.publicView().actions.length;
    let error: unknown;
    try {
      table.act(3, { action: "raise", amountTo: 65 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TableError);
    expect((error as TableError).code).toBe("INVALID_ACTION");
    expect(stackOf(table, 3)).toBe(970);
    expect(table.publicView().actions).toHaveLength(historyBefore);
  });
});
