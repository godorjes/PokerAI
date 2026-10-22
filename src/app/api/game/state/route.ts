import { NextResponse } from "next/server";
import { errorResponse, gameService, noStore, requireOwner } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ownerId = requireOwner(request);
    const gameId = new URL(request.url).searchParams.get("gameId");
    if (!gameId) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "gameId is required" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return noStore(NextResponse.json(gameService.get(ownerId, gameId)));
  } catch (error) {
    return errorResponse(error);
  }
}
