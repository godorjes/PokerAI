import { NextResponse } from "next/server";
import type { BotDecisionRequest, BotDecisionResponse } from "@/shared/api";
import {
  assertSameOrigin,
  deepSeekKeyFrom,
  errorResponse,
  gameService,
  noStore,
  readJson,
  requireOwner,
  requiredPositiveInteger,
  requiredString,
  requiredVersion,
} from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ownerId = requireOwner(request);
    const key = deepSeekKeyFrom(request);
    const body = await readJson(request);
    const input: BotDecisionRequest = {
      gameId: requiredString(body, "gameId"),
      handId: requiredString(body, "handId"),
      turnId: requiredString(body, "turnId"),
      expectedVersion: requiredVersion(body),
      requestId: requiredString(body, "requestId", 100),
      aiEpoch: requiredPositiveInteger(body, "aiEpoch"),
    };
    const result: BotDecisionResponse = await gameService.botDecision(ownerId, input, key);
    const response = noStore(
      NextResponse.json(result, { status: result.status === "pending" ? 202 : 200 }),
    );
    response.headers.set("X-Decision-Status", result.status);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
