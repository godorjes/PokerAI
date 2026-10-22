import { ActionType, PlayerStatus, Street, type GameState, type Player } from "@pokertools/engine";
import type { ActionName, LegalActionView } from "@/shared/contracts";

const RAISE_ACTIONS: readonly ActionType[] = [
  ActionType.CHECK,
  ActionType.CALL,
  ActionType.BET,
  ActionType.RAISE,
];

export function currentBetOf(state: GameState): number {
  let currentBet = 0;
  for (const bet of state.currentBets.values()) {
    currentBet = Math.max(currentBet, bet);
  }
  return state.street === Street.PREFLOP ? Math.max(currentBet, state.bigBlind) : currentBet;
}

export function playerBetOf(state: GameState, seat: number): number {
  return state.currentBets.get(seat) ?? 0;
}

export function playerAtSeat(state: GameState, seat: number): Player | null {
  return state.players[seat] ?? null;
}

export function hasActedThisStreet(state: GameState, seat: number): boolean {
  return state.actionHistory.some(
    (record) =>
      record.street === state.street &&
      record.seat === seat &&
      RAISE_ACTIONS.includes(record.action.type),
  );
}

/**
 * Derives the server-side legal action window for the current actor.
 *
 * This intentionally does not clamp amounts. A normal bet/raise is only
 * advertised when the player can afford the full minimum; a smaller all-in
 * wager is represented by the separate all_in action and canOnlyShortAllIn.
 */
export function deriveLegalActions(state: GameState, seat: number): LegalActionView | null {
  const player = playerAtSeat(state, seat);
  if (!player || state.actionTo !== seat || player.status !== PlayerStatus.ACTIVE) {
    return null;
  }

  const currentBet = currentBetOf(state);
  const playerBet = playerBetOf(state, seat);
  const stack = player.stack;
  const maxTo = playerBet + stack;
  const toCall = Math.max(0, currentBet - playerBet);
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && stack > 0;

  const acted = hasActedThisStreet(state, seat);
  const raiseRights = !acted || currentBet - playerBet >= state.lastRaiseAmount;
  const canRaise = currentBet > 0 && raiseRights && maxTo >= state.minRaise;
  const canBet = currentBet === 0 && maxTo >= state.bigBlind;
  const canAllIn =
    stack > 0 && (currentBet === 0 || maxTo <= currentBet || (raiseRights && maxTo > currentBet));

  const actions: ActionName[] = ["fold"];
  if (canCheck) actions.push("check");
  if (canCall) actions.push("call");
  if (canBet) actions.push("bet");
  if (canRaise) actions.push("raise");
  if (canAllIn) actions.push("all_in");

  return {
    actions,
    toCall,
    minBetTo: canBet ? state.bigBlind : null,
    minRaiseTo: canRaise ? state.minRaise : null,
    maxTo,
    canOnlyShortAllIn: maxTo > currentBet && canAllIn && !canBet && !canRaise,
  };
}
