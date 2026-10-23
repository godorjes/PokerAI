import type { BotDecisionInput } from "./bot-input";

export interface PromptMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export function buildDecisionMessages(input: BotDecisionInput): PromptMessage[] {
  const system = [
    `You are ${input.style.name}, a no-limit Texas Hold'em opponent in a five-seat game.`,
    `Style guidance: ${input.style.guidance}`,
    "",
    "You are choosing exactly one action for the acting player described in the user JSON.",
    "Only use the supplied legalActions and their amount bounds. The server will reject illegal suggestions.",
    "amountTo is the total chips committed on this street, not an increment. It must be an integer.",
    "amountTo must be null for fold, check, call and all_in.",
    "For bet or raise, amountTo must be within the supplied minimum and maximum.",
    "Do not choose another player's action. Do not assume any hidden cards or remaining deck.",
    "",
    "Return exactly one JSON object with this structure:",
    '{"action":"fold|check|call|bet|raise|all_in","amountTo":null|integer,"decisionSummary":"short private note","confidenceLabel":"low|medium|high","opponentIntents":[{"targetPlayerId":"player id","hypothesis":"short note","confidenceLabel":"low|medium|high"}]}',
    "decisionSummary and confidenceLabel are optional but must be valid when present.",
    "opponentIntents is optional. If present it may only target another player in the supplied players list.",
    "No markdown, no prose outside the JSON object.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(input) },
  ];
}
