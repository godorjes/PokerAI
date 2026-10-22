import { describe, expect, it } from "vitest";
import { TableError } from "@/shared/contracts";
import { playG04Scenario } from "../support/g04";
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

describe("table hand lifecycle", () => {
  it("does not allow top-up or next hand while a hand is in progress", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    expect(() => table.startNextHand()).toThrow(TableError);
    expect(() => table.addChips(0, 100)).toThrow(TableError);
  });

  it("applies a pending top-up at the next deal", () => {
    const table = playG04Scenario();
    expect(table.isSettled).toBe(true);
    const firstHandNumber = table.handNumber;

    table.addChips(4, 100);
    table.startNextHand();

    expect(table.isSettled).toBe(false);
    expect(table.handNumber).toBe(firstHandNumber + 1);
    expect(table.publicView().street).toBe("preflop");
    expect(table.publicView().board).toEqual([]);
    expect(stackOf(table, 4)).toBe(1100);
    expect(table.currentActorSeat).not.toBeNull();
  });
});
