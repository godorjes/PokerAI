import { NextResponse } from "next/server";
import type { NextHandRequest } from "@/shared/api";
import {
  assertSameOrigin,
  errorResponse,
  gameService,
  noStore,
  optionalBoolean,
  readJson,
  requireOwner,
  requiredString,
  requiredVersion,
} from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ownerId = requireOwner(request);
    const body = await readJson(request);
    const input: NextHandRequest = {
      gameId: requiredString(body, "gameId"),
      expectedVersion: requiredVersion(body),
      requestId: requiredString(body, "requestId", 100),
      rebuy: optionalBoolean(body, "rebuy"),
    };
    return noStore(NextResponse.json(gameService.nextHand(ownerId, input)));
  } catch (error) {
    return errorResponse(error);
  }
}
