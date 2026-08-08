import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  writeBuilderDispatch,
  writeCriticDispatch,
  writeOrchestratorBrief,
} from "../adapters/dispatch.js";
import {
  type AgentKind,
  findArtifactAfterSpawn,
  spawnImplementer,
} from "../adapters/spawn.js";
import { visionBlindCritic } from "../adapters/vision-critic.js";
import { detectAgentEnv, writeAimPrompt } from "./aim-prompt.js";
import { writeContractFile } from "./apex/capture.js";
import { inferGoalType, proposeBars, validateBar } from "./bar.js";
import {
  emptyBudget,
  recordUsage,
  type UsageDelta,
  writeCheckpoint,
  writeWorkbench,
} from "./checkpoint.js";
import { composeSystemPrompt } from "./compose.js";
import {
  buildBlindCriticPrompt,
  heuristicCritic,
  mapBlindWinner,
  parseCriticJson,
  randomizePair,
} from "./critic.js";
import { decompose } from "./decompose.js";
import {
  copyEvidence,
  fetchTextEvidence,
  normalizeTextEvidence,
  type ScreenshotFn,
  screenshotUrl,
} from "./evidence/index.js";
import {
  ensureRunDir,
  readMeta,
  readPieces,
  runDir,
  writeBarJson,
  writeGoal,
  writeMeta,
  writePieces,
  writeProgress,
  writeVerdict,
} from "./ledger.js";
import { shouldContinue } from "./stop.js";
import type {
  BarCandidate,
  BuilderOutput,
  Measurable,
  Piece,
  RunMeta,
  Verdict,
} from "./types.js";

export type CreateRunOptions = {
  goal: string;
  bar: BarCandidate;
  cwd?: string;
  stack?: string;
  budget?: string;
  measurable?: Measurable;
  agentEnv?: "cursor" | "claude-code" | "codex" | "generic";
  implementer?: "codex" | "claude" | "cursor" | "local";
  mode?: "standard" | "apex";
  humanGates?: string[];
  safetyNever?: string[];
  acceptanceCriteria?: string[];
  maxUsd?: number;
  maxTokens?: number;
  previewUrl?: string;
  climbUntilHumanStop?: boolean;
  /** When true, skip network bar health (tests). */
  skipBarFetch?: boolean;
};

export type RoundHooks = {
  criticFn?: (
    prompt: string,
    limits: { maxTokens?: number; maxUsd?: number },
  ) => Promise<string | { raw: string; usage?: UsageDelta }>;
  visionCritic?: boolean;
  verdictFn?: (ctx: {
    piece: Piece;
    round: number;
    oursPath: string;
    barPath: string;
  }) => Promise<Verdict>;
  builderFn?: (args: {
    piece: Piece;
    gap: string | null;
    runDir: string;
    goal: string;
  }) => Promise<BuilderOutput>;
  maxRoundsPerPiece?: number;
  /** Write dispatch packets for external agents instead of local stub builder */
  dispatchOnly?: boolean;
  /** After writing dispatch, spawn Claude/Codex CLI */
  spawnAgent?: boolean;
  spawnKind?: AgentKind;
  spawnDryRun?: boolean;
  spawnTimeoutMs?: number;
  screenshotFn?: ScreenshotFn;
};

function isVisualEvidencePath(filePath: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

function remainingUsageLimits(meta: RunMeta): {
  maxTokens?: number;
  maxUsd?: number;
} {
  const budget = meta.budgetState;
  return {
    maxTokens:
      budget?.maxTokens != null
        ? Math.max(0, budget.maxTokens - budget.usedTokens)
        : undefined,
    maxUsd:
      budget?.maxUsd != null
        ? Math.max(0, budget.maxUsd - budget.usedUsd)
        : undefined,
  };
}

async function accountModelUsage(args: {
  dir: string;
  pieces: Piece[];
  source: string;
  usage?: UsageDelta;
}): Promise<RunMeta> {
  const latest = await readMeta(args.dir);
  const budget = latest.budgetState ?? emptyBudget();
  const hasCap = budget.maxTokens != null || budget.maxUsd != null;

  if (args.usage) {
    const missingRequiredUsage =
      (budget.maxTokens != null && args.usage.tokens == null) ||
      (budget.maxUsd != null && args.usage.usd == null);
    latest.budgetState = recordUsage(
      budget,
      args.usage.tokens ?? 0,
      args.usage.usd ?? 0,
    );
    if (missingRequiredUsage) {
      latest.budgetState.exhausted = true;
      latest.budgetState.accountingError =
        `${args.source} did not report required ` +
        `${budget.maxTokens != null && args.usage.tokens == null ? "token" : "cost"} usage`;
    }
  } else {
    latest.budgetState = {
      ...budget,
      exhausted: hasCap,
      accountingError: `${args.source} usage unavailable`,
    };
  }

  if (latest.budgetState.exhausted && latest.status !== "stopped_by_user") {
    latest.status = "budget_exhausted";
  }
  latest.updatedAt = new Date().toISOString();
  await writeMeta(args.dir, latest);
  const persisted = await readMeta(args.dir);
  await writeProgress(args.dir, persisted, args.pieces);
  await writeWorkbench(args.dir, persisted, args.pieces);
  return persisted;
}

export async function propose(goal: string) {
  const goalType = inferGoalType(goal);
  const bars = proposeBars(goal, goalType);
  return { goalType, bars };
}

export async function createRun(opts: CreateRunOptions): Promise<{
  runId: string;
  dir: string;
  meta: RunMeta;
  pieces: Piece[];
  aimPrompt: string;
  systemPrompt: string;
}> {
  const cwd = opts.cwd ?? process.cwd();
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const dir = await ensureRunDir(runId, cwd);
  const goalType = inferGoalType(opts.goal);
  const agentEnv = opts.agentEnv ?? detectAgentEnv();
  const mode = opts.mode ?? "standard";
  const implementer =
    opts.implementer ??
    (agentEnv === "codex"
      ? "codex"
      : agentEnv === "claude-code"
        ? "claude"
        : agentEnv === "cursor"
          ? "cursor"
          : "local");

  let barValidation;
  if (opts.skipBarFetch) {
    barValidation = {
      named: true,
      fetchable: true,
      comparable: true,
      ok: true,
      reasons: [] as string[],
      contentType: "local" as const,
    };
  } else {
    barValidation = await validateBar(opts.bar, { runDir: dir });
  }

  const meta: RunMeta = {
    id: runId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: barValidation.ok ? "proposed" : "failed_bar",
    goal: opts.goal,
    goalType,
    bar: opts.bar,
    barValidation,
    stack: opts.stack,
    budget: opts.budget,
    agentEnv,
    implementer,
    mode,
    measurable: opts.measurable,
    humanGates: opts.humanGates,
    safetyNever: opts.safetyNever,
    acceptanceCriteria: opts.acceptanceCriteria,
    budgetState: emptyBudget(opts.maxUsd, opts.maxTokens),
    previewUrl: opts.previewUrl,
    climbUntilHumanStop: opts.climbUntilHumanStop ?? mode === "apex",
  };

  const pieces = decompose(opts.goal, goalType);
  await writeGoal(dir, opts.goal);
  await writeMeta(dir, meta);
  await writePieces(dir, pieces);
  await writeBarJson(dir, { bar: opts.bar, validation: barValidation });
  await writeProgress(dir, meta, pieces);
  await writeWorkbench(dir, meta, pieces);

  const aimPrompt = writeAimPrompt({
    goal: opts.goal,
    barName: opts.bar.name,
    barUrl: opts.bar.url,
    measurable: opts.measurable,
    budget: opts.budget,
    stack: opts.stack,
    agentEnv,
  });
  await writeFile(path.join(dir, "aim-prompt.md"), aimPrompt + "\n", "utf8");

  const systemPrompt = composeSystemPrompt({
    goal: opts.goal,
    barName: opts.bar.name,
    barUrl: opts.bar.url,
    measurable: opts.measurable,
    budget: opts.budget,
    stack: opts.stack,
    agentEnv,
    implementer,
    mode,
    humanGates: opts.humanGates,
    safetyNever: opts.safetyNever,
    acceptanceCriteria: opts.acceptanceCriteria,
    derived: !opts.acceptanceCriteria?.length,
    fanOutParallel: pieces.map((p) => p.name),
  });
  await writeFile(
    path.join(dir, "ORCHESTRATOR.md"),
    systemPrompt + "\n",
    "utf8",
  );
  await writeOrchestratorBrief(dir, systemPrompt);

  if (mode === "apex") {
    await writeContractFile(dir, {
      goal: opts.goal,
      barName: opts.bar.name,
      stack: opts.stack ?? (goalType === "game" ? "Three.js" : "project stack"),
      pieces: pieces.map((p) => p.name),
      previewUrl: opts.previewUrl,
    });
  }

  await writeCheckpoint(dir, {
    runId,
    savedAt: new Date().toISOString(),
    pieceId: pieces[0]?.id ?? null,
    round: 0,
    note: "created",
  });

  return { runId, dir, meta, pieces, aimPrompt, systemPrompt };
}

async function defaultBuilder(args: {
  piece: Piece;
  gap: string | null;
  runDir: string;
  goal: string;
}): Promise<BuilderOutput> {
  const outDir = path.join(args.runDir, "artifacts", args.piece.id);
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, "artifact.html");
  const gapLine = args.gap
    ? `<p data-gap>${escape(args.gap)}</p>`
    : "<p>Initial build.</p>";
  // Grow content each round so heuristic critic can eventually prefer ours
  const roundBoost = "x".repeat(Math.min(2000, 80 * (args.piece.round + 1)));
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escape(args.piece.name)}</title>
<style>
  body{font-family:system-ui;background:#0b0d10;color:#e8eaed;margin:0}
  .hero{min-height:70vh;display:grid;place-items:center;background:linear-gradient(160deg,#102418,#0b0d10 60%)}
  h1{font-size:clamp(2rem,6vw,4rem);letter-spacing:-0.03em}
  .meta{opacity:.7;padding:2rem}
</style></head>
<body>
  <section class="hero"><h1>${escape(args.piece.name)}</h1></section>
  <div class="meta">
    <p>Goal: ${escape(args.goal)}</p>
    ${gapLine}
    <!-- density:${roundBoost} -->
  </div>
</body></html>`;
  await writeFile(file, html, "utf8");
  return { artifactPath: file, openAs: `file://${file}` };
}

function escape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function captureBarEvidence(
  meta: RunMeta,
  dir: string,
  pieceId: string,
  round: number,
  screenshotFn: ScreenshotFn,
): Promise<{ path: string; kind: "image" | "text" }> {
  const base = path.join(dir, "evidence", pieceId, `round-${round}`);
  await mkdir(base, { recursive: true });
  const barOut = path.join(base, "bar.png");
  if (!meta.bar.url) throw new Error("Bar has no URL for evidence capture.");

  if (
    meta.goalType === "writing" ||
    meta.goalType === "research" ||
    meta.goalType === "code"
  ) {
    const t = await fetchTextEvidence(meta.bar.url, path.join(base, "bar.txt"));
    return { path: t.path, kind: "text" };
  }

  const shot = await screenshotFn(meta.bar.url, barOut, {
    width: 1440,
    height: 900,
  });
  if (!isVisualEvidencePath(shot.path)) {
    throw new Error("Bar visual evidence is not an image.");
  }
  return { path: shot.path, kind: "image" };
}

async function captureOursEvidence(
  artifactPath: string,
  meta: RunMeta,
  dir: string,
  pieceId: string,
  round: number,
  kind: "image" | "text",
  screenshotFn: ScreenshotFn,
): Promise<string> {
  const base = path.join(dir, "evidence", pieceId, `round-${round}`);
  await mkdir(base, { recursive: true });
  if (kind === "text") {
    const dest = path.join(base, "ours.txt");
    const text = normalizeTextEvidence(await readFile(artifactPath, "utf8"));
    if (!text) {
      throw new Error("Candidate text evidence is empty after normalization.");
    }
    await writeFile(dest, text, "utf8");
    return dest;
  }

  if (isVisualEvidencePath(artifactPath)) {
    const ext = path.extname(artifactPath).toLowerCase();
    const dest = path.join(base, `ours${ext}`);
    await copyEvidence(artifactPath, dest);
    return dest;
  }

  const renderUrl =
    meta.previewUrl ??
    (artifactPath.toLowerCase().endsWith(".html")
      ? pathToFileURL(artifactPath).href
      : undefined);
  if (!renderUrl) {
    throw new Error(
      `No renderable visual evidence for ${artifactPath}; provide previewUrl or an image artifact.`,
    );
  }
  const shot = await screenshotFn(renderUrl, path.join(base, "ours.png"), {
    width: 1440,
    height: 900,
  });
  if (!isVisualEvidencePath(shot.path)) {
    throw new Error("Candidate visual evidence is not an image.");
  }
  return shot.path;
}

export async function runLoop(
  runId: string,
  hooks: RoundHooks = {},
  cwd = process.cwd(),
): Promise<RunMeta> {
  const dir = runDir(runId, cwd);
  let meta = await readMeta(dir);
  let pieces = await readPieces(dir);
  if (meta.status === "failed_bar") {
    throw new Error(
      `Bar validation failed: ${(meta.barValidation?.reasons ?? []).join("; ")}`,
    );
  }
  if (meta.budgetState?.exhausted) {
    meta.status = "budget_exhausted";
    meta.updatedAt = new Date().toISOString();
    await writeMeta(dir, meta);
    meta = await readMeta(dir);
    await writeProgress(dir, meta, pieces);
    await writeWorkbench(dir, meta, pieces);
    return meta;
  }

  meta.status = "running";
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);

  const builder = hooks.builderFn ?? defaultBuilder;
  const screenshot: ScreenshotFn =
    hooks.screenshotFn ??
    ((url, outPath, viewport) =>
      screenshotUrl(url, outPath, viewport, { allowHtmlFallback: false }));

  for (const piece of pieces) {
    meta = await readMeta(dir);
    if (meta.budgetState?.exhausted) {
      meta.status = "budget_exhausted";
      meta.updatedAt = new Date().toISOString();
      await writeMeta(dir, meta);
      break;
    }
    if (!shouldContinue(meta)) break;
    if (piece.status === "won") continue;

    while (true) {
      meta = await readMeta(dir);
      if (meta.budgetState?.exhausted) {
        meta.status = "budget_exhausted";
        meta.updatedAt = new Date().toISOString();
        await writeMeta(dir, meta);
        break;
      }
      if (!shouldContinue(meta)) break;

      if (
        hooks.maxRoundsPerPiece != null &&
        piece.round >= hooks.maxRoundsPerPiece
      ) {
        piece.status = "stopped";
        piece.gap = `Demo maxRoundsPerPiece=${hooks.maxRoundsPerPiece} reached without a blind win.`;
        await writePieces(dir, pieces);
        meta.updatedAt = new Date().toISOString();
        await writeMeta(dir, meta);
        await writeProgress(dir, meta, pieces);
        await writeWorkbench(dir, meta, pieces);
        break;
      }

      piece.status = "building";
      piece.round += 1;
      await writePieces(dir, pieces);
      await writeProgress(dir, meta, pieces);
      await writeWorkbench(dir, meta, pieces);

      await writeBuilderDispatch({
        runDir: dir,
        meta,
        piece,
        gap: piece.gap,
      });

      let built: BuilderOutput;
      if (hooks.dispatchOnly && !hooks.spawnAgent) {
        const artifactPath = path.join(
          dir,
          "artifacts",
          piece.id,
          "WAITING_FOR_AGENT.md",
        );
        await mkdir(path.dirname(artifactPath), { recursive: true });
        await writeFile(
          artifactPath,
          `# Waiting for implementer\n\nSee \`dispatch/${piece.id}-r${piece.round}-builder.md\`.\n`,
          "utf8",
        );
        built = { artifactPath, openAs: artifactPath };
      } else if (hooks.spawnAgent) {
        const kind: AgentKind =
          hooks.spawnKind ??
          (meta.implementer === "codex"
            ? "codex"
            : meta.implementer === "claude"
              ? "claude"
              : meta.agentEnv === "codex"
                ? "codex"
                : "claude");
        const dispatchPath = path.join(
          dir,
          "dispatch",
          `${piece.id}-r${piece.round}-builder.md`,
        );
        const spawned = await spawnImplementer({
          kind,
          promptPath: dispatchPath,
          cwd: cwd,
          runDir: dir,
          pieceId: piece.id,
          round: piece.round,
          dryRun: hooks.spawnDryRun,
          timeoutMs: hooks.spawnTimeoutMs,
          maxUsd: remainingUsageLimits(meta).maxUsd,
        });
        if (!spawned.skipped) {
          meta = await accountModelUsage({
            dir,
            pieces,
            source: `${kind} builder`,
            usage: spawned.usage,
          });
          if (!shouldContinue(meta)) {
            piece.status = "pending";
            await writePieces(dir, pieces);
            break;
          }
        }
        const found = await findArtifactAfterSpawn(dir, piece.id);
        if (found) {
          built = { artifactPath: found, openAs: `file://${found}` };
        } else if (hooks.spawnDryRun || spawned.skipped) {
          built = await builder({
            piece,
            gap: piece.gap,
            runDir: dir,
            goal: meta.goal,
          });
        } else {
          // Spawn ran but no artifact — fall back to local builder so loop can continue
          built = await builder({
            piece,
            gap: piece.gap,
            runDir: dir,
            goal: meta.goal,
          });
          built.notes = `spawn ${kind} code=${spawned.code}; fallback local builder. log=${spawned.logPath ?? "?"}`;
        }
      } else {
        built = await builder({
          piece,
          gap: piece.gap,
          runDir: dir,
          goal: meta.goal,
        });
      }
      piece.artifactPath = built.artifactPath;
      piece.openAs = built.openAs;

      piece.status = "critiquing";
      await writePieces(dir, pieces);
      await writeProgress(dir, meta, pieces);

      const barEv = await captureBarEvidence(
        meta,
        dir,
        piece.id,
        piece.round,
        screenshot,
      );
      const oursPath = await captureOursEvidence(
        built.artifactPath,
        meta,
        dir,
        piece.id,
        piece.round,
        barEv.kind,
        screenshot,
      );

      const blindDir = path.join(
        dir,
        "evidence",
        piece.id,
        `round-${piece.round}`,
        "blind",
      );
      await mkdir(blindDir, { recursive: true });
      const oursExt =
        path.extname(oursPath) || (barEv.kind === "text" ? ".txt" : ".png");
      const barExt =
        path.extname(barEv.path) || (barEv.kind === "text" ? ".txt" : ".png");
      const unlabeledOurs = path.join(
        blindDir,
        `candidate-${randomUUID()}${oursExt}`,
      );
      const unlabeledBar = path.join(
        blindDir,
        `candidate-${randomUUID()}${barExt}`,
      );
      await copyEvidence(oursPath, unlabeledOurs);
      await copyEvidence(barEv.path, unlabeledBar);
      const pair = randomizePair(unlabeledOurs, unlabeledBar, barEv.kind);
      const prompt =
        pair.kind === "text"
          ? buildBlindCriticPrompt(pair, piece.name, {
              leftText: await readFile(pair.leftPath, "utf8"),
              rightText: await readFile(pair.rightPath, "utf8"),
            })
          : buildBlindCriticPrompt(pair, piece.name);
      const criticPromptPath = path.join(
        dir,
        "evidence",
        piece.id,
        `round-${piece.round}`,
        "critic-prompt.txt",
      );
      await writeFile(criticPromptPath, prompt, "utf8");
      await writeCriticDispatch({
        runDir: dir,
        piece,
        criticPromptPath,
        leftPath: pair.leftPath,
        rightPath: pair.rightPath,
      });

      let verdict: Verdict;
      let haltAfterVerdict = false;
      if (hooks.verdictFn) {
        verdict = await hooks.verdictFn({
          piece,
          round: piece.round,
          oursPath,
          barPath: barEv.path,
        });
      } else if (hooks.visionCritic && pair.kind === "image") {
        if (
          !isVisualEvidencePath(pair.leftPath) ||
          !isVisualEvidencePath(pair.rightPath)
        ) {
          throw new Error("Vision critic requires two image evidence files.");
        }
        if (!process.env.OPENROUTER_API_KEY) {
          throw new Error(
            "Vision critic requested but OPENROUTER_API_KEY is unset.",
          );
        }
        try {
          const v = await visionBlindCritic({
            leftPath: pair.leftPath,
            rightPath: pair.rightPath,
            pieceName: piece.name,
            maxTokens: remainingUsageLimits(meta).maxTokens,
          });
          meta = await accountModelUsage({
            dir,
            pieces,
            source: "vision critic",
            usage: v.usage,
          });
          haltAfterVerdict = !shouldContinue(meta);
          verdict = {
            winner: mapBlindWinner(v.winner, pair.leftIsOurs),
            gap: v.gap,
            confidence: v.confidence,
            note: "vision-critic",
          };
        } catch (err) {
          meta = await accountModelUsage({
            dir,
            pieces,
            source: "vision critic",
          });
          throw new Error(
            `Vision critic failed closed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else if (hooks.criticFn) {
        const result = await hooks.criticFn(prompt, remainingUsageLimits(meta));
        const raw = typeof result === "string" ? result : result.raw;
        meta = await accountModelUsage({
          dir,
          pieces,
          source: "text critic",
          usage: typeof result === "string" ? undefined : result.usage,
        });
        haltAfterVerdict = !shouldContinue(meta);
        const parsed = parseCriticJson(raw);
        verdict = {
          winner: mapBlindWinner(parsed.winner, pair.leftIsOurs),
          gap: parsed.gap,
          confidence: parsed.confidence,
        };
      } else {
        verdict = await heuristicCritic(pair, meta.measurable);
      }

      await writeVerdict(dir, piece.id, piece.round, verdict);
      piece.lastVerdict = verdict.winner;
      piece.gap = verdict.winner === "bar" ? verdict.gap : null;

      await writeCheckpoint(dir, {
        runId,
        savedAt: new Date().toISOString(),
        pieceId: piece.id,
        round: piece.round,
        note: `verdict=${verdict.winner}`,
      });

      if (haltAfterVerdict) {
        piece.status =
          meta.status === "stopped_by_user" ? "stopped" : "pending";
        await writePieces(dir, pieces);
        await writeProgress(dir, meta, pieces);
        await writeWorkbench(dir, meta, pieces);
        break;
      }

      if (verdict.winner === "ours") {
        piece.status = "won";
        await writePieces(dir, pieces);
        meta.updatedAt = new Date().toISOString();
        await writeMeta(dir, meta);
        await writeProgress(dir, meta, pieces);
        await writeWorkbench(dir, meta, pieces);
        break;
      }

      piece.status = "pending";
      await writePieces(dir, pieces);
      meta.updatedAt = new Date().toISOString();
      await writeMeta(dir, meta);
      await writeProgress(dir, meta, pieces);
      await writeWorkbench(dir, meta, pieces);
    }
  }

  meta = await readMeta(dir);
  pieces = await readPieces(dir);
  if (meta.status === "running") {
    const allWon = pieces.every((p) => p.status === "won");
    const anyStopped = pieces.some((p) => p.status === "stopped");
    if (allWon && meta.climbUntilHumanStop) {
      // Apex climb: cleared once — human/budget is the real brake
      await writeFile(
        path.join(dir, "CLIMB.md"),
        `# Climb mode\n\nAll pieces won one blind pass against the bar.\nBar may still be above shipped quality (see apex-gp ~67/100).\nRun \`gauntlet stop\` when good enough, or \`gauntlet resume\` after resetting pieces to keep climbing.\n`,
        "utf8",
      );
      // Stay running until human stop — mark completed for ledger practicality
      // but leave climb flag documented. Prefer completed so CLI exits cleanly;
      // user resumes for another wave.
      meta.status = "completed";
    } else if (allWon) meta.status = "completed";
    else if (anyStopped) meta.status = "stopped_by_user";
  }
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  await writeProgress(dir, meta, pieces);
  await writeWorkbench(dir, meta, pieces);
  return meta;
}
