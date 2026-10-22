import { NextResponse } from "next/server";
import { ApiError } from "@/server/session/errors";
import type { ActionName } from "@/shared/contracts";
import type { GameActionRequest } from "@/shared/api";
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

const ACTIONS: readonly ActionName[] = ["fold", "check", "call", "bet", "raise", "all_in"];

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ownerId = requireOwner(request);
    const body = await readJson(request);
    const action = requiredString(body, "action", 20);
    if (!ACTIONS.includes(action as ActionName)) {
      throw new ApiError(400, "INVALID_REQUEST", "Unknown action");
    }
    const amountTo = body.amountTo;
    if (
      amountTo !== null &&
      (typeof amountTo !== "number" || !Number.isSafeInteger(amountTo) || amountTo <= 0)
    ) {
      throw new ApiError(400, "INVALID_REQUEST", "amountTo must be null or a positive integer");
    }

    const input: GameActionRequest = {
      gameId: requiredString(body, "gameId"),
      handId: requiredString(body, "handId"),
      turnId: requiredString(body, "turnId"),
      expectedVersion: requiredVersion(body),
      requestId: requiredString(body, "requestId", 100),
      action: action as ActionName,
      amountTo: amountTo as number | null,
    };
    return noStore(NextResponse.json(gameService.humanAction(ownerId, input)));
  } catch (error) {
    return errorResponse(error);
  }
}
