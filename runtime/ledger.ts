import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Piece, RunMeta, Verdict } from "./types.js";

const STOP_REQUEST_FILE = "stop-requested.json";

async function hasStopRequest(dir: string): Promise<boolean> {
  try {
    await access(path.join(dir, STOP_REQUEST_FILE));
    return true;
  } catch {
    return false;
  }
}

export async function requestStop(dir: string): Promise<void> {
  await writeFile(
    path.join(dir, STOP_REQUEST_FILE),
    JSON.stringify({ requestedAt: new Date().toISOString() }, null, 2) + "\n",
    "utf8",
  );
}

export async function clearStopRequest(dir: string): Promise<void> {
  await rm(path.join(dir, STOP_REQUEST_FILE), { force: true });
}

export function runsRoot(cwd = process.cwd()): string {
  return path.join(cwd, "runs");
}

export function runDir(runId: string, cwd = process.cwd()): string {
  return path.join(runsRoot(cwd), runId);
}

export async function ensureRunDir(runId: string, cwd = process.cwd()) {
  const dir = runDir(runId, cwd);
  await mkdir(path.join(dir, "evidence"), { recursive: true });
  await mkdir(path.join(dir, "artifacts"), { recursive: true });
  return dir;
}

export async function writeGoal(dir: string, goal: string) {
  await writeFile(path.join(dir, "goal.md"), `# Goal\n\n${goal}\n`, "utf8");
}

export async function writeMeta(dir: string, meta: RunMeta) {
  const next = (await hasStopRequest(dir))
    ? { ...meta, status: "stopped_by_user" as const }
    : meta;
  await writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify(next, null, 2) + "\n",
    "utf8",
  );
}

export async function readMeta(dir: string): Promise<RunMeta> {
  const meta = JSON.parse(
    await readFile(path.join(dir, "meta.json"), "utf8"),
  ) as RunMeta;
  if (await hasStopRequest(dir)) {
    meta.status = "stopped_by_user";
  }
  return meta;
}

export async function writePieces(dir: string, pieces: Piece[]) {
  const next = (await hasStopRequest(dir))
    ? pieces.map((piece) =>
        piece.status === "won"
          ? piece
          : { ...piece, status: "stopped" as const },
      )
    : pieces;
  await writeFile(
    path.join(dir, "pieces.json"),
    JSON.stringify(next, null, 2) + "\n",
    "utf8",
  );
}

export async function readPieces(dir: string): Promise<Piece[]> {
  const pieces = JSON.parse(
    await readFile(path.join(dir, "pieces.json"), "utf8"),
  ) as Piece[];
  if (!(await hasStopRequest(dir))) return pieces;
  return pieces.map((piece) =>
    piece.status === "won" ? piece : { ...piece, status: "stopped" as const },
  );
}

export async function writeBarJson(dir: string, data: unknown) {
  await writeFile(
    path.join(dir, "bar.json"),
    JSON.stringify(data, null, 2) + "\n",
    "utf8",
  );
}

export async function writeVerdict(
  dir: string,
  pieceId: string,
  round: number,
  verdict: Verdict,
) {
  const p = path.join(
    dir,
    "evidence",
    pieceId,
    `round-${round}`,
    "verdict.json",
  );
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(verdict, null, 2) + "\n", "utf8");
}

export function renderProgress(meta: RunMeta, pieces: Piece[]): string {
  const lines: string[] = [];
  lines.push(`# Gauntlet run \`${meta.id}\``);
  lines.push("");
  lines.push(`**Status:** ${meta.status}`);
  lines.push(`**Goal:** ${meta.goal}`);
  lines.push(
    `**Bar:** ${meta.bar.name}${meta.bar.url ? ` — ${meta.bar.url}` : ""}`,
  );
  if (meta.measurable) {
    lines.push(
      `**Measurable:** ${meta.measurable.metric} = ${meta.measurable.target}` +
        (meta.measurable.ours ? ` (ours: ${meta.measurable.ours})` : ""),
    );
  }
  lines.push(`**Updated:** ${meta.updatedAt}`);
  lines.push("");
  lines.push(
    "| Piece | Status | Rounds | Verdict | Open findings | Gap / Error |",
  );
  lines.push("|---|---|---:|---|---|---|");
  for (const p of pieces) {
    const findings = p.openFindings?.length ? p.openFindings.join("; ") : "—";
    lines.push(
      `| ${p.name} | ${p.status} | ${p.round} | ${p.lastVerdict ?? "—"}${p.adversarialPassed === true ? " · adv✓" : p.adversarialPassed === false ? " · adv✗" : ""} | ${findings} | ${p.error ?? p.gap ?? "—"} |`,
    );
  }
  if (meta.smoothingPassed != null) {
    lines.push("");
    lines.push(
      `**Smoothing:** ${meta.smoothingPassed ? "passed" : `open — ${meta.smoothingGap ?? "gap"}`}`,
    );
  }
  lines.push("");
  lines.push("_You are the brake. Run `gauntlet stop` anytime._");
  lines.push("");
  lines.push(
    "Technique by Matt Shumer (Claude of Duty). Forge Gauntlet enforces the bar.",
  );
  return lines.join("\n");
}

export async function writeProgress(
  dir: string,
  meta: RunMeta,
  pieces: Piece[],
) {
  const md = renderProgress(meta, pieces);
  await writeFile(path.join(dir, "progress.md"), md + "\n", "utf8");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="5" />
  <title>Gauntlet ${meta.id}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 880px; margin: 2rem auto; padding: 0 1rem; background: #0b0d10; color: #e8eaed; }
    a { color: #8ab4ff; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #2a2f36; padding: 0.5rem; text-align: left; }
    code { background: #1a1f26; padding: 0.1rem 0.35rem; border-radius: 4px; }
  </style>
</head>
<body>
<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace">${escapeHtml(md)}</pre>
</body>
</html>`;
  await writeFile(path.join(dir, "progress.html"), html, "utf8");
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function findActiveRunId(
  cwd = process.cwd(),
): Promise<string | null> {
  const root = runsRoot(cwd);
  try {
    await access(root);
  } catch {
    return null;
  }
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const id of dirs) {
    try {
      const meta = await readMeta(runDir(id, cwd));
      if (meta.status === "running" || meta.status === "proposed") return id;
    } catch {
      /* skip */
    }
  }
  return dirs[0] ?? null;
}
