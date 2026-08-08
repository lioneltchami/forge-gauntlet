/**
 * Optional OpenRouter-backed critic.
 * Set OPENROUTER_API_KEY to enable from CLI via --llm-critic.
 */
import type { UsageDelta } from "../runtime/checkpoint.js";

export type OpenRouterCriticResult = {
  raw: string;
  usage?: UsageDelta;
};

export async function openRouterCriticWithUsage(
  prompt: string,
  opts: { model?: string; apiKey?: string; maxTokens?: number } = {},
): Promise<OpenRouterCriticResult> {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set");
  }
  const model =
    opts.model ?? process.env.GAUNTLET_CRITIC_MODEL ?? "openai/gpt-4o-mini";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": "https://github.com/gauntlet-runtime",
      "X-Title": "Gauntlet Runtime",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      ...(opts.maxTokens != null
        ? { max_tokens: Math.max(1, Math.floor(opts.maxTokens)) }
        : {}),
      messages: [
        {
          role: "system",
          content:
            'You are a harsh blind A/B critic. Reply with JSON only: {"winner":"A"|"B","gap":"...","confidence":0-1}',
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter error: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      total_tokens?: number;
      cost?: number;
    };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty content");
  const tokens = data.usage?.total_tokens;
  const usd = data.usage?.cost;
  return {
    raw: content,
    usage:
      typeof tokens === "number" || typeof usd === "number"
        ? {
            tokens:
              typeof tokens === "number" && Number.isFinite(tokens)
                ? tokens
                : undefined,
            usd:
              typeof usd === "number" && Number.isFinite(usd) ? usd : undefined,
          }
        : undefined,
  };
}

export async function openRouterCritic(
  prompt: string,
  opts: { model?: string; apiKey?: string; maxTokens?: number } = {},
): Promise<string> {
  return (await openRouterCriticWithUsage(prompt, opts)).raw;
}
