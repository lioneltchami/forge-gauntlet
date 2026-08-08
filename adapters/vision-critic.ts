import { readFile } from "node:fs/promises";
import { HOSTILE_CRITIC_INSTRUCTION } from "../runtime/contracts.js";
import { parseCriticJson } from "../runtime/critic.js";

function mimeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function asDataUrl(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return `data:${mimeFor(filePath)};base64,${buf.toString("base64")}`;
}

/**
 * Vision blind A/B critic via OpenRouter (or compatible).
 * Paths must be unlabeled images — never named ours/bar.
 */
export async function visionBlindCritic(args: {
  leftPath: string;
  rightPath: string;
  pieceName: string;
  apiKey?: string;
  model?: string;
}): Promise<{
  winner: "A" | "B";
  gap: string;
  confidence: number;
  raw: string;
}> {
  const apiKey = args.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY required for vision critic");

  const model =
    args.model ?? process.env.GAUNTLET_VISION_MODEL ?? "openai/gpt-4o";

  const left = await asDataUrl(args.leftPath);
  const right = await asDataUrl(args.rightPath);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": "https://github.com/gauntlet-runtime",
      "X-Title": "Gauntlet Vision Critic",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: HOSTILE_CRITIC_INSTRUCTION,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Blind A/B for piece "${args.pieceName}". Image A then image B. Pick A or B. JSON only.`,
            },
            { type: "image_url", image_url: { url: left } },
            { type: "image_url", image_url: { url: right } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Vision critic HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseCriticJson(raw);
  return { ...parsed, raw };
}

/** Text-only OpenRouter critic (non-vision). */
export async function textBlindCritic(
  prompt: string,
  opts: { apiKey?: string; model?: string } = {},
): Promise<string> {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY required");
  const model =
    opts.model ?? process.env.GAUNTLET_CRITIC_MODEL ?? "openai/gpt-4o-mini";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": "https://github.com/gauntlet-runtime",
      "X-Title": "Gauntlet Critic",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: HOSTILE_CRITIC_INSTRUCTION },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok)
    throw new Error(`Critic HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty critic response");
  return content;
}
