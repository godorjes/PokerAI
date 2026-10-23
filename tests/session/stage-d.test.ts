import { describe, expect, it } from "vitest";
import { buildBotDecisionInput, type BotDecisionInput } from "@/server/ai/bot-input";
import {
  DeepSeekGatewayError,
  type AiConnectionResult,
  type AiGateway,
  type AiSuggestion,
} from "@/server/ai/gateway";
import { botStyleForSeat } from "@/server/bot-strategy/styles";
import { GameService } from "@/server/session/service";
import { GameSessionStore } from "@/server/session/store";
import type { ActionName, BotDecisionView, SeatId } from "@/shared/contracts";
import type { GameStateResponse } from "@/shared/api";
import { makeTestTable } from "../support/table";

const CARDS = [
  "2c",
  "4c",
  "6c",
  "8s",
  "9d",
  "3d",
  "5d",
  "7d",
  "8h",
  "Tc",
  "Kc",
  "Qs",
  "Jh",
  "7s",
  "5h",
  "3s",
  "9h",
  "2h",
];

type QueueEntry = AiSuggestion | Error | Promise<AiSuggestion>;

class QueueGateway implements AiGateway {
  readonly inputs: BotDecisionInput[] = [];
  readonly queue: QueueEntry[];

  constructor(queue: QueueEntry[] = []) {
    this.queue = [...queue];
  }

  async testConnection(): Promise<AiConnectionResult> {
    return { status: "available", message: "ok", usage: null };
  }

  async decide(_key: string, input: BotDecisionInput): Promise<AiSuggestion> {
    this.inputs.push(input);
    const next = this.queue.shift();
    if (!next) throw new Error("No queued fake suggestion");
    if (next instanceof Error) throw next;
    return next;
  }
}

function table() {
  return makeTestTable({
    stacks: [1000, 1000, 1000, 1000, 1000],
    button: 0,
    firstCards: CARDS,
  });
}

function advanceToSeat(tableToAdvance: ReturnType<typeof table>, seat: SeatId): void {
  for (let step = 0; step < 10; step += 1) {
    const actor = tableToAdvance.currentActorSeat;
    if (actor === seat) return;
    if (actor === null) throw new Error("Hand settled before target seat");
    const legal = tableToAdvance.legalActions(actor);
    if (!legal) throw new Error(`No legal actions for seat ${actor}`);
    const action = legal.actions.includes("call")
      ? { action: "call" as const, amountTo: null }
      : legal.actions.includes("check")
        ? { action: "check" as const, amountTo: null }
        : null;
    if (!action) throw new Error(`Cannot advance from seat ${actor}`);
    tableToAdvance.act(actor, action);
  }
  throw new Error(`Could not reach seat ${seat}`);
}

function requestFor(state: GameStateResponse, requestId: string) {
  return {
    gameId: state.gameId,
    handId: state.handId,
    turnId: state.turnId,
    expectedVersion: state.stateVersion,
    requestId,
    aiEpoch: state.aiEpoch,
  };
}

async function harness(seat: SeatId, queue: QueueEntry[]) {
  const gateway = new QueueGateway(queue);
  const pokerTable = table();
  const service = new GameService(new GameSessionStore(), () => pokerTable, {
    gateway,
    decisionTimeoutMs: 1_000,
  });
  const started = service.start("owner-d");
  const enabled = await service.setMode("owner-d", {
    gameId: started.gameId,
    expectedVersion: started.stateVersion,
    requestId: `enable-${seat}`,
    operation: "enable",
  });
  advanceToSeat(pokerTable, seat);
  const state = service.get("owner-d", started.gameId);
  expect(state.table.actionToSeat).toBe(seat);
  expect(enabled.aiMode).toBe("enabled");
  return { gateway, service, state, pokerTable };
}

function suggestionForLegal(view: BotDecisionView, action: "first" | "second"): AiSuggestion {
  const legal = view.legalActions;
  const has = (name: ActionName) => legal.actions.includes(name);

  if (has("check") && has("bet") && legal.minBetTo !== null) {
    return action === "first"
      ? { action: "check", amountTo: null, usage: usage() }
      : {
          action: "bet",
          amountTo: Math.min(legal.maxTo, legal.minBetTo),
          usage: usage(),
        };
  }
  if (has("check") && has("raise") && legal.minRaiseTo !== null) {
    return action === "first"
      ? { action: "check", amountTo: null, usage: usage() }
      : {
          action: "raise",
          amountTo: Math.min(legal.maxTo, legal.minRaiseTo),
          usage: usage(),
        };
  }
  if (has("call") && has("fold")) {
    return {
      action: action === "first" ? "call" : "fold",
      amountTo: null,
      usage: usage(),
    };
  }
  if (has("call") && has("raise") && legal.minRaiseTo !== null) {
    return action === "first"
      ? { action: "call", amountTo: null, usage: usage() }
      : {
          action: "raise",
          amountTo: Math.min(legal.maxTo, legal.minRaiseTo),
          usage: usage(),
        };
  }
  throw new Error(`No two legal test suggestions for ${legal.actions.join(",")}`);
}

function usage() {
  return { promptTokens: 100, completionTokens: 20, totalTokens: 120 };
}

describe("Stage D model-driven bot decisions", () => {
  for (const seat of [1, 2, 3, 4] as const) {
    it(`A01: seat ${seat} executes two different legal model results and tags deepseek`, async () => {
      const firstHarness = await harness(seat, []);
      // Build the exact views used by the service, then seed legal suggestions.
      const view = firstHarness.pokerTable.botView(seat);
      firstHarness.gateway.queue.length = 0;
      const first = suggestionForLegal(view, "first");
      firstHarness.gateway.queue.push(first);
      const firstResult = await firstHarness.service.botDecision(
        "owner-d",
        requestFor(firstHarness.state, `seat-${seat}-first`),
        "key-d",
      );
      expect(firstResult.source).toBe("deepseek");
      expect(firstResult.action?.action).toBe(first.action);
      expect(firstHarness.gateway.inputs[0]?.style.id).toBe(botStyleForSeat(seat).styleId);
      expect(firstResult.aiStats.requests).toBe(1);
      expect(firstResult.aiStats.successes).toBe(1);
      expect(firstResult.aiStats.deepseekActions).toBe(1);
      expect(firstResult.aiStats.totalTokens).toBe(120);
      expect(firstResult.lastDecision?.source).toBe("deepseek");

      const secondHarness = await harness(seat, []);
      const secondView = secondHarness.pokerTable.botView(seat);
      secondHarness.gateway.queue.length = 0;
      const second = suggestionForLegal(secondView, "second");
      secondHarness.gateway.queue.push(second);
      const secondResult = await secondHarness.service.botDecision(
        "owner-d",
        requestFor(secondHarness.state, `seat-${seat}-second`),
        "key-d",
      );
      expect(secondResult.source).toBe("deepseek");
      expect(secondResult.action?.action).toBe(second.action);
      expect(secondResult.lastDecision?.action).toBe(second.action);
      expect(secondResult.action?.action).not.toBe(first.action);
    });
  }

  it("A01/state: the next bot's input contains the previously executed action", async () => {
    const { gateway, service, state, pokerTable } = await harness(3, [
      { action: "call", amountTo: null, usage: usage() },
      { action: "fold", amountTo: null, usage: usage() },
    ]);
    const first = await service.botDecision(
      "owner-d",
      requestFor(state, "sequential-first"),
      "key-d",
    );
    expect(first.action?.action).toBe("call");
    expect(pokerTable.currentActorSeat).toBe(4);

    const next = service.get("owner-d", state.gameId);
    const second = await service.botDecision(
      "owner-d",
      requestFor(next, "sequential-second"),
      "key-d",
    );
    expect(second.action?.action).toBe("fold");
    expect(second.source).toBe("deepseek");
    expect(gateway.inputs).toHaveLength(2);
    expect(
      gateway.inputs[1]?.currentHandActions.some(
        (action) => action.seat === 3 && action.type === "call",
      ),
    ).toBe(true);
  });

  it("A02: an illegal model action falls back without executing it", async () => {
    const { gateway, service, state } = await harness(3, [
      { action: "check", amountTo: null, usage: usage() },
    ]);
    const result = await service.botDecision(
      "owner-d",
      requestFor(state, "illegal-action"),
      "key-d",
    );
    expect(result.source).toBe("local_fallback");
    expect(gateway.inputs).toHaveLength(1);
    expect(result.aiStats.requests).toBe(1);
    expect(result.aiStats.successes).toBe(0);
    expect(result.aiStats.rejected).toBe(1);
    expect(result.aiStats.localFallbackActions).toBe(1);
    expect(result.lastDecision?.action).not.toBe("check");
    expect(result.pendingDecision).toBeNull();
  });

  it("A02: an out-of-window amount falls back without rewriting the model amount", async () => {
    const { gateway, service, state } = await harness(3, [
      { action: "raise", amountTo: 1, usage: usage() },
    ]);
    const result = await service.botDecision("owner-d", requestFor(state, "bad-amount"), "key-d");
    expect(result.source).toBe("local_fallback");
    expect(gateway.inputs).toHaveLength(1);
    expect(result.lastDecision?.amountTo).not.toBe(1);
    expect(result.aiStats.rejected).toBe(1);
  });

  it("A02: key error falls back locally", async () => {
    const { service, state } = await harness(3, [
      new DeepSeekGatewayError("key_invalid", "bad key"),
    ]);
    const result = await service.botDecision("owner-d", requestFor(state, "key-error"), "key-d");
    expect(result.source).toBe("local_fallback");
    expect(result.aiStats.failures).toBe(1);
    expect(result.aiStats.requests).toBe(1);
  });

  it("A02: a retryable temporary error is retried once and then succeeds", async () => {
    const { gateway, service, state } = await harness(3, [
      new DeepSeekGatewayError("temporary", "temporary", { retryable: true }),
      { action: "call", amountTo: null, usage: usage() },
    ]);
    const result = await service.botDecision("owner-d", requestFor(state, "retry-once"), "key-d");
    expect(result.source).toBe("deepseek");
    expect(gateway.inputs).toHaveLength(2);
    expect(result.aiStats.requests).toBe(2);
    expect(result.aiStats.failures).toBe(1);
    expect(result.aiStats.retries).toBe(1);
    expect(result.aiStats.successes).toBe(1);
  });

  it("A02: a hanging model call times out, releases pending and falls back", async () => {
    const gateway = new QueueGateway([new Promise<AiSuggestion>(() => {})]);
    const pokerTable = table();
    const service = new GameService(new GameSessionStore(), () => pokerTable, {
      gateway,
      decisionTimeoutMs: 15,
    });
    const started = service.start("owner-d");
    const enabled = await service.setMode("owner-d", {
      gameId: started.gameId,
      expectedVersion: started.stateVersion,
      requestId: "enable-timeout",
      operation: "enable",
    });
    advanceToSeat(pokerTable, 3);
    const state = service.get("owner-d", started.gameId);
    expect(enabled.aiMode).toBe("enabled");

    const result = await service.botDecision("owner-d", requestFor(state, "timeout"), "key-d");
    expect(result.source).toBe("local_fallback");
    expect(result.pendingDecision).toBeNull();
    expect(result.aiStats.failures).toBe(1);
    expect(result.aiStats.localFallbackActions).toBe(1);
  });

  it("counts connection tests in the current session without changing action stats", async () => {
    const { service, state } = await harness(3, []);
    const test = await service.testConnection("owner-d", "connection-test", "key-d", state.gameId);
    expect(test.status).toBe("available");
    const after = service.get("owner-d", state.gameId);
    expect(after.aiStats.connectionRequests).toBe(1);
    expect(after.aiStats.connectionSuccesses).toBe(1);
    expect(after.aiStats.connectionFailures).toBe(0);
    expect(after.aiStats.requests).toBe(0);
    expect(after.aiStats.usageUnconfirmed).toBe(1);
  });

  it("usage absent is marked unconfirmed; usage present is accumulated", async () => {
    const { service, state } = await harness(3, [
      { action: "call", amountTo: null },
      { action: "fold", amountTo: null, usage: usage() },
    ]);
    const first = await service.botDecision("owner-d", requestFor(state, "usage-missing"), "key-d");
    expect(first.aiStats.usageUnconfirmed).toBe(1);
    expect(first.aiStats.totalTokens).toBe(0);

    const secondHarness = await harness(1, []);
    const secondView = secondHarness.pokerTable.botView(1);
    secondHarness.gateway.queue.length = 0;
    secondHarness.gateway.queue.push({
      action: secondView.legalActions.actions.includes("call") ? "call" : "fold",
      amountTo: null,
      usage: usage(),
    });
    const second = await secondHarness.service.botDecision(
      "owner-d",
      requestFor(secondHarness.state, "usage-present"),
      "key-d",
    );
    expect(second.aiStats.totalTokens).toBe(120);
    expect(second.aiStats.usageUnconfirmed).toBe(0);
  });

  it("V01: replacing hidden opponent cards and deck leaves the bot input unchanged", () => {
    // The first ten entries are the five two-card hands. Seat 3 keeps 8s/8h
    // in both variants; seats 0/1/2/4 and all later deck entries change.
    const holesA = ["2c", "4c", "6c", "8s", "9d", "3c", "5c", "7c", "8h", "Tc"];
    const holesB = ["2d", "4d", "6d", "8s", "9h", "3d", "5d", "7d", "8h", "Th"];
    const deckA = ["Qc", "Jc", "Ac", "Kc", "7s"];
    const deckB = ["Qd", "Jd", "Ad", "Kd", "7h"];
    const hiddenA = ["2c", "4c", "6c", "9d", "3c", "5c", "7c", "Tc", ...deckA];
    const hiddenB = ["2d", "4d", "6d", "9h", "3d", "5d", "7d", "Th", ...deckB];
    const cardsA = [...holesA, ...deckA];
    const cardsB = [...holesB, ...deckB];
    const tableA = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: cardsA,
    });
    const tableB = makeTestTable({
      stacks: [1000, 1000, 1000, 1000, 1000],
      button: 0,
      firstCards: cardsB,
    });
    const inputA = buildBotDecisionInput(tableA.botView(3), botStyleForSeat(3));
    const inputB = buildBotDecisionInput(tableB.botView(3), botStyleForSeat(3));

    expect(inputA).toEqual(inputB);
    const serialized = JSON.stringify(inputA);
    for (const hidden of [...hiddenA, ...hiddenB, ...deckA, ...deckB]) {
      expect(serialized).not.toContain(`"${hidden}"`);
    }
  });
});
