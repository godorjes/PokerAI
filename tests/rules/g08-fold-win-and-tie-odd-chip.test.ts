import { describe, expect, it } from "vitest";
import { makeTestTable, stackOf, winnerAmount } from "../support/table";

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

describe("G08 fold ending and tied pots", () => {
  it("settles immediately when everyone folds to the big blind", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    for (const seat of [3, 4, 0, 1] as const) {
      table.act(seat, { action: "fold", amountTo: null });
    }

    const view = table.publicView();
    expect(view.street).toBe("showdown");
    expect(view.board).toEqual([]);
    expect(view.winners?.map((winner) => winner.seat)).toEqual([2]);
    expect(winnerAmount(table, 2)).toBeGreaterThan(0);
    expect(view.potTotal).toBe(0);

    const total = ([0, 1, 2, 3, 4] as const).reduce<number>(
      (sum, seat) => sum + stackOf(table, seat),
      0,
    );
    expect(total).toBe(5000);
  });

  it("splits a four-way tie and gives the odd chip to the first winner left of the button", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: [
        "2s",
        "3s",
        "4s",
        "5s",
        "7s",
        "2h",
        "3h",
        "4h",
        "5h",
        "7h",
        "6c",
        "Ts",
        "Js",
        "Qs",
        "7c",
        "Ks",
        "8c",
        "As",
      ],
    });

    for (const seat of [3, 4, 0] as const) {
      table.act(seat, { action: "call", amountTo: null });
    }
    table.act(1, { action: "fold", amountTo: null });
    table.act(2, { action: "check", amountTo: null });

    for (let street = 0; street < 3; street += 1) {
      for (const seat of [2, 3, 4, 0] as const) {
        table.act(seat, { action: "check", amountTo: null });
      }
    }

    const view = table.publicView();
    expect(view.street).toBe("showdown");
    expect(view.board).toEqual(["Ts", "Js", "Qs", "Ks", "As"]);
    expect(view.winners?.map((winner) => winner.seat)).toEqual([0, 2, 3, 4]);

    // Pot is 45. Four winners get 11 each; the first winner left of the
    // button (seat 2) receives the remaining odd chip.
    expect(winnerAmount(table, 2)).toBe(12);
    expect(winnerAmount(table, 3)).toBe(11);
    expect(winnerAmount(table, 4)).toBe(11);
    expect(winnerAmount(table, 0)).toBe(11);

    expect(stackOf(table, 2)).toBe(1002);
    expect(stackOf(table, 3)).toBe(1001);
    expect(stackOf(table, 4)).toBe(1001);
    expect(stackOf(table, 0)).toBe(1001);
    expect(stackOf(table, 1)).toBe(995);
  });
});
