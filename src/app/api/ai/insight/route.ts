import { NextResponse } from "next/server";
import { errorResponse, gameService, noStore, requireOwner } from "../../_lib/http";
import { ApiError } from "@/server/session/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function queryValue(request: Request, name: string, maxLength = 200): string {
  const value = new URL(request.url).searchParams.get(name);
  if (!value || value.length > maxLength) {
    throw new ApiError(400, "INVALID_REQUEST", `${name} is required`);
  }
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ownerId = requireOwner(request);
    const gameId = queryValue(request, "gameId");
    const handId = queryValue(request, "handId");
    const actionEventId = queryValue(request, "actionEventId", 300);
    return noStore(
      NextResponse.json(gameService.getInsight(ownerId, gameId, handId, actionEventId)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
