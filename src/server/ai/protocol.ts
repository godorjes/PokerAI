import type { ActionName, PlayerId } from "@/shared/contracts";
import type { BotDecisionInput } from "./bot-input";
import {
  DeepSeekGatewayError,
  type AiConfidenceLabel,
  type AiOpponentIntent,
  type AiSuggestion,
} from "./gateway";

const ACTIONS = new Set<ActionName>(["fold", "check", "call", "bet", "raise", "all_in"]);
const CONFIDENCE = new Set<AiConfidenceLabel>(["low", "medium", "high"]);
const MAX_NOTE_LENGTH = 300;
const MAX_INTENTS = 4;

function invalid(message: string): never {
  throw new DeepSeekGatewayError("invalid_response", message);
}

function optionalNote(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${field} must be a non-empty string`);
  }
  if (value.length > MAX_NOTE_LENGTH) invalid(`${field} is too long`);
  return value;
}

function optionalConfidence(value: unknown, field: string): AiConfidenceLabel | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !CONFIDENCE.has(value as AiConfidenceLabel)) {
    invalid(`${field} must be low, medium or high`);
  }
  return value as AiConfidenceLabel;
}

function parseIntents(
  value: unknown,
  input: BotDecisionInput,
): readonly AiOpponentIntent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_INTENTS) {
    invalid("opponentIntents must be an array of at most four entries");
  }

  const allowedTargets = new Set(
    input.players
      .filter((player) => player.playerId !== input.self.playerId)
      .map((player) => player.playerId),
  );
  const usedTargets = new Set<PlayerId>();

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      invalid(`opponentIntents[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const target = record.targetPlayerId;
    if (typeof target !== "string" || !allowedTargets.has(target as PlayerId)) {
      invalid(`opponentIntents[${index}] targets an invalid player`);
    }
    if (usedTargets.has(target as PlayerId)) {
      invalid(`opponentIntents contains a duplicate target`);
    }
    usedTargets.add(target as PlayerId);

    const hypothesis = record.hypothesis;
    if (
      typeof hypothesis !== "string" ||
      hypothesis.trim().length === 0 ||
      hypothesis.length > MAX_NOTE_LENGTH
    ) {
      invalid(`opponentIntents[${index}] has an invalid hypothesis`);
    }
    const confidence = optionalConfidence(
      record.confidenceLabel,
      `opponentIntents[${index}].confidenceLabel`,
    );
    if (confidence === undefined) {
      invalid(`opponentIntents[${index}] is missing confidenceLabel`);
    }
    return {
      targetPlayerId: target as PlayerId,
      hypothesis,
      confidenceLabel: confidence,
    };
  });
}

/**
 * Structural protocol validation. Legal-action and amount-window validation
 * remain a server concern because they depend on the current table state.
 */
export function parseDecisionContent(
  content: string | null | undefined,
  finishReason: string | undefined,
  input: BotDecisionInput,
): AiSuggestion {
  if (finishReason === "length") {
    throw new DeepSeekGatewayError("truncated", "DeepSeek output was truncated");
  }
  if (finishReason === "content_filter" || finishReason === "tool_calls") {
    throw new DeepSeekGatewayError("invalid_response", "DeepSeek did not return text");
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new DeepSeekGatewayError("empty", "DeepSeek returned empty content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    invalid("DeepSeek content is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    invalid("DeepSeek content must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  const action = record.action;
  if (typeof action !== "string" || !ACTIONS.has(action as ActionName)) {
    invalid("DeepSeek returned an invalid action");
  }
  const actionName = action as ActionName;

  const amountTo = record.amountTo;
  if (actionName === "bet" || actionName === "raise") {
    if (typeof amountTo !== "number" || !Number.isSafeInteger(amountTo) || amountTo <= 0) {
      invalid("bet/raise requires a positive integer amountTo");
    }
  } else if (amountTo !== null) {
    invalid(`${actionName} requires amountTo null`);
  }

  const decisionSummary = optionalNote(record.decisionSummary, "decisionSummary");
  const confidenceLabel = optionalConfidence(record.confidenceLabel, "confidenceLabel");
  const opponentIntents = parseIntents(record.opponentIntents, input);

  return {
    action: actionName,
    amountTo: amountTo as number | null,
    ...(decisionSummary !== undefined ? { decisionSummary } : {}),
    ...(confidenceLabel !== undefined ? { confidenceLabel } : {}),
    ...(opponentIntents !== undefined ? { opponentIntents } : {}),
  };
}
