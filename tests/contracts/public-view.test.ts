import { describe, expect, it } from "vitest";
import { makeTestTable } from "../support/table";

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

describe("public and bot views", () => {
  it("reveals only the viewer's cards and none of the engine internals", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    const human = table.publicView(0);
    expect(human.viewer).toBe("human");
    expect(human.players[0]?.cards).toEqual(["As", "Ah"]);
    expect(human.players[0]?.cardsShown).toBe(true);
    expect(human.players[1]?.cards).toBeNull();
    expect(human.players[2]?.cards).toBeNull();
    expect(human.players[3]?.cards).toBeNull();
    expect(human.players[4]?.cards).toBeNull();
    expect(human.legalActions).toBeNull();

    expect(human).not.toHaveProperty("deck");
    expect(human).not.toHaveProperty("config");
    expect(human).not.toHaveProperty("previousStates");
    expect(human).not.toHaveProperty("randomProvider");
    expect(JSON.stringify(human)).not.toContain("Ks");
    expect(JSON.stringify(human)).not.toContain("Kh");
  });

  it("gives the acting bot its own cards and legal actions only", () => {
    const table = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: CARDS,
    });

    const bot = table.botView(3);
    expect(bot.selfPlayerId).toBe("ai-3");
    expect(bot.selfSeat).toBe(3);
    expect(bot.players[3]?.cards).toEqual(["Js", "Jh"]);
    expect(bot.players[0]?.cards).toBeNull();
    expect(bot.legalActions.toCall).toBe(10);
    expect(bot.legalActions.actions).toContain("raise");
    expect(bot).not.toHaveProperty("deck");
    expect(JSON.stringify(bot)).not.toContain("As");
  });
});
