import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

async function fileExists(p: string) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
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
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<SpawnResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
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
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
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
  const agents = await detectAgents();
  const bin = args.kind === "claude" ? agents.claude : agents.codex;
  if (!bin) {
    return {
      ok: false,
      command: args.kind,
      args: [],
      stdout: "",
      stderr: "",
      code: null,
      skipped: true,
      reason: `${args.kind} CLI not found on PATH`,
    };
  }

  const prompt = await readFile(args.promptPath, "utf8");
  const outDir = path.join(args.runDir, "dispatch");
  await mkdir(outDir, { recursive: true });
  const logPath = path.join(
    outDir,
    `${args.pieceId}-r${args.round}-${args.kind}.log`,
  );

  if (args.dryRun) {
    const msg = `[dry-run] Would invoke ${bin} with prompt ${args.promptPath} (${prompt.length} chars)`;
    await writeFile(logPath, msg + "\n", "utf8");
    return {
      ok: true,
      command: bin,
      args: ["(dry-run)"],
      stdout: msg,
      stderr: "",
      code: 0,
      skipped: true,
      reason: "dry-run",
      logPath,
    };
  }

  // Prefer non-interactive print/exec modes. Flags vary by CLI version —
  // try known shapes; user can paste ORCHESTRATOR.md if spawn fails.
  let result: SpawnResult;
  if (args.kind === "claude") {
    const claudeArgs = ["-p", prompt, "--output-format", "json"];
    if (args.maxUsd != null) {
      claudeArgs.push("--max-budget-usd", String(Math.max(0, args.maxUsd)));
    }
    result = await runCmd(bin, claudeArgs, {
      cwd: args.cwd,
      timeoutMs: args.timeoutMs ?? 600_000,
    });
    // Fallback older flag set
    if (!result.ok && /unknown|unrecognized/i.test(result.stderr)) {
      result = await runCmd(bin, ["-p", prompt], {
        cwd: args.cwd,
        timeoutMs: args.timeoutMs ?? 600_000,
      });
    }
  } else {
    result = await runCmd(bin, ["exec", "--json", prompt], {
      cwd: args.cwd,
      timeoutMs: args.timeoutMs ?? 600_000,
    });
    if (
      !result.ok &&
      /unknown|unrecognized|usage/i.test(result.stderr + result.stdout)
    ) {
      result = await runCmd(bin, ["--quiet", prompt], {
        cwd: args.cwd,
        timeoutMs: args.timeoutMs ?? 600_000,
      });
    }
  }
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

export async function findArtifactAfterSpawn(
  runDir: string,
  pieceId: string,
): Promise<string | null> {
  const candidates = [
    path.join(runDir, "artifacts", pieceId, "index.html"),
    path.join(runDir, "artifacts", pieceId, "artifact.html"),
    path.join(runDir, "artifacts", pieceId, "main.js"),
    path.join(runDir, "artifacts", pieceId, "App.tsx"),
  ];
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  return null;
}
