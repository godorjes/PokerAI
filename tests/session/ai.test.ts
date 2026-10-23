import { describe, expect, it } from "vitest";
import type { AiConnectionResult, AiGateway, AiSuggestion } from "@/server/ai/gateway";
import { GameService } from "@/server/session/service";
import { GameSessionStore } from "@/server/session/store";
import { ApiError } from "@/server/session/errors";
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

interface DeferredDecision {
  readonly key: string;
  readonly resolve: (value: AiSuggestion) => void;
  readonly reject: (error: Error) => void;
}

class FakeGateway implements AiGateway {
  readonly testKeys: string[] = [];
  readonly decisions: DeferredDecision[] = [];

  async testConnection(key: string): Promise<AiConnectionResult> {
    this.testKeys.push(key);
    return {
      status: key === "bad" ? "key_invalid" : "available",
      message: key === "bad" ? "invalid" : "ok",
      usage: null,
    };
  }

  decide(key: string): Promise<AiSuggestion> {
    return new Promise<AiSuggestion>((resolve, reject) => {
      this.decisions.push({ key, resolve, reject });
    });
  }
}

function factory() {
  return () =>
    makeTestTable({ stacks: [1000, 1000, 1000, 1000, 1000], button: 0, firstCards: CARDS });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function decisionRequest(state: GameStateResponse, requestId: string) {
  return {
    gameId: state.gameId,
    handId: state.handId,
    turnId: state.turnId,
    expectedVersion: state.stateVersion,
    requestId,
    aiEpoch: state.aiEpoch,
  };
}

async function setup() {
  let now = 1_700_000_000_000;
  const gateway = new FakeGateway();
  const service = new GameService(new GameSessionStore(), factory(), {
    gateway,
    now: () => now,
    decisionTimeoutMs: 60_000,
  });
  const started = service.start("owner-a");
  const enabled = await service.setMode("owner-a", {
    gameId: started.gameId,
    expectedVersion: started.stateVersion,
    requestId: "enable-1",
    operation: "enable",
  });
  return { service, gateway, started, enabled, advance: (ms: number) => (now += ms) };
}

describe("Stage C BYOK and decision scheduling", () => {
  it("isolates connection-test keys between anonymous owners", async () => {
    const gateway = new FakeGateway();
    const service = new GameService(new GameSessionStore(), factory(), { gateway });

    expect(await service.testConnection("owner-a", "test-a", "key-a")).toMatchObject({
      status: "available",
    });
    expect(await service.testConnection("owner-b", "test-b", "key-b")).toMatchObject({
      status: "available",
    });
    expect(gateway.testKeys).toEqual(["key-a", "key-b"]);
  });

  it("advances epoch on rotate even with an unchanged state version, and rejects stale disable", async () => {
    const { service, started, enabled } = await setup();
    const epochAfterEnable = enabled.aiEpoch;

    const rotated = await service.setMode("owner-a", {
      gameId: started.gameId,
      expectedVersion: enabled.stateVersion,
      requestId: "rotate-1",
      operation: "rotate",
    });
    expect(rotated.aiMode).toBe("enabled");
    expect(rotated.aiEpoch).toBe(epochAfterEnable + 1);

    let error: unknown;
    try {
      await service.setMode("owner-a", {
        gameId: started.gameId,
        expectedVersion: enabled.stateVersion,
        requestId: "disable-stale",
        operation: "disable",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("STALE_STATE");
    expect(service.get("owner-a", started.gameId).aiEpoch).toBe(rotated.aiEpoch);
  });

  it("K01: two owners' decision requests use only their own keys", async () => {
    const gateway = new FakeGateway();
    const service = new GameService(new GameSessionStore(), factory(), { gateway });
    const a = service.start("owner-a");
    const b = service.start("owner-b");
    const enabledA = await service.setMode("owner-a", {
      gameId: a.gameId,
      expectedVersion: a.stateVersion,
      requestId: "enable-a",
      operation: "enable",
    });
    const enabledB = await service.setMode("owner-b", {
      gameId: b.gameId,
      expectedVersion: b.stateVersion,
      requestId: "enable-b",
      operation: "enable",
    });

    const decisionA = service.botDecision(
      "owner-a",
      decisionRequest(enabledA, "decision-a"),
      "key-a",
    );
    const decisionB = service.botDecision(
      "owner-b",
      decisionRequest(enabledB, "decision-b"),
      "key-b",
    );
    await flush();
    expect(gateway.decisions.map((decision) => decision.key)).toEqual(["key-a", "key-b"]);

    gateway.decisions[0]!.resolve({ action: "call", amountTo: null });
    gateway.decisions[1]!.resolve({ action: "call", amountTo: null });
    const committedA = await decisionA;
    const committedB = await decisionB;
    expect(committedA.source).toBe("deepseek");
    expect(committedB.source).toBe("deepseek");
    expect(JSON.stringify(committedA)).not.toContain("key-a");
    expect(JSON.stringify(committedB)).not.toContain("key-b");
  });

  it("A03: one turn creates one logical decision flow and at most one action", async () => {
    const { service, gateway, enabled } = await setup();
    const first = service.botDecision("owner-a", decisionRequest(enabled, "decision-1"), "key-a");
    await flush();
    expect(gateway.decisions).toHaveLength(1);

    const duplicate = await service.botDecision(
      "owner-a",
      decisionRequest(enabled, "decision-2"),
      "key-a",
    );
    expect(duplicate.status).toBe("pending");
    expect(gateway.decisions).toHaveLength(1);

    gateway.decisions[0]!.resolve({ action: "call", amountTo: null });
    const committed = await first;
    expect(committed.status).toBe("committed");
    expect(committed.source).toBe("deepseek");
    expect(committed.action).toEqual({ action: "call", amountTo: null });
    expect(committed.pendingDecision).toBeNull();
    expect(committed.stateVersion).toBe(enabled.stateVersion + 1);
  });

  it("A04: a late response after rotate cannot commit", async () => {
    const { service, gateway, enabled } = await setup();
    const inFlight = service.botDecision(
      "owner-a",
      decisionRequest(enabled, "decision-before-rotate"),
      "key-a",
    );
    await flush();

    const rotated = await service.setMode("owner-a", {
      gameId: enabled.gameId,
      expectedVersion: enabled.stateVersion,
      requestId: "rotate-in-flight",
      operation: "rotate",
    });
    gateway.decisions[0]!.resolve({ action: "call", amountTo: null });

    let error: unknown;
    try {
      await inFlight;
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("STALE_STATE");
    expect(service.get("owner-a", enabled.gameId).aiEpoch).toBe(rotated.aiEpoch);
    expect(service.get("owner-a", enabled.gameId).table.actions).toHaveLength(0);
  });

  it("A04/K03: disable during an in-flight decision invalidates the old response", async () => {
    const { service, gateway, enabled } = await setup();
    const inFlight = service.botDecision(
      "owner-a",
      decisionRequest(enabled, "decision-in-flight"),
      "key-a",
    );
    await flush();
    expect(gateway.decisions).toHaveLength(1);

    const disabled = await service.setMode("owner-a", {
      gameId: enabled.gameId,
      expectedVersion: enabled.stateVersion,
      requestId: "disable-in-flight",
      operation: "disable",
    });
    expect(disabled.aiMode).toBe("disabled");
    expect(disabled.pendingDecision).toBeNull();

    gateway.decisions[0]!.resolve({ action: "call", amountTo: null });
    let error: unknown;
    try {
      await inFlight;
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("STALE_STATE");
    const after = service.get("owner-a", enabled.gameId);
    expect(after.stateVersion).toBe(disabled.stateVersion);
    expect(after.pendingDecision).toBeNull();
    expect(after.table.actions).toHaveLength(0);
  });

  it("old response cannot release the reservation of a newer decision", async () => {
    const { service, gateway, enabled, advance } = await setup();
    const first = service.botDecision("owner-a", decisionRequest(enabled, "decision-old"), "key-a");
    await flush();
    const oldDecisionId = service.get("owner-a", enabled.gameId).pendingDecision?.decisionId;
    expect(oldDecisionId).toBeTruthy();

    advance(60_001);
    const second = service.botDecision(
      "owner-a",
      decisionRequest(enabled, "decision-new"),
      "key-a",
    );
    await flush();
    expect(gateway.decisions).toHaveLength(2);
    const newPending = service.get("owner-a", enabled.gameId).pendingDecision;
    expect(newPending?.decisionId).toBeTruthy();
    expect(newPending?.decisionId).not.toBe(oldDecisionId);

    gateway.decisions[0]!.resolve({ action: "call", amountTo: null });
    let oldError: unknown;
    try {
      await first;
    } catch (caught) {
      oldError = caught;
    }
    expect(oldError).toBeInstanceOf(ApiError);
    expect(service.get("owner-a", enabled.gameId).pendingDecision?.decisionId).toBe(
      newPending?.decisionId,
    );

    gateway.decisions[1]!.resolve({ action: "call", amountTo: null });
    const committed = await second;
    expect(committed.status).toBe("committed");
    expect(committed.pendingDecision).toBeNull();
  });

  it("falls back locally when the upstream fails", async () => {
    const { service, gateway, enabled } = await setup();
    const inFlight = service.botDecision(
      "owner-a",
      decisionRequest(enabled, "decision-failure"),
      "key-a",
    );
    await flush();
    gateway.decisions[0]!.reject(new Error("network"));

    const committed = await inFlight;
    expect(committed.status).toBe("committed");
    expect(committed.source).toBe("local_fallback");
    expect(committed.pendingDecision).toBeNull();
  });

  it("returns local_no_key when smart mode is disabled or no key is supplied", async () => {
    const service = new GameService(new GameSessionStore(), factory(), {
      gateway: new FakeGateway(),
    });
    const started = service.start("owner-a");
    const result = await service.botDecision(
      "owner-a",
      decisionRequest(started, "local-decision"),
      undefined,
    );
    expect(result.status).toBe("committed");
    expect(result.source).toBe("local_no_key");
  });
});
