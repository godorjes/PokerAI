import { randomUUID } from "node:crypto";
import { createPokerTable } from "@/server/engine";
import type { PokerTable } from "@/server/engine";
import { decideLocalAction } from "@/server/bot-strategy/local";
import { HttpDeepSeekGateway } from "@/server/ai/http-gateway";
import type { AiGateway, AiSuggestion } from "@/server/ai/gateway";
import { createStageBTestTableIfEnabled } from "./stage-b-test-table";
import { TableError, type ActionInput, type SeatId } from "@/shared/contracts";
import type {
  AiModeOperation,
  AiModeRequest,
  AiTestResponse,
  BotDecisionRequest,
  BotDecisionResponse,
  GameActionRequest,
  GameStateResponse,
  NextHandRequest,
  TopUpEvent,
} from "@/shared/api";
import { ApiError } from "./errors";
import { GameSessionStore } from "./store";
import type { GameSession, PendingDecision } from "./types";

export type TableFactory = () => PokerTable;

export interface GameServiceOptions {
  readonly gateway?: AiGateway;
  readonly now?: () => number;
  readonly decisionTimeoutMs?: number;
  readonly testTimeoutMs?: number;
}

function isIntegerVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function requestFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

interface PendingReservation {
  readonly kind: "reserved";
  readonly decisionId: string;
  readonly actorSeat: SeatId;
  readonly view: ReturnType<PokerTable["botView"]>;
}

interface ImmediateDecision {
  readonly kind: "immediate";
  readonly response: BotDecisionResponse;
}

type ReserveResult = PendingReservation | ImmediateDecision;

export class GameService {
  readonly store: GameSessionStore;
  private readonly createTable: TableFactory;
  private readonly gateway: AiGateway;
  private readonly now: () => number;
  private readonly decisionTimeoutMs: number;
  private readonly testTimeoutMs: number;

  constructor(
    store = new GameSessionStore(),
    createTable: TableFactory = () => createStageBTestTableIfEnabled() ?? createPokerTable(),
    options: GameServiceOptions = {},
  ) {
    this.store = store;
    this.createTable = createTable;
    this.gateway = options.gateway ?? new HttpDeepSeekGateway();
    this.now = options.now ?? Date.now;
    this.decisionTimeoutMs = options.decisionTimeoutMs ?? 12_000;
    this.testTimeoutMs = options.testTimeoutMs ?? 8_000;
  }

  start(ownerId: string, restart = false): GameStateResponse {
    if (restart) this.store.removeOwner(ownerId);
    const table = this.createTable();
    const session = this.store.create(ownerId, table);
    return this.buildState(session);
  }

  get(ownerId: string, gameId: string): GameStateResponse {
    return this.buildState(this.store.get(ownerId, gameId));
  }

  async testConnection(
    ownerId: string,
    requestId: string,
    key: string | undefined,
  ): Promise<AiTestResponse> {
    // Owner is checked by the route; no session or Key is stored here.
    void ownerId;
    if (!key || key.trim().length === 0) {
      return {
        requestId,
        status: "not_configured",
        message: "未配置 Key",
        usage: null,
      };
    }

    try {
      const result = await this.withTimeout(this.testTimeoutMs, (signal) =>
        this.gateway.testConnection(key, signal),
      );
      return {
        requestId,
        status: result.status,
        message: result.message,
        usage: result.usage,
      };
    } catch {
      return {
        requestId,
        status: "unavailable",
        message: "连接测试暂时不可用",
        usage: null,
      };
    }
  }

  async setMode(ownerId: string, request: AiModeRequest): Promise<GameStateResponse> {
    const session = this.store.get(ownerId, request.gameId);
    const fingerprint = requestFingerprint({ kind: "ai_mode", ...request });

    return session.lock.runExclusive(async () => {
      const cached = this.cached(session, request.requestId, fingerprint);
      if (cached) return cached;
      this.assertVersion(session, request.expectedVersion);
      if (!["enable", "disable", "rotate"].includes(request.operation)) {
        throw new ApiError(400, "INVALID_REQUEST", "Unknown AI mode operation");
      }

      const operation: AiModeOperation = request.operation;
      if (operation === "enable") session.aiMode = "enabled";
      if (operation === "disable") session.aiMode = "disabled";
      // rotate deliberately leaves the mode unchanged but still advances epoch.
      session.aiEpoch += 1;
      session.pendingDecision = null;
      session.stateVersion += 1;

      const response = this.buildState(session);
      this.remember(session, request.requestId, fingerprint, response);
      return response;
    });
  }

  humanAction(ownerId: string, request: GameActionRequest): GameStateResponse {
    const session = this.store.get(ownerId, request.gameId);
    const fingerprint = requestFingerprint({ kind: "human_action", ...request });
    const cached = this.cached(session, request.requestId, fingerprint);
    if (cached) return cached;

    this.assertVersion(session, request.expectedVersion);
    this.assertTurn(session, request.handId, request.turnId);
    if (session.table.currentActorSeat !== 0) {
      throw new ApiError(409, "NOT_YOUR_TURN", "It is not the human player's turn");
    }

    try {
      session.table.act(0, { action: request.action, amountTo: request.amountTo });
    } catch (error) {
      throw this.mapTableError(error);
    }

    session.stateVersion += 1;
    const response = this.buildState(session);
    this.remember(session, request.requestId, fingerprint, response);
    return response;
  }

  async botDecision(
    ownerId: string,
    request: BotDecisionRequest,
    key?: string,
  ): Promise<BotDecisionResponse> {
    const session = this.store.get(ownerId, request.gameId);
    const fingerprint = requestFingerprint({ kind: "bot_decision", ...request });

    const reservation = await session.lock.runExclusive<ReserveResult>(async () => {
      const cached = this.cached(session, request.requestId, fingerprint);
      if (cached) {
        if ("status" in cached) return { kind: "immediate", response: cached };
        throw new ApiError(500, "INTERNAL", "Cached bot decision is missing its status");
      }

      this.assertVersion(session, request.expectedVersion);
      this.assertEpoch(session, request.aiEpoch);
      this.assertTurn(session, request.handId, request.turnId);

      const actor = session.table.currentActorSeat;
      if (actor === null) {
        throw new ApiError(409, "HAND_COMPLETE", "The hand is already complete");
      }
      if (actor === 0) {
        throw new ApiError(409, "NOT_YOUR_TURN", "It is the human player's turn");
      }

      const now = this.now();
      const existing = session.pendingDecision;
      if (existing) {
        if (existing.turnId === session.table.turnId && now < existing.deadlineAt) {
          return { kind: "immediate", response: this.pendingResponse(session) };
        }
        // Expired or from a previous turn. A late response from this decision
        // can only release itself, never a later reservation.
        session.pendingDecision = null;
      }

      const useAi = session.aiMode === "enabled" && Boolean(key?.trim());
      if (!useAi) {
        const action = this.applyLocalAction(session, actor);
        session.stateVersion += 1;
        const response: BotDecisionResponse = {
          ...this.buildState(session),
          status: "committed",
          action,
          source: "local_no_key",
        };
        this.remember(session, request.requestId, fingerprint, response);
        return { kind: "immediate", response };
      }

      const decisionId = randomUUID();
      const pending: PendingDecision = {
        decisionId,
        actorSeat: actor,
        actorId: session.table.publicView(0).players[actor]!.playerId,
        handId: session.table.handId,
        turnId: session.table.turnId,
        expectedVersion: session.stateVersion,
        aiEpoch: session.aiEpoch,
        startedAt: now,
        deadlineAt: now + this.decisionTimeoutMs,
        requestId: request.requestId,
      };
      session.pendingDecision = pending;
      return {
        kind: "reserved",
        decisionId,
        actorSeat: actor,
        view: session.table.botView(actor),
      };
    });

    if (reservation.kind === "immediate") return reservation.response;

    let suggestion: AiSuggestion | null = null;
    let gatewayFailed = false;
    try {
      suggestion = await this.withTimeout(this.decisionTimeoutMs, (signal) =>
        this.gateway.decide(key!, reservation.view, signal),
      );
    } catch {
      gatewayFailed = true;
    }

    return session.lock.runExclusive(async () => {
      const pending = session.pendingDecision;
      if (!pending || pending.decisionId !== reservation.decisionId) {
        throw this.staleDecision(session);
      }

      if (
        session.table.handId !== pending.handId ||
        session.table.turnId !== pending.turnId ||
        session.stateVersion !== pending.expectedVersion ||
        session.aiEpoch !== pending.aiEpoch ||
        session.table.currentActorSeat !== reservation.actorSeat
      ) {
        session.pendingDecision = null;
        throw this.staleDecision(session);
      }

      let action: ActionInput;
      let source: "deepseek" | "local_fallback" = "deepseek";

      if (suggestion && !gatewayFailed) {
        try {
          action = { action: suggestion.action, amountTo: suggestion.amountTo };
          session.table.act(pending.actorSeat, action);
        } catch {
          source = "local_fallback";
          action = this.applyLocalAction(session, pending.actorSeat);
        }
      } else {
        source = "local_fallback";
        action = this.applyLocalAction(session, pending.actorSeat);
      }

      session.pendingDecision = null;
      session.stateVersion += 1;
      const response: BotDecisionResponse = {
        ...this.buildState(session),
        status: "committed",
        action,
        source,
      };
      this.remember(session, request.requestId, fingerprint, response);
      return response;
    });
  }

  nextHand(ownerId: string, request: NextHandRequest): GameStateResponse {
    const session = this.store.get(ownerId, request.gameId);
    const fingerprint = requestFingerprint({ kind: "next_hand", ...request });
    const cached = this.cached(session, request.requestId, fingerprint);
    if (cached) return cached;

    this.assertVersion(session, request.expectedVersion);
    if (!session.table.isSettled) {
      throw new ApiError(409, "HAND_COMPLETE", "The current hand is not settled");
    }

    const humanStack = session.table.publicView(0).players[0]?.stack ?? 0;
    if (humanStack === 0 && request.rebuy !== true) {
      throw new ApiError(409, "REBUY_REQUIRED", "The human player must rebuy to continue");
    }

    const handNumber = session.table.handNumber;
    const topUps: TopUpEvent[] = [];

    for (const seat of [1, 2, 3, 4] as const) {
      const stack = session.table.publicView(0).players[seat]?.stack ?? 0;
      if (stack === 0) {
        session.table.addChips(seat, 1_000);
        topUps.push({
          seat,
          playerId: session.table.publicView(0).players[seat]!.playerId,
          amount: 1_000,
          kind: "auto_bot",
          handNumber,
        });
      }
    }

    if (humanStack === 0) {
      session.table.addChips(0, 1_000);
      topUps.push({
        seat: 0,
        playerId: "human",
        amount: 1_000,
        kind: "human_rebuy",
        handNumber,
      });
    }

    try {
      session.table.startNextHand();
    } catch (error) {
      throw this.mapTableError(error);
    }

    session.pendingDecision = null;
    session.stateVersion += 1;
    session.topUps.push(...topUps);
    if (session.topUps.length > 20) session.topUps.splice(0, session.topUps.length - 20);
    const response = this.buildState(session);
    this.remember(session, request.requestId, fingerprint, response);
    return response;
  }

  private applyLocalAction(session: GameSession, actor: SeatId): ActionInput {
    try {
      const action = decideLocalAction(session.table.botView(actor));
      session.table.act(actor, action);
      return action;
    } catch (error) {
      throw this.mapTableError(error);
    }
  }

  private buildState(session: GameSession): GameStateResponse {
    const table = session.table.publicView(0);
    const human = table.players.find((player) => player.seat === 0);
    const settled = session.table.isSettled;
    return {
      gameId: session.gameId,
      stateVersion: session.stateVersion,
      turnId: session.table.turnId,
      handId: table.handId,
      handNumber: table.handNumber,
      phase: settled ? "settled" : "playing",
      settled,
      humanSeat: 0,
      humanPlayerId: "human",
      aiMode: session.aiMode,
      aiEpoch: session.aiEpoch,
      pendingDecision: this.pendingView(session),
      table,
      canStartNextHand: settled,
      rebuyRequired: settled && (human?.stack ?? 0) === 0,
      topUps: session.topUps.slice(-20),
    };
  }

  private pendingView(session: GameSession): BotDecisionResponse["pendingDecision"] {
    const pending = session.pendingDecision;
    if (!pending) return null;
    return {
      decisionId: pending.decisionId,
      actorId: pending.actorId,
      turnId: pending.turnId,
      deadlineAt: pending.deadlineAt,
    };
  }

  private pendingResponse(session: GameSession): BotDecisionResponse {
    return { ...this.buildState(session), status: "pending" };
  }

  private staleDecision(session: GameSession): ApiError {
    return new ApiError(409, "STALE_STATE", "Decision is no longer current", {
      stateVersion: session.stateVersion,
      turnId: session.table.turnId,
    });
  }

  private async withTimeout<T>(
    timeoutMs: number,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([fn(controller.signal), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private cached(
    session: GameSession,
    requestId: string,
    fingerprint: string,
  ): GameStateResponse | BotDecisionResponse | null {
    const entry = session.requestLedger.get(requestId);
    if (!entry) return null;
    if (entry.fingerprint !== fingerprint) {
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "requestId was already used with a different request body",
      );
    }
    return entry.response;
  }

  private remember(
    session: GameSession,
    requestId: string,
    fingerprint: string,
    response: GameStateResponse | BotDecisionResponse,
  ): void {
    session.requestLedger.set(requestId, { fingerprint, response });
    if (session.requestLedger.size > 100) {
      const oldest = session.requestLedger.keys().next().value;
      if (oldest !== undefined) session.requestLedger.delete(oldest);
    }
  }

  private assertVersion(session: GameSession, expectedVersion: number): void {
    if (!isIntegerVersion(expectedVersion) || session.stateVersion !== expectedVersion) {
      throw new ApiError(409, "STALE_STATE", "The game state has changed", {
        stateVersion: session.stateVersion,
        turnId: session.table.turnId,
      });
    }
  }

  private assertEpoch(session: GameSession, expectedEpoch: number): void {
    if (!isIntegerVersion(expectedEpoch) || session.aiEpoch !== expectedEpoch) {
      throw new ApiError(409, "STALE_STATE", "The AI epoch has changed", {
        stateVersion: session.stateVersion,
        turnId: session.table.turnId,
      });
    }
  }

  private assertTurn(session: GameSession, handId: string, turnId: string): void {
    if (session.table.handId !== handId || session.table.turnId !== turnId) {
      throw new ApiError(409, "STALE_STATE", "The turn has changed", {
        stateVersion: session.stateVersion,
        turnId: session.table.turnId,
      });
    }
  }

  private mapTableError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof TableError) {
      switch (error.code) {
        case "NOT_YOUR_TURN":
          return new ApiError(409, "NOT_YOUR_TURN", error.message);
        case "INVALID_AMOUNT":
          return new ApiError(422, "INVALID_AMOUNT", error.message);
        case "INVALID_ACTION":
          return new ApiError(422, "INVALID_ACTION", error.message);
        case "NO_CHIPS":
          return new ApiError(422, "INVALID_ACTION", error.message);
        case "HAND_COMPLETE":
          return new ApiError(409, "HAND_COMPLETE", error.message);
        default:
          return new ApiError(500, "INTERNAL", error.message);
      }
    }
    return new ApiError(
      500,
      "INTERNAL",
      error instanceof Error ? error.message : "Unexpected server error",
    );
  }
}
