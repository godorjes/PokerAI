import type { AiConnectionStatus } from "@/shared/api";
import type { BotDecisionInput } from "./bot-input";
import {
  DeepSeekGatewayError,
  type AiConnectionResult,
  type AiGateway,
  type AiSuggestion,
  type AiUsage,
} from "./gateway";
import { buildDecisionMessages } from "./prompt";
import { parseDecisionContent } from "./protocol";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-flash";
export const DEEPSEEK_MAX_TOKENS = 800;

export { DeepSeekGatewayError };

function statusToConnection(status: number): Exclude<AiConnectionStatus, "not_configured"> {
  if (status === 401 || status === 403) return "key_invalid";
  if (status === 402) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "unavailable";
}

function httpStatusError(status: number): DeepSeekGatewayError {
  if (status === 401 || status === 403) {
    return new DeepSeekGatewayError("key_invalid", "DeepSeek Key is invalid", {
      httpStatus: status,
    });
  }
  if (status === 402) {
    return new DeepSeekGatewayError("insufficient_balance", "DeepSeek balance is insufficient", {
      httpStatus: status,
    });
  }
  if (status === 429) {
    return new DeepSeekGatewayError("rate_limited", "DeepSeek rate limit reached", {
      httpStatus: status,
      retryable: true,
    });
  }
  if (status === 408 || status >= 500) {
    return new DeepSeekGatewayError("temporary", "DeepSeek is temporarily unavailable", {
      httpStatus: status,
      retryable: true,
    });
  }
  if (status >= 400) {
    return new DeepSeekGatewayError("invalid_request", "DeepSeek rejected the request", {
      httpStatus: status,
    });
  }
  return new DeepSeekGatewayError("temporary", "DeepSeek returned an unexpected status", {
    httpStatus: status,
    retryable: true,
  });
}

function parseUsage(value: unknown): AiUsage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const prompt = record.prompt_tokens;
  const completion = record.completion_tokens;
  const total = record.total_tokens;
  if (
    typeof prompt !== "number" ||
    !Number.isSafeInteger(prompt) ||
    prompt < 0 ||
    typeof completion !== "number" ||
    !Number.isSafeInteger(completion) ||
    completion < 0 ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    return null;
  }
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

/**
 * Fixed-destination DeepSeek adapter.
 *
 * The key is per call and is never retained. Thinking is explicitly disabled
 * because deepseek-flash defaults to thinking mode; output is capped at 800
 * tokens. The service owns the overall node deadline and the single retry.
 */
export class HttpDeepSeekGateway implements AiGateway {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async testConnection(key: string, signal?: AbortSignal): Promise<AiConnectionResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${DEEPSEEK_BASE_URL}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal,
      });
    } catch {
      return { status: "unavailable", message: "连接测试暂时不可用", usage: null };
    }

    if (!response.ok) {
      return {
        status: statusToConnection(response.status),
        message: `DeepSeek 返回 HTTP ${response.status}`,
        usage: null,
      };
    }
    return { status: "available", message: "连接成功", usage: null };
  }

  async decide(key: string, input: BotDecisionInput, signal?: AbortSignal): Promise<AiSuggestion> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal,
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: buildDecisionMessages(input),
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          max_tokens: DEEPSEEK_MAX_TOKENS,
          temperature: 0.7,
          stream: false,
        }),
      });
    } catch {
      if (signal?.aborted) {
        throw new DeepSeekGatewayError("timeout", "DeepSeek request timed out");
      }
      throw new DeepSeekGatewayError("network", "DeepSeek network request failed", {
        retryable: true,
      });
    }

    if (!response.ok) {
      throw httpStatusError(response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DeepSeekGatewayError("invalid_response", "DeepSeek response is not JSON");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new DeepSeekGatewayError("invalid_response", "DeepSeek response is not an object");
    }
    const record = body as Record<string, unknown>;
    const choices = record.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new DeepSeekGatewayError("invalid_response", "DeepSeek returned no choices");
    }
    const choice = choices[0];
    if (typeof choice !== "object" || choice === null || Array.isArray(choice)) {
      throw new DeepSeekGatewayError("invalid_response", "DeepSeek returned an invalid choice");
    }
    const choiceRecord = choice as Record<string, unknown>;
    const message = choiceRecord.message;
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      throw new DeepSeekGatewayError("invalid_response", "DeepSeek returned no message");
    }
    const messageRecord = message as Record<string, unknown>;
    const content = typeof messageRecord.content === "string" ? messageRecord.content : null;
    const finishReason =
      typeof choiceRecord.finish_reason === "string" ? choiceRecord.finish_reason : undefined;

    const suggestion = parseDecisionContent(content, finishReason, input);
    const usage = parseUsage(record.usage);
    const model = typeof record.model === "string" ? record.model : DEEPSEEK_MODEL;
    return { ...suggestion, usage, model };
  }
}
