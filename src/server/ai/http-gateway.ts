import type { AiConnectionStatus } from "@/shared/api";
import type { ActionName } from "@/shared/contracts";
import type { AiConnectionResult, AiGateway, AiSuggestion } from "./gateway";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-flash";

const ACTIONS: readonly ActionName[] = ["fold", "check", "call", "bet", "raise", "all_in"];

export class DeepSeekGatewayError extends Error {
  readonly status: AiConnectionStatus;

  constructor(status: AiConnectionStatus, message: string) {
    super(message);
    this.name = "DeepSeekGatewayError";
    this.status = status;
  }
}

function statusToConnection(status: number): Exclude<AiConnectionStatus, "not_configured"> {
  if (status === 401 || status === 403) return "key_invalid";
  if (status === 402) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "unavailable";
}

/**
 * Fixed-destination DeepSeek adapter.
 *
 * The key is passed per call and is never retained by this object. Prompt and
 * response bodies are not logged. Stage D owns final prompt/thinking/validation
 * tuning; this adapter establishes the request boundary only.
 */
export class HttpDeepSeekGateway implements AiGateway {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async testConnection(key: string, signal?: AbortSignal): Promise<AiConnectionResult> {
    const response = await this.fetchImpl(`${DEEPSEEK_BASE_URL}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      return {
        status: statusToConnection(response.status),
        message: `DeepSeek 返回 HTTP ${response.status}`,
        usage: null,
      };
    }
    return { status: "available", message: "连接成功", usage: null };
  }

  async decide(key: string, view: unknown, signal?: AbortSignal): Promise<AiSuggestion> {
    const response = await this.fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal,
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a no-limit Texas Hold'em bot. Use only the supplied legal actions. " +
              'Return one JSON object: {"action": string, "amountTo": number|null}. ' +
              "amountTo is a total street commitment and is only valid for bet/raise.",
          },
          { role: "user", content: JSON.stringify(view) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new DeepSeekGatewayError(
        statusToConnection(response.status),
        `DeepSeek 返回 HTTP ${response.status}`,
      );
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new DeepSeekGatewayError("unavailable", "DeepSeek 返回空内容");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new DeepSeekGatewayError("unavailable", "DeepSeek 返回非 JSON");
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new DeepSeekGatewayError("unavailable", "DeepSeek 返回 JSON 对象");
    }
    const record = parsed as Record<string, unknown>;
    const action = record.action;
    if (typeof action !== "string" || !ACTIONS.includes(action as ActionName)) {
      throw new DeepSeekGatewayError("unavailable", "DeepSeek 返回非法动作");
    }
    const amountTo = record.amountTo;
    if (
      amountTo !== null &&
      (typeof amountTo !== "number" || !Number.isSafeInteger(amountTo) || amountTo <= 0)
    ) {
      throw new DeepSeekGatewayError("unavailable", "DeepSeek 返回非法金额");
    }
    return {
      action: action as ActionName,
      amountTo: amountTo as number | null,
    };
  }
}
