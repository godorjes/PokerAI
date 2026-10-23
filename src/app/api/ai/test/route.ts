import { NextResponse } from "next/server";
import type { AiTestRequest } from "@/shared/api";
import {
  assertSameOrigin,
  deepSeekKeyFrom,
  errorResponse,
  gameService,
  noStore,
  readJson,
  requireOwner,
  requiredString,
} from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ownerId = requireOwner(request);
    const key = deepSeekKeyFrom(request);
    const body = await readJson(request);
    const gameId =
      typeof body.gameId === "string" && body.gameId.length > 0
        ? requiredString(body, "gameId")
        : undefined;
    const input: AiTestRequest = {
      requestId: requiredString(body, "requestId", 100),
      ...(gameId ? { gameId } : {}),
    };
    return noStore(
      NextResponse.json(
        await gameService.testConnection(ownerId, input.requestId, key, input.gameId),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
