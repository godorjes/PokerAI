import { evaluateStrings } from "@pokertools/evaluator";
import type { ActionInput, BotDecisionView, LegalActionView } from "@/shared/contracts";
import { botStyleForSeat, type BotSeat, type BotStyleId } from "./styles";

const RANK_VALUE: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function preflopStrength(hole: readonly string[]): number {
  if (hole.length < 2) return 0;
  const first = hole[0]!;
  const second = hole[1]!;
  const high = Math.max(RANK_VALUE[first[0]!] ?? 0, RANK_VALUE[second[0]!] ?? 0);
  const low = Math.min(RANK_VALUE[first[0]!] ?? 0, RANK_VALUE[second[0]!] ?? 0);
  const pair = first[0] === second[0];
  const suited = first[1] === second[1];
  const gap = Math.abs(high - low);

  let score = ((high + low) / 28) * 0.42;
  if (pair) score += 0.34;
  if (suited) score += 0.07;
  if (gap <= 1 && !pair) score += 0.05;
  if (high >= 11 && low >= 9) score += 0.07;
  return clamp(score, 0, 1);
}

function postflopStrength(hole: readonly string[], board: readonly string[]): number {
  if (board.length < 3 || hole.length < 2) return 0;
  try {
    const score = evaluateStrings([...hole, ...board]);
    // Lower evaluator score is stronger; the known range is 1..7462.
    return clamp(1 - (score - 1) / 7461, 0, 1);
  } catch {
    return 0;
  }
}

function strengthOf(view: BotDecisionView, style: BotStyleId): number {
  const own = view.players[view.selfSeat];
  const hole = (own?.cards ?? []).filter((card): card is string => card !== null);
  const base = view.board.length >= 3 ? postflopStrength(hole, view.board) : preflopStrength(hole);
  const aggression = view.actions.filter(
    (action) => action.type === "bet" || action.type === "raise",
  ).length;

  switch (style) {
    case "tight":
      return clamp(base - 0.04, 0, 1);
    case "loose":
      return clamp(base + 0.05, 0, 1);
    case "adaptive":
      return clamp(base + Math.min(0.1, aggression * 0.015), 0, 1);
    case "balanced":
    default:
      return base;
  }
}

function chooseAmount(
  legal: LegalActionView,
  action: "bet" | "raise",
  style: BotStyleId,
  pot: number,
): ActionInput | null {
  const min = action === "bet" ? legal.minBetTo : legal.minRaiseTo;
  if (min === null) return null;
  const fraction = style === "loose" ? 0.75 : style === "tight" ? 0.4 : 0.55;
  const target = Math.min(legal.maxTo, Math.max(min, Math.round((min + pot * fraction) / 5) * 5));
  if (!Number.isSafeInteger(target) || target < min || target > legal.maxTo) return null;
  return { action, amountTo: target };
}

/**
 * Deterministic, legal, no-key bot policy for Stage B.
 *
 * It is intentionally simple: four styles differentiate thresholds and sizing,
 * but every decision goes through the same legal-action window as the human.
 * There is no random action and no hidden cross-hand learning.
 */
export function decideLocalAction(view: BotDecisionView): ActionInput {
  if (view.selfSeat === 0) {
    throw new Error("decideLocalAction is only for bot seats");
  }
  const style = botStyleForSeat(view.selfSeat).styleId;
  const legal = view.legalActions;
  const actions = new Set(legal.actions);
  const strength = strengthOf(view, style);

  const thresholds =
    style === "tight"
      ? { call: 0.46, raise: 0.74, shove: 0.9 }
      : style === "loose"
        ? { call: 0.28, raise: 0.56, shove: 0.78 }
        : { call: 0.36, raise: 0.66, shove: 0.84 };

  const toCall = legal.toCall;
  const pot = Math.max(1, view.potTotal);
  const callPressure = toCall / (pot + toCall);
  const need = thresholds.call + callPressure * 0.18;

  if (actions.has("check")) {
    if (strength >= thresholds.raise && actions.has("bet")) {
      return chooseAmount(legal, "bet", style, pot) ?? { action: "check", amountTo: null };
    }
    return { action: "check", amountTo: null };
  }

  if (actions.has("raise") && strength >= Math.max(thresholds.raise, need)) {
    return chooseAmount(legal, "raise", style, pot) ?? { action: "call", amountTo: null };
  }

  if (actions.has("call") && strength >= need) {
    return { action: "call", amountTo: null };
  }

  if (actions.has("all_in") && strength >= thresholds.shove) {
    return { action: "all_in", amountTo: null };
  }

  // With a short stack, an all-in call is still better than folding a hand
  // that clears a reduced threshold; otherwise take the free/cheap option.
  if (actions.has("all_in") && strength >= Math.max(0.55, need) && toCall > 0) {
    return { action: "all_in", amountTo: null };
  }

  if (actions.has("fold")) {
    return { action: "fold", amountTo: null };
  }
  if (actions.has("check")) {
    return { action: "check", amountTo: null };
  }
  if (actions.has("call")) {
    return { action: "call", amountTo: null };
  }
  throw new Error(`No legal fallback action for seat ${view.selfSeat}`);
}

export function botStyle(seat: BotSeat): BotStyleId {
  return botStyleForSeat(seat).styleId;
}
