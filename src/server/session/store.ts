import { randomUUID } from "node:crypto";
import type { PokerTable } from "@/server/engine";
import { ApiError } from "./errors";
import { AsyncMutex } from "./mutex";
import { createEmptyAiStats, type GameSession } from "./types";

export interface GameStoreOptions {
  readonly ttlMs?: number;
  readonly maxSessions?: number;
  readonly now?: () => number;
}

export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1_000;

/**
 * Single-process, in-memory store. Restarting the process loses every game;
 * that is a deliberate Stage B deployment boundary, not a persistence promise.
 */
export class GameSessionStore {
  private readonly sessions = new Map<string, GameSession>();
  private readonly ownerGames = new Map<string, Set<string>>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;

  constructor(options: GameStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.maxSessions = options.maxSessions ?? 100;
    this.now = options.now ?? Date.now;
  }

  create(ownerId: string, table: PokerTable): GameSession {
    this.cleanup();
    if (this.sessions.size >= this.maxSessions) {
      const oldest = [...this.sessions.values()].sort(
        (left, right) => left.lastSeenAt - right.lastSeenAt,
      )[0];
      if (oldest) this.delete(oldest.gameId);
    }

    const now = this.now();
    const session: GameSession = {
      gameId: randomUUID(),
      ownerId,
      table,
      lock: new AsyncMutex(),
      stateVersion: 1,
      aiMode: "disabled",
      aiEpoch: 1,
      aiStats: createEmptyAiStats(),
      lastDecision: null,
      pendingDecision: null,
      createdAt: now,
      lastSeenAt: now,
      requestLedger: new Map(),
      publicActionSnapshots: new Map(),
      topUps: [],
    };
    this.sessions.set(session.gameId, session);
    const owned = this.ownerGames.get(ownerId) ?? new Set<string>();
    owned.add(session.gameId);
    this.ownerGames.set(ownerId, owned);
    return session;
  }

  get(ownerId: string, gameId: string): GameSession {
    const session = this.sessions.get(gameId);
    if (!session || session.ownerId !== ownerId) {
      // Do not reveal whether another owner's game exists.
      throw new ApiError(404, "SESSION_NOT_FOUND", "Game session not found");
    }
    const now = this.now();
    if (now - session.lastSeenAt > this.ttlMs) {
      this.delete(gameId);
      throw new ApiError(410, "SESSION_EXPIRED", "Game session expired");
    }
    this.cleanup();
    session.lastSeenAt = now;
    return session;
  }

  removeOwner(ownerId: string): void {
    const owned = this.ownerGames.get(ownerId);
    if (!owned) return;
    for (const gameId of owned) this.sessions.delete(gameId);
    this.ownerGames.delete(ownerId);
  }

  delete(gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return;
    this.sessions.delete(gameId);
    const owned = this.ownerGames.get(session.ownerId);
    owned?.delete(gameId);
    if (owned && owned.size === 0) this.ownerGames.delete(session.ownerId);
  }

  cleanup(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [gameId, session] of this.sessions) {
      if (session.lastSeenAt < cutoff) this.delete(gameId);
    }
  }

  get size(): number {
    this.cleanup();
    return this.sessions.size;
  }
}
