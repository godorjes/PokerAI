import { describe, expect, it } from "vitest";
import { capturePublicActionSnapshot } from "@/server/insight/capture";
import { buildPublicInsight } from "@/server/insight/template";
import { GameService } from "@/server/session/service";
import { GameSessionStore } from "@/server/session/store";
import { ApiError } from "@/server/session/errors";
import type { ActionEvent, PublicTableView } from "@/shared/contracts";
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

function table() {
  return makeTestTable({
    stacks: [1000, 1000, 1000, 1000, 1000],
    button: 0,
    firstCards: CARDS,
  });
}

function eventFor(view: PublicTableView): ActionEvent {
  return {
    eventId: `${view.handId}:history:1`,
    handId: view.handId,
    turnId: `${view.handId}:1`,
    playerId: "ai-3",
    seat: 3,
    street: "preflop",
    action: "raise",
    amountTo: 30,
    chipsMoved: 30,
    potAfter: 45,
    stackAfter: 970,
    createdAt: 1_700_000_000_000,
  };
}

describe("Stage E public action insight", () => {
  it("V02: changing private hole cards/summary does not change the public snapshot or template", () => {
    const pokerTable = table();
    const base = pokerTable.publicView(null);
    const withPrivateA: PublicTableView = {
      ...base,
      players: base.players.map((player) =>
        player.seat === 3 ? { ...player, cards: ["Ah", "Ad"] } : player,
      ),
    };
    const withPrivateB = {
      ...base,
      players: base.players.map((player) =>
        player.seat === 3 ? { ...player, cards: ["2d", "3h"] } : player,
      ),
      decisionSummary: "private model summary A",
    } as PublicTableView & { decisionSummary: string };

    const event = eventFor(base);
    const snapshotA = capturePublicActionSnapshot(withPrivateA, event);
    const snapshotB = capturePublicActionSnapshot(withPrivateB, event);

    expect(snapshotA).toEqual(snapshotB);
    expect(buildPublicInsight(snapshotA)).toEqual(buildPublicInsight(snapshotB));
    const serialized = JSON.stringify(snapshotA);
    expect(serialized).not.toContain("Ah");
    expect(serialized).not.toContain("Ad");
    expect(serialized).not.toContain("private model summary");
    expect(buildPublicInsight(snapshotA).text).not.toContain("诈唬");
  });

  it("V03: a bot action never exposes hidden bot cards or a private summary", async () => {
    const service = new GameService(new GameSessionStore(), table);
    const started = service.start("owner-e");
    const result = await service.botDecision(
      "owner-e",
      {
        gameId: started.gameId,
        handId: started.handId,
        turnId: started.turnId,
        expectedVersion: started.stateVersion,
        requestId: "v03-decision",
        aiEpoch: started.aiEpoch,
      },
      undefined,
    );
    const wire = JSON.stringify(result);
    expect(wire).not.toContain('"8s"');
    expect(wire).not.toContain('"8h"');
    expect(wire).not.toContain('"deck"');
    expect(wire).not.toContain("decisionSummary");
    expect(wire).not.toContain("opponentIntents");
  });

  it("binds the insight to the submitted public actionEventId and keeps it private-safe", async () => {
    const gateway = {
      async testConnection() {
        return { status: "available" as const, message: "ok", usage: null };
      },
      async decide() {
        return { action: "call" as const, amountTo: null, usage: null };
      },
    };
    const service = new GameService(new GameSessionStore(), table, { gateway });
    const started = service.start("owner-e");
    const result = await service.botDecision(
      "owner-e",
      {
        gameId: started.gameId,
        handId: started.handId,
        turnId: started.turnId,
        expectedVersion: started.stateVersion,
        requestId: "insight-decision",
        aiEpoch: started.aiEpoch,
      },
      undefined,
    );
    const action = result.table.actions.at(-1);
    expect(action).toBeTruthy();
    const insight = service.getInsight("owner-e", started.gameId, started.handId, action!.eventId);
    expect(insight.actionEventId).toBe(action!.eventId);
    expect(insight.handId).toBe(started.handId);
    expect(insight.generatedBy).toBe("template");
    expect(insight.text).toContain("公开信息不足以确定");
  });

  it("rejects a foreign owner and an unbound action", () => {
    const service = new GameService(new GameSessionStore(), table, {
      gateway: {
        async testConnection() {
          return { status: "available" as const, message: "ok", usage: null };
        },
        async decide() {
          return { action: "call" as const, amountTo: null, usage: null };
        },
      },
    });
    const started = service.start("owner-e");

    let foreign: unknown;
    try {
      service.getInsight("owner-other", started.gameId, started.handId, "event-x");
    } catch (error) {
      foreign = error;
    }
    expect(foreign).toBeInstanceOf(ApiError);
    expect((foreign as ApiError).status).toBe(404);

    expect(() => service.getInsight("owner-e", started.gameId, started.handId, "missing")).toThrow(
      ApiError,
    );
  });
});
