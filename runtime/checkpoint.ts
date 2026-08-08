import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clearStopRequest,
  readMeta,
  readPieces,
  runDir,
  writeMeta,
  writePieces,
  writeProgress,
} from "./ledger.js";
import type { Piece, RunMeta } from "./types.js";

export type Budget = {
  maxUsd?: number;
  maxTokens?: number;
  usedUsd: number;
  usedTokens: number;
  /** When true, loop must STOP even if pieces remain. */
  exhausted: boolean;
  accountingError?: string;
};

export type UsageDelta = {
  tokens?: number;
  usd?: number;
};

export function emptyBudget(maxUsd?: number, maxTokens?: number): Budget {
  return {
    maxUsd,
    maxTokens,
    usedUsd: 0,
    usedTokens: 0,
    exhausted:
      (maxUsd != null && maxUsd <= 0) || (maxTokens != null && maxTokens <= 0),
  };
}

export function recordUsage(b: Budget, tokens: number, usd: number): Budget {
  if (!Number.isFinite(tokens) || tokens < 0) {
    throw new Error(`Invalid token usage: ${tokens}`);
  }
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`Invalid USD usage: ${usd}`);
  }
  const next = {
    ...b,
    usedTokens: b.usedTokens + tokens,
    usedUsd: b.usedUsd + usd,
    accountingError: undefined,
  };
  next.exhausted =
    (next.maxTokens != null && next.usedTokens >= next.maxTokens) ||
    (next.maxUsd != null && next.usedUsd >= next.maxUsd);
  return next;
}

export function budgetBlocks(meta: RunMeta): boolean {
  return Boolean(meta.budgetState?.exhausted);
}

export type Checkpoint = {
  runId: string;
  savedAt: string;
  pieceId: string | null;
  round: number;
  note: string;
};

export async function writeCheckpoint(
  dir: string,
  cp: Checkpoint,
): Promise<void> {
  await writeFile(
    path.join(dir, "checkpoint.json"),
    JSON.stringify(cp, null, 2) + "\n",
    "utf8",
  );
}

export async function readCheckpoint(dir: string): Promise<Checkpoint | null> {
  try {
    return JSON.parse(
      await readFile(path.join(dir, "checkpoint.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

/** Resume a stopped/incomplete run — clears stop flag on pending pieces, sets running. */
export async function resumeRun(
  runId: string,
  cwd = process.cwd(),
): Promise<{ meta: RunMeta; pieces: Piece[] }> {
  const dir = runDir(runId, cwd);
  const meta = await readMeta(dir);
  const pieces = await readPieces(dir);
  if (meta.status === "completed") {
    throw new Error("Run already completed.");
  }
  if (meta.budgetState?.exhausted) {
    throw new Error("Budget exhausted — raise budget before resume.");
  }
  await clearStopRequest(dir);
  meta.status = "running";
  meta.updatedAt = new Date().toISOString();
  for (const p of pieces) {
    if (p.status === "stopped" || p.status === "failed") {
      p.status = "pending";
      p.error = null;
    }
  }
  await writeMeta(dir, meta);
  await writePieces(dir, pieces);
  await writeProgress(dir, meta, pieces);
  await writeCheckpoint(dir, {
    runId,
    savedAt: new Date().toISOString(),
    pieceId: pieces.find((p) => p.status !== "won")?.id ?? null,
    round: 0,
    note: "resumed",
  });
  return { meta, pieces };
}

export async function writeWorkbench(
  dir: string,
  meta: RunMeta,
  pieces: Piece[],
): Promise<void> {
  const lines = [
    `# Workbench — ${meta.id}`,
    "",
    `Status: **${meta.status}** · Mode: **${meta.mode ?? "standard"}**`,
    `Goal: ${meta.goal}`,
    `Bar: ${meta.bar.name}`,
    meta.budgetState
      ? `Budget: $${meta.budgetState.usedUsd.toFixed(2)}${meta.budgetState.maxUsd != null ? ` / $${meta.budgetState.maxUsd}` : ""} · tokens ${meta.budgetState.usedTokens}${meta.budgetState.maxTokens != null ? ` / ${meta.budgetState.maxTokens}` : ""}`
      : "",
    meta.budgetState?.accountingError
      ? `Accounting: **${meta.budgetState.exhausted ? "BLOCKED" : "WARNING"}** — ${meta.budgetState.accountingError}`
      : "",
    "",
    "| Piece | Status | Rounds | Verdict | Open findings | Gap / Error |",
    "|---|---|---:|---|---|---|",
    ...pieces.map((p) => {
      const findings = p.openFindings?.length ? p.openFindings.join("; ") : "—";
      const adv =
        p.adversarialPassed === true
          ? " · adv✓"
          : p.adversarialPassed === false
            ? " · adv✗"
            : "";
      return `| ${p.name} | ${p.status} | ${p.round} | ${p.lastVerdict ?? "—"}${adv} | ${findings} | ${p.error ?? p.gap ?? "—"} |`;
    }),
    "",
    meta.smoothingPassed != null
      ? `## Smoothing\n\n${meta.smoothingPassed ? "Passed." : `Open: ${meta.smoothingGap ?? "coherence gap"}`}`
      : "",
    "## Human gates",
    ...(meta.humanGates?.length
      ? meta.humanGates.map((g) => `- [ ] ${g}`)
      : ["- (none named)"]),
    "",
    "_You are the brake. `gauntlet stop` anytime. Gates outrank the loop._",
    "",
  ];
  await writeFile(
    path.join(dir, "workbench.md"),
    lines.filter((l) => l !== undefined).join("\n"),
    "utf8",
  );
}

export async function ensureDispatchDir(runDirPath: string) {
  const d = path.join(runDirPath, "dispatch");
  await mkdir(d, { recursive: true });
  return d;
}
