import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GameService } from "@/server/session/service";
import { ApiError } from "@/server/session/errors";
import { DEEPSEEK_KEY_HEADER } from "@/shared/api";

export const OWNER_COOKIE = "poker_owner";
// The identity cookie may outlive an idle game session. The server-side
// session still expires after its own 30-minute idle TTL; an old cookie only
// points at a missing/expired game.
export const OWNER_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

type GlobalWithGame = typeof globalThis & {
  __pokerGameService?: GameService;
};

const globalWithGame = globalThis as GlobalWithGame;

// A single process-wide store is intentional for Stage B. Restarting the
// process loses sessions; deployment must remain one instance/one process.
export const gameService = (globalWithGame.__pokerGameService ??= new GameService());

export function newOwnerId(): string {
  return randomBytes(32).toString("base64url");
}

export function ownerIdFrom(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === OWNER_COOKIE) {
      const value = rest.join("=");
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export function setOwnerCookie(response: NextResponse, ownerId: string): void {
  response.cookies.set({
    name: OWNER_COOKIE,
    value: ownerId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OWNER_COOKIE_MAX_AGE,
  });
}

export function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function requireOwner(request: Request): string {
  const owner = ownerIdFrom(request);
  if (!owner) {
    throw new ApiError(401, "FORBIDDEN", "Missing anonymous owner cookie");
  }
  return owner;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ApiError(403, "FORBIDDEN", "Invalid Origin header");
    }
    if (!host || originHost !== host) {
      throw new ApiError(403, "FORBIDDEN", "Cross-origin request rejected");
    }
  }
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") {
    throw new ApiError(403, "FORBIDDEN", "Cross-site request rejected");
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_REQUEST", "Request body must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_REQUEST", "Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  body: Record<string, unknown>,
  key: string,
  maxLength = 200,
): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a non-empty string`);
  }
  return value;
}

export function requiredVersion(body: Record<string, unknown>): number {
  const value = body.expectedVersion;
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ApiError(400, "INVALID_REQUEST", "expectedVersion must be a positive integer");
  }
  return value as number;
}

export function requiredPositiveInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a positive integer`);
  }
  return value as number;
}

export function deepSeekKeyFrom(request: Request): string | undefined {
  const key = request.headers.get(DEEPSEEK_KEY_HEADER);
  if (key === null) return undefined;
  if (key.length > 512) {
    throw new ApiError(400, "INVALID_REQUEST", "API key header is too long");
  }
  return key;
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a boolean`);
  }
  return value;
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return noStore(
      NextResponse.json(
        {
          error: { code: error.code, message: error.message },
          ...(error.latest ? { latest: error.latest } : {}),
        },
        { status: error.status },
      ),
    );
  }
  return noStore(
    NextResponse.json(
      { error: { code: "INTERNAL", message: "Unexpected server error" } },
      { status: 500 },
    ),
  );
}
