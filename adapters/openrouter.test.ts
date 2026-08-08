import assert from "node:assert/strict";
import { it } from "node:test";
import { openRouterCriticWithUsage } from "./openrouter.js";

it("returns OpenRouter critic content with token and cost usage", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"winner":"A","gap":"Sharper hierarchy.","confidence":0.8}',
            },
          },
        ],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 20,
          total_tokens: 100,
          cost: 0.0042,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const result = await openRouterCriticWithUsage("compare", {
      apiKey: "test-key",
      maxTokens: 33,
    });
    assert.match(result.raw, /"winner":"A"/);
    assert.deepEqual(result.usage, { tokens: 100, usd: 0.0042 });
    assert.equal(requestBody?.max_tokens, 33);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
