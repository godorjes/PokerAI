import { NextResponse } from "next/server";
import type { AiModeOperation, AiModeRequest } from "@/shared/api";
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

const OPERATIONS: readonly AiModeOperation[] = ["enable", "disable", "rotate"];

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ownerId = requireOwner(request);
    const body = await readJson(request);
    const operation = requiredString(body, "operation", 20);
    if (!OPERATIONS.includes(operation as AiModeOperation)) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Unknown mode operation" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const input: AiModeRequest = {
      gameId: requiredString(body, "gameId"),
      expectedVersion: requiredVersion(body),
      requestId: requiredString(body, "requestId", 100),
      operation: operation as AiModeOperation,
    };
    return noStore(NextResponse.json(await gameService.setMode(ownerId, input)));
  } catch (error) {
    return errorResponse(error);
  }
}
