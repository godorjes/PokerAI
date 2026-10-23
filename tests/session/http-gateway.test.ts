import { describe, expect, it } from "vitest";
import { HttpDeepSeekGateway } from "@/server/ai/http-gateway";
import type { BotDecisionView } from "@/shared/contracts";

const view = {
  board: [],
  potTotal: 15,
  legalActions: {
    actions: ["fold", "call", "all_in"],
    toCall: 10,
    minBetTo: null,
    minRaiseTo: 20,
    maxTo: 1000,
    canOnlyShortAllIn: false,
  },
} as unknown as BotDecisionView;

describe("fixed DeepSeek HTTP gateway", () => {
  it("uses the fixed origin and a per-request Authorization header", async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    const gateway = new HttpDeepSeekGateway(async (input, init) => {
      seen.push({
        url: String(input),
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

  it("sends JSON mode to chat/completions and parses a legal action", async () => {
    const seen: Array<{ url: string; body: string }> = [];
    const gateway = new HttpDeepSeekGateway(async (input, init) => {
      seen.push({ url: String(input), body: String(init?.body) });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"action":"call","amountTo":null}' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const action = await gateway.decide("test-key", view);
    expect(action).toEqual({ action: "call", amountTo: null });
    expect(seen[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(seen[0]!.body) as {
      model: string;
      stream: boolean;
      response_format: { type: string };
    };
    expect(body).toMatchObject({
      model: "deepseek-flash",
      stream: false,
      response_format: { type: "json_object" },
    });
  });
});
