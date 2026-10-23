import { describe, expect, it } from "vitest";
import { GameService } from "@/server/session/service";
import { GameSessionStore } from "@/server/session/store";
import { ApiError } from "@/server/session/errors";
import type { GameStateResponse } from "@/shared/api";
import type { ActionName } from "@/shared/contracts";
import { makeTestTable } from "../support/table";

const CARDS = [
  "2c",
  "Kc",
  "6c",
  "8s",
  "9d",
  "3d",
  "Qc",
  "7d",
  "8h",
  "5d",
  "4c",
  "Ks",
  "Qh",
  "Jd",
  "7s",
  "8c",
  "9h",
  "2s",
];

function factory(
  stacks: [number, number, number, number, number] = [1000, 1000, 1000, 1000, 1000],
) {
  return () => makeTestTable({ stacks, button: 0, firstCards: CARDS });
}

function requestId(counter: number): string {
  return `test-${counter}`;
}

function humanAction(
  service: GameService,
  owner: string,
  state: GameStateResponse,
  action: ActionName,
  id: number,
): GameStateResponse {
  return service.humanAction(owner, {
    gameId: state.gameId,
    handId: state.handId,
    turnId: state.turnId,
    expectedVersion: state.stateVersion,
    requestId: requestId(id),
    action,
    amountTo: null,
  });
}

function chooseHumanAction(state: GameStateResponse): ActionName {
  const legal = state.table.legalActions;
  if (!legal) throw new Error("No human legal actions");
  if (legal.actions.includes("call")) return "call";
  if (legal.actions.includes("check")) return "check";
  if (legal.actions.includes("all_in")) return "all_in";
  return "fold";
}

async function botDecision(
  service: GameService,
  owner: string,
  state: GameStateResponse,
  id: number,
): Promise<GameStateResponse> {
  return service.botDecision(owner, {
    gameId: state.gameId,
    handId: state.handId,
    turnId: state.turnId,
    expectedVersion: state.stateVersion,
    requestId: requestId(id),
    aiEpoch: state.aiEpoch,
  });
}

function expectApiError(fn: () => unknown, code: string, status: number): void {
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
  expect((error as ApiError).status).toBe(status);
}

describe("Stage B session service", () => {
  it("creates, restores, and rejects a foreign owner", () => {
    const service = new GameService(new GameSessionStore(), factory());
    const started = service.start("owner-a");
    const restored = service.get("owner-a", started.gameId);

    expect(restored.gameId).toBe(started.gameId);
    expect(restored.stateVersion).toBe(1);
    expect(restored.table.players).toHaveLength(5);
    expect(restored.table.players[0]?.playerId).toBe("human");
    expect(restored.aiMode).toBe("disabled");

    expectApiError(() => service.get("owner-b", started.gameId), "SESSION_NOT_FOUND", 404);
  });

  it("expires an idle session and does not restore it after a process restart", () => {
    let now = 1_700_000_000_000;
    const store = new GameSessionStore({ now: () => now, ttlMs: 1_000 });
    const service = new GameService(store, factory());
    const started = service.start("owner-a");

    now += 1_001;
    expectApiError(() => service.get("owner-a", started.gameId), "SESSION_EXPIRED", 410);

    const restarted = new GameService(new GameSessionStore({ now: () => now }), factory());
    expectApiError(() => restarted.get("owner-a", started.gameId), "SESSION_NOT_FOUND", 404);
  });

  it("plays through the local bot path and exposes only the human view", async () => {
    const service = new GameService(new GameSessionStore(), factory());
    let state = service.start("owner-a");
    let counter = 1;

    for (let step = 0; step < 40 && state.phase === "playing"; step += 1) {
      const seat = state.table.actionToSeat;
      if (seat === null) break;
      state =
        seat === 0
          ? humanAction(service, "owner-a", state, chooseHumanAction(state), counter++)
          : await botDecision(service, "owner-a", state, counter++);
    }

    expect(state.phase).toBe("settled");
    expect(state.settled).toBe(true);
    expect(state.canStartNextHand).toBe(true);
    expect(state.table.board.length).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(state)).not.toContain('"deck"');
    expect(JSON.stringify(state)).not.toContain('"previousStates"');
  });

  it("requires a human rebuy and auto-tops up a busted bot between hands (G10)", async () => {
    const service = new GameService(new GameSessionStore(), factory([1, 1, 1000, 1000, 1000]));
    let state = service.start("owner-a");
    let counter = 1;

    for (let step = 0; step < 60 && state.phase === "playing"; step += 1) {
      const seat = state.table.actionToSeat;
      if (seat === null) break;
      if (seat === 0) {
        state = humanAction(service, "owner-a", state, chooseHumanAction(state), counter++);
      } else {
        state = await botDecision(service, "owner-a", state, counter++);
      }
    }

    expect(state.phase).toBe("settled");
    expect(state.table.players[0]?.stack).toBe(0);
    expect(state.table.players[1]?.stack).toBe(0);
    expect(state.rebuyRequired).toBe(true);

    let error: unknown;
    try {
      service.nextHand("owner-a", {
        gameId: state.gameId,
        expectedVersion: state.stateVersion,
        requestId: requestId(counter++),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("REBUY_REQUIRED");

    const totalChips = (snapshot: GameStateResponse): number =>
      snapshot.table.players.reduce((sum, player) => sum + player.stack, 0) +
      snapshot.table.potTotal;
    const beforeTotal = totalChips(state);
    const next = service.nextHand("owner-a", {
      gameId: state.gameId,
      expectedVersion: state.stateVersion,
      requestId: requestId(counter++),
      rebuy: true,
    });
    const afterTotal = totalChips(next);

    expect(next.phase).toBe("playing");
    expect(next.stateVersion).toBeGreaterThan(state.stateVersion);
    expect(next.table.players[0]?.stack).toBeGreaterThan(0);
    expect(next.table.players[1]?.stack).toBeGreaterThan(0);
    expect(afterTotal - beforeTotal).toBe(2_000);
    expect(next.topUps.map((topUp) => topUp.kind)).toEqual(
      expect.arrayContaining(["auto_bot", "human_rebuy"]),
    );
  });
});
