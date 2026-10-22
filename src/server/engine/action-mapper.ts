import { ActionType, type Action, type GameState } from "@pokertools/engine";
import { TableError, type ActionInput, type ActionName } from "@/shared/contracts";
import { currentBetOf, deriveLegalActions, playerAtSeat, playerBetOf } from "./legal-actions";

function requireAmount(action: ActionName, amountTo: number | null): number {
  if (amountTo === null || !Number.isSafeInteger(amountTo) || amountTo <= 0) {
    throw new TableError("INVALID_AMOUNT", `${action} requires a positive safe-integer amountTo`);
  }
  return amountTo;
}

function requireNoAmount(action: ActionName, amountTo: number | null): void {
  if (amountTo !== null) {
    throw new TableError("INVALID_AMOUNT", `${action} must use amountTo=null`);
  }
}

/**
 * Maps the public action contract onto the engine's action shape.
 *
 * No amount is clamped. The caller gets a stable domain error instead, which
 * is essential for model-output validation and for the action UI.
 */
export function toEngineAction(state: GameState, seat: number, input: ActionInput): Action {
  const player = playerAtSeat(state, seat);
  if (!player) {
    throw new TableError("NOT_YOUR_TURN", `No player in seat ${seat}`);
  }

  const legal = deriveLegalActions(state, seat);
  if (!legal) {
    throw new TableError("NOT_YOUR_TURN", `It is not seat ${seat}'s turn`);
  }
  if (!legal.actions.includes(input.action)) {
    throw new TableError(
      "INVALID_ACTION",
      `${input.action} is not legal for ${player.id} in this state`,
    );
  }

  const currentBet = currentBetOf(state);
  const playerBet = playerBetOf(state, seat);

  switch (input.action) {
    case "fold":
      requireNoAmount(input.action, input.amountTo);
      return { type: ActionType.FOLD, playerId: player.id };

    case "check":
      requireNoAmount(input.action, input.amountTo);
      return { type: ActionType.CHECK, playerId: player.id };

    case "call":
      requireNoAmount(input.action, input.amountTo);
      return { type: ActionType.CALL, playerId: player.id };

    case "bet": {
      const amountTo = requireAmount(input.action, input.amountTo);
      if (legal.minBetTo === null || amountTo < legal.minBetTo) {
        throw new TableError(
          "INVALID_AMOUNT",
          `bet amountTo ${amountTo} is below the minimum ${legal.minBetTo}`,
        );
      }
      if (amountTo > legal.maxTo) {
        throw new TableError(
          "INVALID_AMOUNT",
          `bet amountTo ${amountTo} exceeds maxTo ${legal.maxTo}`,
        );
      }
      return { type: ActionType.BET, playerId: player.id, amount: amountTo };
    }

    case "raise": {
      const amountTo = requireAmount(input.action, input.amountTo);
      if (legal.minRaiseTo === null || amountTo < legal.minRaiseTo) {
        throw new TableError(
          "INVALID_AMOUNT",
          `raise amountTo ${amountTo} is below the minimum ${legal.minRaiseTo}`,
        );
      }
      if (amountTo > legal.maxTo) {
        throw new TableError(
          "INVALID_AMOUNT",
          `raise amountTo ${amountTo} exceeds maxTo ${legal.maxTo}`,
        );
      }
      return { type: ActionType.RAISE, playerId: player.id, amount: amountTo };
    }

    case "all_in": {
      requireNoAmount(input.action, input.amountTo);
      const target = playerBet + player.stack;
      if (target <= 0) {
        throw new TableError("NO_CHIPS", `${player.id} has no chips`);
      }
      if (currentBet === 0) {
        // Opening all-in wager: the engine models this as a BET.
        return { type: ActionType.BET, playerId: player.id, amount: target };
      }
      if (target > currentBet) {
        return { type: ActionType.RAISE, playerId: player.id, amount: target };
      }
      return { type: ActionType.CALL, playerId: player.id };
    }
  }
}
