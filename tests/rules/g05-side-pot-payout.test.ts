import { describe, expect, it } from "vitest";
import { playG04Scenario } from "../support/g04";
import { stackOf, winnerAmount } from "../support/table";

describe("G05 side-pot payout by hand strength", () => {
  it("awards 350/400/200 for A > B > C and excludes the folded D", () => {
    const table = playG04Scenario();
    const view = table.publicView();

    expect(view.winners).not.toBeNull();
    expect(view.winners?.map((winner) => winner.seat)).toEqual([0, 1]);

    expect(winnerAmount(table, 0)).toBe(350);
    expect(winnerAmount(table, 1)).toBe(400);
    expect(winnerAmount(table, 2)).toBe(0);
    expect(winnerAmount(table, 3)).toBe(0);
    expect(winnerAmount(table, 4)).toBe(0);

    expect(stackOf(table, 0)).toBe(350);
    expect(stackOf(table, 1)).toBe(400);
    expect(stackOf(table, 2)).toBe(200);
    expect(stackOf(table, 3)).toBe(950);
    expect(stackOf(table, 4)).toBe(1000);

    // A's aces beat B's kings for the main pot; B's kings beat C's queens
    // for the side pot. C only receives the unmatched 200 back.
    const winnerHands = view.winners?.map((winner) => winner.hand);
    expect(winnerHands?.[0]).toEqual(expect.arrayContaining(["As", "Ah"]));
    expect(winnerHands?.[1]).toEqual(expect.arrayContaining(["Ks", "Kh"]));
  });
});
