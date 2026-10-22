import type { GameStateResponse } from "@/shared/api";

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "STALE_STATE"
  | "NOT_YOUR_TURN"
  | "INVALID_ACTION"
  | "INVALID_AMOUNT"
  | "HAND_COMPLETE"
  | "REBUY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly latest: Pick<GameStateResponse, "stateVersion" | "turnId"> | undefined;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    latest?: Pick<GameStateResponse, "stateVersion" | "turnId">,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.latest = latest;
  }
}
