import { readFile } from "node:fs/promises";
import type { AuditPass, Measurable, Verdict } from "./types.js";

export type BlindPair = {
  /** Unlabeled evidence paths — critic must not learn which is ours */
  leftPath: string;
  rightPath: string;
  /** Internal only — never pass to critic prompt */
  leftIsOurs: boolean;
  kind: "image" | "text";
};

export const SECOND_ORDER_CHECKS = [
  "empty / error states",
  "retries and idempotency",
  "races / stale leases",
  "rollback paths",
  "injection via untrusted text",
  "secrets or PII in outputs, logs, or VCS",
] as const;

/**
 * Build a critic prompt that is blind by construction.
 * Never include the words "ours", "bar", builder notes, or which side is which.
 */
export function buildBlindCriticPrompt(
  pair: BlindPair,
  pieceName: string,
  textEvidence?: { leftText: string; rightText: string },
  opts?: { acceptanceCriteria?: string[] },
): string {
  const medium =
    pair.kind === "image"
      ? "two unlabeled screenshots (A and B)"
      : "two unlabeled text excerpts (A and B)";

  if (pair.kind === "text" && !textEvidence) {
    throw new Error("Grounded text evidence required for blind critic.");
  }
  if (
    pair.kind === "text" &&
    (!textEvidence?.leftText.trim() || !textEvidence.rightText.trim())
  ) {
    throw new Error("Non-empty text evidence required for blind critic.");
  }

  const evidence =
    pair.kind === "text"
      ? [
          "A:",
          textEvidence?.leftText ?? "",
          "",
          "B:",
          textEvidence?.rightText ?? "",
        ]
      : [`A is at: ${pair.leftPath}`, `B is at: ${pair.rightPath}`];

  const criteria = opts?.acceptanceCriteria?.filter(Boolean) ?? [];
  const criteriaBlock =
    criteria.length > 0
      ? [
          "",
          "Acceptance criteria (verbatim — one unproven criterion = FAIL the loser):",
          ...criteria.map((c, i) => `${i + 1}. ${c}`),
          "When answering, mentally map criterion → direct evidence in A/B.",
        ]
      : [];

  return [
    `You are a hostile visual/product critic judging ${medium} for the piece "${pieceName}".`,
    "Pick which one is better for this piece alone. Binary choice only.",
    "Do not score out of 10. Do not praise. If they are close, still pick one.",
    "Name the single biggest remaining gap the loser must fix to beat the winner.",
    "",
    "Respond with JSON only:",
    '{"winner":"A"|"B","gap":"one sentence","confidence":0.0-1.0}',
    "",
    ...evidence,
    ...criteriaBlock,
  ].join("\n");
}

/** Criteria-map + second-order hostile audit (PASS/FAIL) for risky / checklist pieces. */
export function buildCriteriaAuditPrompt(args: {
  pieceName: string;
  artifactSummary: string;
  acceptanceCriteria: string[];
  mode: "adversarial" | "criteria";
}): string {
  const criteria =
    args.acceptanceCriteria.length > 0
      ? args.acceptanceCriteria
      : [
          "Evidence is present and non-empty.",
          "No secrets/PII leakage.",
          "Piece fulfills its named job.",
        ];

  return [
    args.mode === "adversarial"
      ? `You are an independent adversarial auditor for risky piece "${args.pieceName}".`
      : `You are a hostile acceptance auditor for piece "${args.pieceName}".`,
    "Assume the work is wrong until evidence proves otherwise.",
    "For each criterion, demand direct evidence. A claim without artifacts is FAIL.",
    "",
    "Second-order checks (any hit = FAIL):",
    ...SECOND_ORDER_CHECKS.map((c) => `- ${c}`),
    "",
    "Criteria:",
    ...criteria.map((c, i) => `${i + 1}. ${c}`),
    "",
    "Evidence / artifact summary:",
    args.artifactSummary.slice(0, 12000),
    "",
    "Respond with JSON only:",
    '{"passed":true|false,"findings":["criterion → missing evidence",...],"gap":"worst deficiency or empty if passed"}',
  ].join("\n");
}

/** Final smoothing critic over the integrated whole after all pieces won. */
export function buildSmoothingPrompt(args: {
  goal: string;
  pieceSummaries: string[];
  acceptanceCriteria?: string[];
}): string {
  return [
    "You are a hostile smoothing critic reviewing the integrated whole.",
    "Pieces already passed blind A/B individually. Find coherence gaps across the set.",
    "Look for: tone/style mismatch, broken seams between pieces, missing empty states,",
    "contradictory copy, navigation dead-ends, and second-order failures:",
    ...SECOND_ORDER_CHECKS.map((c) => `- ${c}`),
    "",
    `Goal: ${args.goal}`,
    args.acceptanceCriteria?.length
      ? [
          "Acceptance criteria:",
          ...args.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
        ].join("\n")
      : "",
    "",
    "Piece summaries:",
    ...args.pieceSummaries,
    "",
    "Respond with JSON only:",
    '{"passed":true|false,"findings":["..."],"gap":"worst coherence gap or empty if clean"}',
  ]
    .filter(Boolean)
    .join("\n");
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

/** Offline heuristic for adversarial / criteria audits — fail closed on empty evidence. */
export async function heuristicAuditPass(
  artifactPath: string | null,
): Promise<AuditPass> {
  if (!artifactPath) {
    return {
      passed: false,
      gap: "No artifact path for audit.",
      findings: ["artifact → missing evidence"],
      note: "heuristic-audit",
    };
  }
  try {
    const buf = await readFile(artifactPath);
    if (buf.byteLength === 0) {
      return {
        passed: false,
        gap: "Artifact empty.",
        findings: ["artifact → empty"],
        note: "heuristic-audit",
      };
    }
    // Text-like stubs: only whitespace / trivial markup with no body text
    const asText = buf.toString("utf8");
    if (
      /^[\s\x00]*$/.test(asText) ||
      (asText.length < 8 && !/\S/.test(asText.replace(/<[^>]+>/g, "")))
    ) {
      return {
        passed: false,
        gap: "Artifact too thin to count as evidence.",
        findings: ["artifact → empty or stub"],
        note: "heuristic-audit",
      };
    }
    return {
      passed: true,
      gap: "",
      findings: [],
      note: "heuristic-audit",
    };
  } catch {
    return {
      passed: false,
      gap: "Artifact unreadable.",
      findings: ["artifact → unreadable"],
      note: "heuristic-audit",
    };
  }
}

/** Offline smoothing — pass when every piece has a non-empty artifact. */
export async function heuristicSmoothingPass(
  pieces: { name: string; artifactPath: string | null }[],
): Promise<AuditPass> {
  const findings: string[] = [];
  for (const p of pieces) {
    const audit = await heuristicAuditPass(p.artifactPath);
    if (!audit.passed) {
      findings.push(`${p.name} → ${audit.findings[0] ?? audit.gap}`);
    }
  }
  if (findings.length) {
    return {
      passed: false,
      gap: findings[0] ?? "Integrated whole has open gaps.",
      findings,
      note: "heuristic-smoothing",
    };
  }
  return {
    passed: true,
    gap: "",
    findings: [],
    note: "heuristic-smoothing",
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

export function parseAuditJson(raw: string): AuditPass {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Audit critic did not return JSON.");
  const data = JSON.parse(match[0]) as {
    passed?: boolean;
    findings?: unknown;
    gap?: string;
  };
  if (typeof data.passed !== "boolean") {
    throw new Error("Audit critic must return passed boolean.");
  }
  const findings = Array.isArray(data.findings)
    ? data.findings.filter((f): f is string => typeof f === "string")
    : [];
  return {
    passed: data.passed,
    findings,
    gap:
      data.gap?.trim() ||
      (data.passed ? "" : findings[0] || "Audit failed without gap detail."),
  };
}

const RISKY_RE =
  /\b(auth|login|credential|secret|payment|billing|checkout|prod(?:uction)?|deploy|irreversible|admin|pii|oauth|password)\b/i;

export function isRiskyPiece(
  piece: { id: string; name: string },
  riskyList?: string[],
  goal?: string,
): boolean {
  if (
    riskyList?.some(
      (r) =>
        r === piece.id ||
        r.toLowerCase() === piece.name.toLowerCase() ||
        piece.name.toLowerCase().includes(r.toLowerCase()),
    )
  ) {
    return true;
  }
  return RISKY_RE.test(piece.name) || Boolean(goal && RISKY_RE.test(goal));
}
