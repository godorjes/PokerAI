import type { ActionInput } from "@/shared/contracts";
import type { BotDecisionInput } from "./bot-input";
import type { AiSuggestion } from "./gateway";

export type SuggestionRejectionCode = "illegal_action" | "invalid_amount";

export class SuggestionRejected extends Error {
  readonly code: SuggestionRejectionCode;

  constructor(code: SuggestionRejectionCode, message: string) {
    super(message);
    this.name = "SuggestionRejected";
    this.code = code;
  }
}

/**
 * Validate a structurally valid model suggestion against the exact turn's
 * legal-action window. The amount is never rewritten; an invalid suggestion is
 * rejected and the caller must use the local fallback.
 */
export function validateSuggestionAgainstInput(
  input: BotDecisionInput,
  suggestion: AiSuggestion,
): ActionInput {
  const legal = input.legalActions;
  if (!legal.actions.includes(suggestion.action)) {
    throw new SuggestionRejected(
      "illegal_action",
      `${suggestion.action} is not legal for this turn`,
    );
  }

  if (suggestion.action === "bet" || suggestion.action === "raise") {
    const amount = suggestion.amountTo;
    const min = suggestion.action === "bet" ? legal.minBetTo : legal.minRaiseTo;
    if (min === null) {
      throw new SuggestionRejected("invalid_amount", `${suggestion.action} has no legal minimum`);
    }
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < min ||
      amount > legal.maxTo
    ) {
      throw new SuggestionRejected(
        "invalid_amount",
        `${suggestion.action} amount is outside ${min}..${legal.maxTo}`,
      );
    }
    return { action: suggestion.action, amountTo: amount };
  }

  if (suggestion.amountTo !== null) {
    throw new SuggestionRejected("invalid_amount", `${suggestion.action} must not carry amountTo`);
  }
  return { action: suggestion.action, amountTo: null };
}
