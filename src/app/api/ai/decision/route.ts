import { NextResponse } from "next/server";
import type { BotDecisionRequest } from "@/shared/api";
import {
  assertSameOrigin,
  errorResponse,
  gameService,
  noStore,
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
    const input: BotDecisionRequest = {
      gameId: requiredString(body, "gameId"),
      handId: requiredString(body, "handId"),
      turnId: requiredString(body, "turnId"),
      expectedVersion: requiredVersion(body),
      requestId: requiredString(body, "requestId", 100),
    };
    return noStore(NextResponse.json(gameService.botDecision(ownerId, input)));
  } catch (error) {
    return errorResponse(error);
  }
}
