import { describe, expect, it } from "vitest";
import { createPokerTable } from "@/server/engine";
import { PLAYER_IDS, SEAT_IDS } from "@/shared/contracts";

describe("production table factory", () => {
  it("creates a five-seat table, posts blinds, and exposes a valid first actor", () => {
    const table = createPokerTable();
    const state = table.publicView();
    const button = state.buttonSeat;

    expect(button).not.toBeNull();
    expect(state.maxPlayers).toBe(5);
    expect(state.players.map((player) => player.playerId)).toEqual([...PLAYER_IDS]);
    expect(state.buttonSeat).toBeGreaterThanOrEqual(0);
    expect(state.buttonSeat).toBeLessThan(5);
    expect(state.bigBlindSeat).toBe(((button! + 2) % 5) as 0 | 1 | 2 | 3 | 4);
    expect(state.street).toBe("preflop");
    expect(state.board).toEqual([]);
    expect(table.currentActorSeat).toBe(((button! + 3) % 5) as 0 | 1 | 2 | 3 | 4);

    const actor = table.currentActorSeat!;
    expect(table.legalActions(actor)).not.toBeNull();
    expect(table.botView(actor).selfSeat).toBe(actor);

    const total = SEAT_IDS.reduce<number>(
      (sum, seat) => sum + (state.players[seat]?.stack ?? 0),
      0,
    );
    const bets = Object.values(state.currentBets).reduce((sum, amount) => sum + amount, 0);
    expect(total + bets).toBe(5000);
  });
});
