import { NextResponse } from "next/server";
import type { StartGameRequest } from "@/shared/api";
import {
  assertSameOrigin,
  errorResponse,
  gameService,
  newOwnerId,
  noStore,
  ownerIdFrom,
  readJson,
  setOwnerCookie,
} from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    let body: StartGameRequest = {};
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 0) {
      body = (await readJson(request)) as unknown as StartGameRequest;
    }

    let ownerId = ownerIdFrom(request);
    let issued = false;
    if (!ownerId) {
      ownerId = newOwnerId();
      issued = true;
    }

    const state = gameService.start(ownerId, body.restart === true);
    const response = noStore(NextResponse.json(state, { status: 200 }));
    if (issued) setOwnerCookie(response, ownerId);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
