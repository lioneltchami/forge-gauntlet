import { readFile } from "node:fs/promises";
import type { Measurable, Verdict } from "./types.js";

export type BlindPair = {
  /** Unlabeled evidence paths — critic must not learn which is ours */
  leftPath: string;
  rightPath: string;
  /** Internal only — never pass to critic prompt */
  leftIsOurs: boolean;
  kind: "image" | "text";
};

/**
 * Build a critic prompt that is blind by construction.
 * Never include the words "ours", "bar", builder notes, or which side is which.
 */
export function buildBlindCriticPrompt(
  pair: BlindPair,
  pieceName: string,
): string {
  const medium =
    pair.kind === "image"
      ? "two unlabeled screenshots (A and B)"
      : "two unlabeled text excerpts (A and B)";

  return [
    `You are a harsh visual/product critic judging ${medium} for the piece "${pieceName}".`,
    "Pick which one is better for this piece alone. Binary choice only.",
    "Do not score out of 10. Do not praise. If they are close, still pick one.",
    "Name the single biggest remaining gap the loser must fix to beat the winner.",
    "",
    "Respond with JSON only:",
    '{"winner":"A"|"B","gap":"one sentence","confidence":0.0-1.0}',
    "",
    `A is at: ${pair.leftPath}`,
    `B is at: ${pair.rightPath}`,
  ].join("\n");
}

/** Map critic's A/B pick back to ours|bar without revealing labels to the critic. */
export function mapBlindWinner(
  pick: "A" | "B",
  leftIsOurs: boolean,
): "ours" | "bar" {
  if (pick === "A") return leftIsOurs ? "ours" : "bar";
  return leftIsOurs ? "bar" : "ours";
}

export function randomizePair(
  oursPath: string,
  barPath: string,
  kind: "image" | "text",
): BlindPair {
  const leftIsOurs = Math.random() < 0.5;
  return {
    leftPath: leftIsOurs ? oursPath : barPath,
    rightPath: leftIsOurs ? barPath : oursPath,
    leftIsOurs,
    kind,
  };
}

/**
 * Heuristic local critic for demos / CI when no LLM critic is wired.
 * Compares byte sizes / text length as a weak stand-in — production should
 * replace with adapters/openrouter or a vision model. Still returns binary.
 */
export async function heuristicCritic(
  pair: BlindPair,
  measurable?: Measurable,
): Promise<Verdict> {
  let preferLeft = true;
  if (pair.kind === "text") {
    const a = await readFile(pair.leftPath, "utf8");
    const b = await readFile(pair.rightPath, "utf8");
    // Prefer denser-but-not-spammy text in a mid band
    const score = (t: string) => {
      const words = t.trim().split(/\s+/).filter(Boolean).length;
      return words > 40 && words < 4000 ? words : words * 0.2;
    };
    preferLeft = score(a) >= score(b);
  } else {
    const a = await readFile(pair.leftPath);
    const b = await readFile(pair.rightPath);
    // Larger screenshot often means more rendered content (weak heuristic)
    preferLeft = a.byteLength >= b.byteLength;
  }

  const pick: "A" | "B" = preferLeft ? "A" : "B";
  const winner = mapBlindWinner(pick, pair.leftIsOurs);
  let measurableMet: boolean | undefined;
  if (measurable?.ours != null) {
    measurableMet =
      measurable.ours === measurable.target || measurable.met === true;
  }

  // Measurable half: taste win is not enough if metric fails
  if (measurable && measurableMet === false && winner === "ours") {
    return {
      winner: "bar",
      gap: `Measurable half failed: need ${measurable.metric} = ${measurable.target} (ours: ${measurable.ours ?? "unknown"}).`,
      confidence: 0.7,
      measurableMet: false,
      note: "heuristic-critic",
    };
  }

  return {
    winner,
    gap:
      winner === "bar"
        ? "Close the single largest visual/content gap vs the reference for this piece."
        : "No remaining gap for this piece — ours wins blind.",
    confidence: 0.55,
    measurableMet,
    note: "heuristic-critic",
  };
}

export function parseCriticJson(raw: string): {
  winner: "A" | "B";
  gap: string;
  confidence: number;
} {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Critic did not return JSON.");
  const data = JSON.parse(match[0]) as {
    winner?: string;
    gap?: string;
    confidence?: number;
  };
  const w = data.winner?.toUpperCase();
  if (w !== "A" && w !== "B") throw new Error("Critic winner must be A or B.");
  return {
    winner: w,
    gap: data.gap?.trim() || "Unspecified gap.",
    confidence:
      typeof data.confidence === "number"
        ? Math.min(1, Math.max(0, data.confidence))
        : 0.5,
  };
}
