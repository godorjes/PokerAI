import { BOT_STYLES } from "@/server/bot-strategy/styles";
import type { ActionEvent, PublicTableView } from "@/shared/contracts";
import type { PublicActionSnapshot } from "./types";

/**
 * Copy only public, action-time fields. Opponent/self cards are deliberately
 * not read from the source view, so replacing hidden cards or a private model
 * summary cannot change the insight input.
 */
export function capturePublicActionSnapshot(
  beforeView: PublicTableView,
  event: ActionEvent,
): PublicActionSnapshot {
  const playerName =
    event.seat === 0 ? "你" : (BOT_STYLES[event.seat as 1 | 2 | 3 | 4]?.name ?? event.playerId);

  return {
    actionEventId: event.eventId,
    handId: event.handId,
    seat: event.seat,
    playerId: event.playerId,
    playerName,
    action: event.action,
    amountTo: event.amountTo,
    amount: event.chipsMoved,
    street: event.street,
    potBefore: beforeView.potTotal,
    potAfter: event.potAfter,
    stackAfter: event.stackAfter,
    boardBefore: [...beforeView.board],
    buttonSeat: beforeView.buttonSeat,
    bigBlindSeat: beforeView.bigBlindSeat,
  };
}
