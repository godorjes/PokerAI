import { createPokerTable } from "@/server/engine";
import type { PokerTable } from "@/server/engine";
import { decideLocalAction } from "@/server/bot-strategy/local";
import { createStageBTestTableIfEnabled } from "./stage-b-test-table";
import { TableError, type ActionInput } from "@/shared/contracts";
import type {
  BotDecisionRequest,
  BotDecisionResponse,
  GameActionRequest,
  GameStateResponse,
  NextHandRequest,
  TopUpEvent,
} from "@/shared/api";
import { ApiError } from "./errors";
import { GameSessionStore } from "./store";
import type { GameSession } from "./types";

export type TableFactory = () => PokerTable;

function isIntegerVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function requestFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

export class GameService {
  readonly store: GameSessionStore;
  private readonly createTable: TableFactory;

  constructor(
    store = new GameSessionStore(),
    createTable: TableFactory = () => createStageBTestTableIfEnabled() ?? createPokerTable(),
  ) {
    this.store = store;
    this.createTable = createTable;
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

  botDecision(ownerId: string, request: BotDecisionRequest): BotDecisionResponse {
    const session = this.store.get(ownerId, request.gameId);
    const fingerprint = requestFingerprint({ kind: "bot_decision", ...request });
    const cached = this.cached(session, request.requestId, fingerprint);
    if (cached) {
      if ("action" in cached) return cached;
      throw new ApiError(500, "INTERNAL", "Cached bot decision is missing its action");
    }

    this.assertVersion(session, request.expectedVersion);
    this.assertTurn(session, request.handId, request.turnId);
    const actor = session.table.currentActorSeat;
    if (actor === null) {
      throw new ApiError(409, "HAND_COMPLETE", "The hand is already complete");
    }
    if (actor === 0) {
      throw new ApiError(409, "NOT_YOUR_TURN", "It is the human player's turn");
    }

    let action: ActionInput;
    try {
      action = decideLocalAction(session.table.botView(actor));
      session.table.act(actor, action);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw this.mapTableError(error);
    }

    session.stateVersion += 1;
    const state = this.buildState(session);
    const response: BotDecisionResponse = { ...state, action, source: "local_no_key" };
    this.remember(session, request.requestId, fingerprint, response);
    return response;
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

    session.stateVersion += 1;
    session.topUps.push(...topUps);
    if (session.topUps.length > 20) session.topUps.splice(0, session.topUps.length - 20);
    const response = this.buildState(session);
    this.remember(session, request.requestId, fingerprint, response);
    return response;
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
      aiMode: "disabled",
      table,
      canStartNextHand: settled,
      rebuyRequired: settled && (human?.stack ?? 0) === 0,
      topUps: session.topUps.slice(-20),
    };
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
