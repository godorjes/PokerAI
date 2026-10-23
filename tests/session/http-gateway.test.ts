import { describe, expect, it } from "vitest";
import { buildBotDecisionInput } from "@/server/ai/bot-input";
import { botStyleForSeat } from "@/server/bot-strategy/styles";
import { HttpDeepSeekGateway } from "@/server/ai/http-gateway";
import type { DeepSeekGatewayError } from "@/server/ai/gateway";
import { makeTestTable } from "../support/table";

const CARDS = [
  "2c",
  "4c",
  "6c",
  "8s",
  "9d",
  "3d",
  "5d",
  "7d",
  "8h",
  "Tc",
  "Kc",
  "Qs",
  "Jh",
  "7s",
  "5h",
  "3s",
  "9h",
  "2h",
];

function input() {
  const table = makeTestTable({
    stacks: [1000, 1000, 1000, 1000, 1000],
    button: 0,
    firstCards: CARDS,
  });
  return buildBotDecisionInput(table.botView(3), botStyleForSeat(3));
}

function completion(content: string | null, finishReason = "stop", usage?: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
      ...(usage === undefined ? {} : { usage }),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("fixed DeepSeek HTTP gateway", () => {
  it("uses the fixed origin and a per-request Authorization header", async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    const gateway = new HttpDeepSeekGateway(async (request, init) => {
      seen.push({
        url: String(request),
        auth: new Headers(init?.headers).get("authorization"),
      });
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await gateway.testConnection("test-key");
    expect(result.status).toBe("available");
    expect(seen[0]).toEqual({
      url: "https://api.deepseek.com/models",
      auth: "Bearer test-key",
    });
  });

  it("sends non-thinking JSON mode to chat/completions", async () => {
    const seen: Array<{ url: string; body: string }> = [];
    const gateway = new HttpDeepSeekGateway(async (request, init) => {
      seen.push({ url: String(request), body: String(init?.body) });
      return completion('{"action":"call","amountTo":null}');
    });

    const action = await gateway.decide("test-key", input());
    expect(action).toMatchObject({ action: "call", amountTo: null, model: "deepseek-flash" });
    expect(seen[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(seen[0]!.body) as {
      model: string;
      stream: boolean;
      max_tokens: number;
      thinking: { type: string };
      response_format: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(body).toMatchObject({
      model: "deepseek-flash",
      stream: false,
      max_tokens: 800,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
    });
    expect(body.messages[0]?.content).toContain("AI-3");
    expect(body.messages[0]?.content).toContain("legalActions");
  });

  it("parses usage and private protocol fields when present", async () => {
    const gateway = new HttpDeepSeekGateway(async () =>
      completion(
        JSON.stringify({
          action: "call",
          amountTo: null,
          decisionSummary: "price is acceptable",
          confidenceLabel: "medium",
          opponentIntents: [
            {
              targetPlayerId: "human",
              hypothesis: "small bet may be a probe",
              confidenceLabel: "low",
            },
          ],
        }),
        "stop",
        { prompt_tokens: 120, completion_tokens: 20, total_tokens: 140 },
      ),
    );

    const result = await gateway.decide("test-key", input());
    expect(result.usage).toEqual({ promptTokens: 120, completionTokens: 20, totalTokens: 140 });
    expect(result.decisionSummary).toBe("price is acceptable");
    expect(result.confidenceLabel).toBe("medium");
    expect(result.opponentIntents?.[0]?.targetPlayerId).toBe("human");
  });

  it("classifies empty content, empty JSON, truncation and malformed responses", async () => {
    const emptyGateway = new HttpDeepSeekGateway(async () => completion(null));
    const emptyObjectGateway = new HttpDeepSeekGateway(async () => completion("{}"));
    const truncatedGateway = new HttpDeepSeekGateway(async () =>
      completion('{"action":"call"', "length"),
    );
    const malformedGateway = new HttpDeepSeekGateway(async () => completion("{not json"));

    await expect(emptyGateway.decide("test-key", input())).rejects.toMatchObject({
      code: "empty",
    } satisfies Partial<DeepSeekGatewayError>);
    await expect(emptyObjectGateway.decide("test-key", input())).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<DeepSeekGatewayError>);
    await expect(truncatedGateway.decide("test-key", input())).rejects.toMatchObject({
      code: "truncated",
    } satisfies Partial<DeepSeekGatewayError>);
    await expect(malformedGateway.decide("test-key", input())).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<DeepSeekGatewayError>);
  });

  it("classifies HTTP retryable and non-retryable errors without leaking the key", async () => {
    const rateLimited = new HttpDeepSeekGateway(async () => new Response(null, { status: 429 }));
    const unauthorized = new HttpDeepSeekGateway(async () => new Response(null, { status: 401 }));

    await expect(rateLimited.decide("secret-key", input())).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
    } satisfies Partial<DeepSeekGatewayError>);
    await expect(unauthorized.decide("secret-key", input())).rejects.toMatchObject({
      code: "key_invalid",
      retryable: false,
    } satisfies Partial<DeepSeekGatewayError>);
  });

  it("rejects a malformed intent target and a wrong amount shape", async () => {
    const badTarget = new HttpDeepSeekGateway(async () =>
      completion(
        JSON.stringify({
          action: "call",
          amountTo: null,
          opponentIntents: [
            { targetPlayerId: "not-a-player", hypothesis: "x", confidenceLabel: "low" },
          ],
        }),
      ),
    );
    const wrongAmount = new HttpDeepSeekGateway(async () =>
      completion('{"action":"call","amountTo":10}'),
    );

    await expect(badTarget.decide("test-key", input())).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<DeepSeekGatewayError>);
    await expect(wrongAmount.decide("test-key", input())).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<DeepSeekGatewayError>);
  });
});
