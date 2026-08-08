/**
 * Optional OpenRouter-backed critic.
 * Set OPENROUTER_API_KEY to enable from CLI via --llm-critic.
 */
export async function openRouterCritic(
  prompt: string,
  opts: { model?: string; apiKey?: string } = {},
): Promise<string> {
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
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty content");
  return content;
}
