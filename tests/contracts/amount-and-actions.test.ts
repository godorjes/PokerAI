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

describe("amountTo and legal-action contract", () => {
  it("returns the complete preflop window and rejects amounts without clamping", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    expect(table.legalActions(3)).toEqual({
      actions: ["fold", "call", "raise", "all_in"],
      toCall: 10,
      minBetTo: null,
      minRaiseTo: 20,
      maxTo: 1000,
      canOnlyShortAllIn: false,
    });

    const invalidInputs = [
      { action: "raise" as const, amountTo: 19 },
      { action: "raise" as const, amountTo: 10.5 },
      { action: "raise" as const, amountTo: 1001 },
      { action: "call" as const, amountTo: 10 },
      { action: "fold" as const, amountTo: 1 },
    ];

    for (const input of invalidInputs) {
      let error: unknown;
      try {
        table.act(3, input);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(TableError);
      expect((error as TableError).code).toBe("INVALID_AMOUNT");
      expect(table.currentActorSeat).toBe(3);
      expect(stackOf(table, 3)).toBe(1000);
    }

    let wrongTurn: unknown;
    try {
      table.act(4, { action: "fold", amountTo: null });
    } catch (caught) {
      wrongTurn = caught;
    }
    expect(wrongTurn).toBeInstanceOf(TableError);
    expect((wrongTurn as TableError).code).toBe("NOT_YOUR_TURN");
  });

  it("uses the separate all_in path for a short opening raise", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 15, 1000],
      button: 0,
      firstCards: CARDS,
    });

    const actions = table.legalActions(3);
    expect(actions).toMatchObject({
      actions: ["fold", "call", "all_in"],
      toCall: 10,
      minRaiseTo: null,
      maxTo: 15,
      canOnlyShortAllIn: true,
    });

    const result = table.act(3, { action: "all_in", amountTo: null });
    expect(result.event.action).toBe("all_in");
    expect(result.event.amountTo).toBeNull();
    expect(result.event.chipsMoved).toBe(15);
    expect(stackOf(table, 3)).toBe(0);
    expect(table.publicView().currentBets["ai-3"]).toBe(15);
  });

  it("maps a short all-in call to CALL and records the actual chips moved", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 5],
      button: 0,
      firstCards: CARDS,
    });

    table.act(3, { action: "call", amountTo: null });
    const actions = table.legalActions(4);
    expect(actions).toMatchObject({
      actions: ["fold", "call", "all_in"],
      toCall: 10,
      minRaiseTo: null,
      maxTo: 5,
      canOnlyShortAllIn: false,
    });

    const result = table.act(4, { action: "all_in", amountTo: null });
    expect(result.event.action).toBe("all_in");
    expect(result.event.chipsMoved).toBe(5);
    expect(result.event.amountTo).toBeNull();
    expect(stackOf(table, 4)).toBe(0);
    expect(table.publicView().currentBets["ai-4"]).toBe(5);
  });

  it("uses bet with no current wager and raise only after a wager exists", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    for (const seat of [3, 4, 0, 1] as const) {
      table.act(seat, { action: "call", amountTo: null });
    }
    table.act(2, { action: "check", amountTo: null });

    // Flop: SB acts first; no wager exists yet.
    expect(table.currentActorSeat).toBe(1);
    expect(table.legalActions(1)).toMatchObject({
      toCall: 0,
      minBetTo: 10,
      minRaiseTo: null,
      actions: ["fold", "check", "bet", "all_in"],
    });

    let error: unknown;
    try {
      table.act(1, { action: "raise", amountTo: 20 });
    } catch (caught) {
      error = caught;
    }
    expect((error as TableError).code).toBe("INVALID_ACTION");

    const bet = table.act(1, { action: "bet", amountTo: 20 });
    expect(bet.event.amountTo).toBe(20);
    expect(bet.event.chipsMoved).toBe(20);
  });
});
