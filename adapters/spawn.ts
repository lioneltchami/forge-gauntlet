import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UsageDelta } from "../runtime/checkpoint.js";

export type SpawnResult = {
  ok: boolean;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  code: number | null;
  usage?: UsageDelta;
  skipped?: boolean;
  reason?: string;
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function tokenTotal(value: Record<string, unknown>): number | undefined {
  const total =
    finiteNumber(value.total_tokens) ?? finiteNumber(value.totalTokens);
  if (total != null) return total;
  const parts = [
    value.input_tokens,
    value.inputTokens,
    value.output_tokens,
    value.outputTokens,
    value.cache_creation_input_tokens,
    value.cacheCreationInputTokens,
    value.cache_read_input_tokens,
    value.cacheReadInputTokens,
    value.cached_input_tokens,
    value.cachedInputTokens,
  ]
    .map(finiteNumber)
    .filter((part): part is number => part != null);
  return parts.length ? parts.reduce((sum, part) => sum + part, 0) : undefined;
}

function usageFromObject(
  value: Record<string, unknown>,
): UsageDelta | undefined {
  const usage =
    value.usage && typeof value.usage === "object"
      ? (value.usage as Record<string, unknown>)
      : value;
  const tokens = tokenTotal(usage);
  const usd =
    finiteNumber(value.total_cost_usd) ??
    finiteNumber(value.totalCostUsd) ??
    finiteNumber(value.cost_usd) ??
    finiteNumber(value.costUsd) ??
    finiteNumber(usage.cost);
  return tokens != null || usd != null ? { tokens, usd } : undefined;
}

/** Parse cumulative usage from Claude JSON or Codex JSONL output. */
export function parseAgentUsage(
  kind: AgentKind,
  stdout: string,
): UsageDelta | undefined {
  const values: Record<string, unknown>[] = [];
  if (kind === "claude") {
    try {
      values.push(JSON.parse(stdout) as Record<string, unknown>);
    } catch {
      return undefined;
    }
  } else {
    for (const line of stdout.split("\n").filter(Boolean)) {
      try {
        values.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Ignore non-JSON diagnostic lines.
      }
    }
  }

  const candidates = values
    .map(usageFromObject)
    .filter((usage): usage is UsageDelta => usage != null);
  if (!candidates.length) return undefined;
  return candidates.reduce<UsageDelta>(
    (best, usage) => ({
      tokens: Math.max(best.tokens ?? 0, usage.tokens ?? 0) || undefined,
      usd: Math.max(best.usd ?? 0, usage.usd ?? 0) || undefined,
    }),
    {},
  );
}

/** Resolve CLI on PATH. */
export async function resolveBinary(names: string[]): Promise<string | null> {
  for (const name of names) {
    const result = await runCmd(
      process.env.SHELL || "/bin/zsh",
      ["-lc", `command -v ${name}`],
      { timeoutMs: 5000 },
    );
    const found = result.stdout.trim().split("\n").filter(Boolean).pop();
    if (result.ok && found) return found;
  }
  return null;
}

function runCmd(
  command: string,
  args: string[],
  opts: {
    cwd?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    stdin?: string;
  } = {},
): Promise<SpawnResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: [opts.stdin == null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (opts.stdin != null) {
      child.stdin?.on("error", () => {
        // Child may exit before consuming stdin. Process close/error below
        // produces the authoritative SpawnResult.
      });
      child.stdin?.end(opts.stdin);
    }
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        ok: false,
        command,
        args,
        stdout,
        stderr: stderr + "\n[gauntlet] timed out",
        code: null,
        reason: "timeout",
      });
    }, timeoutMs);
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        command,
        args,
        stdout,
        stderr: String(err),
        code: null,
        reason: err.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        command,
        args,
        stdout,
        stderr,
        code,
      });
    });
  });
}

export type AgentKind = "claude" | "codex";

export function buildAgentInvocation(
  kind: AgentKind,
  prompt: string,
  maxUsd?: number,
): { args: string[]; stdin: string } {
  if (kind === "claude") {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
    ];
    if (maxUsd != null) {
      args.push("--max-budget-usd", String(Math.max(0, maxUsd)));
    }
    return { args, stdin: prompt };
  }
  return {
    args: ["exec", "--json", "--sandbox", "workspace-write", "-"],
    stdin: prompt,
  };
}

export async function detectAgents(): Promise<{
  claude: string | null;
  codex: string | null;
}> {
  return {
    claude: await resolveBinary(["claude"]),
    codex: await resolveBinary(["codex"]),
  };
}

/**
 * Spawn Claude Code or Codex against a dispatch markdown prompt.
 * Writes stdout/stderr under dispatch/ for the ledger.
 */
export async function spawnImplementer(args: {
  kind: AgentKind;
  promptPath: string;
  cwd: string;
  runDir: string;
  pieceId: string;
  round: number;
  dryRun?: boolean;
  timeoutMs?: number;
  /** Provider-side ceiling when supported (Claude Code). */
  maxUsd?: number;
}): Promise<SpawnResult & { logPath?: string }> {
  const prompt = await readFile(args.promptPath, "utf8");
  const invocation = buildAgentInvocation(args.kind, prompt, args.maxUsd);
  const outDir = path.join(args.runDir, "dispatch");
  await mkdir(outDir, { recursive: true });
  const logPath = path.join(
    outDir,
    `${args.pieceId}-r${args.round}-${args.kind}.log`,
  );

  if (args.dryRun) {
    const msg = `[dry-run] Would invoke ${args.kind} ${invocation.args.join(" ")} with prompt stdin from ${args.promptPath} (${prompt.length} chars)`;
    await writeFile(logPath, msg + "\n", "utf8");
    return {
      ok: true,
      command: args.kind,
      args: invocation.args,
      stdout: msg,
      stderr: "",
      code: 0,
      skipped: true,
      reason: "dry-run",
      logPath,
    };
  }

  const agents = await detectAgents();
  const bin = args.kind === "claude" ? agents.claude : agents.codex;
  if (!bin) {
    const reason = `${args.kind} CLI not found on PATH`;
    await writeFile(logPath, `${reason}\n`, "utf8");
    return {
      ok: false,
      command: args.kind,
      args: invocation.args,
      stdout: "",
      stderr: "",
      code: null,
      skipped: true,
      reason,
      logPath,
    };
  }
  const result = await runCmd(bin, invocation.args, {
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 600_000,
    stdin: invocation.stdin,
  });
  result.usage = parseAgentUsage(args.kind, result.stdout);

  await writeFile(
    logPath,
    [
      `# spawn ${args.kind}`,
      `command: ${result.command} ${result.args.join(" ")}`,
      `code: ${result.code}`,
      `usage: ${JSON.stringify(result.usage ?? null)}`,
      "",
      "## stdout",
      result.stdout,
      "",
      "## stderr",
      result.stderr,
      "",
    ].join("\n"),
    "utf8",
  );

  return { ...result, logPath };
}

export type ArtifactSnapshot = Record<string, string>;

const VISUAL_ARTIFACT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
]);

const TEXT_ARTIFACT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".txt",
  ".md",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".css",
  ".scss",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".vue",
  ".svelte",
]);

const VISUAL_SUPPORT_EXTENSIONS = new Set([
  ...VISUAL_ARTIFACT_EXTENSIONS,
  ".css",
  ".scss",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".vue",
  ".svelte",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

async function artifactFiles(root: string, dir = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      files.push(...(await artifactFiles(root, entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function artifactSignature(filePath: string): Promise<string> {
  const [contents, metadata] = await Promise.all([
    readFile(filePath),
    stat(filePath, { bigint: true }),
  ]);
  const hash = createHash("sha256").update(contents).digest("hex");
  return `${metadata.mtimeNs}:${metadata.size}:${hash}`;
}

export async function snapshotArtifacts(
  runDir: string,
  pieceId: string,
): Promise<ArtifactSnapshot> {
  const root = path.join(runDir, "artifacts", pieceId);
  const snapshot: ArtifactSnapshot = {};
  for (const filePath of await artifactFiles(root)) {
    snapshot[path.relative(root, filePath)] = await artifactSignature(filePath);
  }
  return snapshot;
}

export async function findArtifactAfterSpawn(
  runDir: string,
  pieceId: string,
  before: ArtifactSnapshot = {},
  kind: "image" | "text" = "text",
): Promise<string | null> {
  const root = path.join(runDir, "artifacts", pieceId);
  const files = await artifactFiles(root);
  const fresh = new Set<string>();
  for (const filePath of files) {
    const relative = path.relative(root, filePath);
    if (before[relative] !== (await artifactSignature(filePath))) {
      fresh.add(filePath);
    }
  }
  if (!fresh.size) return null;

  const renderable = files.filter((filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    return kind === "image"
      ? VISUAL_ARTIFACT_EXTENSIONS.has(extension)
      : TEXT_ARTIFACT_EXTENSIONS.has(extension);
  });
  const freshRenderable = renderable.filter((filePath) => fresh.has(filePath));
  const hasFreshVisualSupport =
    kind === "image" &&
    [...fresh].some((filePath) =>
      VISUAL_SUPPORT_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
    );
  const candidates = freshRenderable.length
    ? freshRenderable
    : hasFreshVisualSupport
      ? renderable
      : [];
  candidates.sort((a, b) => {
    const aFresh = fresh.has(a) ? 0 : 1;
    const bFresh = fresh.has(b) ? 0 : 1;
    const aIndex = path.basename(a).toLowerCase() === "index.html" ? 0 : 1;
    const bIndex = path.basename(b).toLowerCase() === "index.html" ? 0 : 1;
    return aFresh - bFresh || aIndex - bIndex || a.localeCompare(b);
  });
  return candidates[0] ?? null;
}
