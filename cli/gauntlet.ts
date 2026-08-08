#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { openRouterCriticWithUsage } from "../adapters/openrouter.js";
import { portableVerbs } from "../adapters/verbs.js";
import { detectAgentEnv } from "../runtime/aim-prompt.js";
import { captureNamedShots, compareFrames } from "../runtime/apex/capture.js";
import {
  inferGoalType,
  isVagueName,
  proposeBars,
  validateBar,
} from "../runtime/bar.js";
import { resumeRun } from "../runtime/checkpoint.js";
import { composeSystemPrompt } from "../runtime/compose.js";
import {
  findActiveRunId,
  readMeta,
  readPieces,
  renderProgress,
  runDir,
} from "../runtime/ledger.js";
import { createRun, propose, runLoop } from "../runtime/runner.js";
import { stopRun } from "../runtime/stop.js";
import type { BarCandidate } from "../runtime/types.js";

const program = new Command();

program
  .name("gauntlet")
  .description(
    "Gauntlet Runtime — quality loops that beat a real bar. Not a multi-model chat.",
  )
  .version("0.2.0");

function resolveBar(
  goal: string,
  barOpt: string,
  barName?: string,
): BarCandidate {
  const goalType = inferGoalType(goal);
  const proposed = proposeBars(goal, goalType);
  if (/^[abc]$/i.test(barOpt)) {
    const bar = proposed.find((b) => b.id === barOpt.toLowerCase());
    if (!bar) throw new Error("Unknown bar id");
    return bar;
  }
  if (/^https?:\/\//i.test(barOpt)) {
    return {
      id: "custom",
      name: barName ?? barOpt,
      url: barOpt,
    };
  }
  const bar = proposed.find(
    (b) =>
      b.name.toLowerCase().includes(barOpt.toLowerCase()) || b.id === barOpt,
  );
  if (!bar?.url) throw new Error("Could not resolve named fetchable bar");
  return bar;
}

program
  .command("propose")
  .description("Propose 2–3 named bars for a goal (then stop)")
  .argument("<goal...>", "What you want to build")
  .option("--json", "Print JSON only")
  .action(async (goalParts: string[], opts: { json?: boolean }) => {
    const goal = goalParts.join(" ");
    const { goalType, bars } = await propose(goal);
    if (opts.json) {
      console.log(JSON.stringify({ goal, goalType, bars }, null, 2));
      return;
    }
    console.log(`Goal type: ${goalType}\n`);
    console.log("Pick a bar (named / fetchable / comparable):");
    for (const b of bars) {
      console.log(`  [${b.id}] ${b.name}${b.url ? `\n      ${b.url}` : ""}`);
    }
    console.log(
      `\nNext: gauntlet run --bar <id|url> --goal "${goal}"\n     or: gauntlet compose --bar a --goal "..."`,
    );
    console.log(`Agent verbs: ${portableVerbs(detectAgentEnv())}`);
  });

program
  .command("compose")
  .description(
    "Emit Spisak-shaped orchestrator system prompt (paste into Claude/Codex) — does not execute",
  )
  .requiredOption("--goal <goal>", "Goal or path note")
  .requiredOption("--bar <idOrUrl>", "Bar id or URL")
  .option("--bar-name <name>", "Bar name when URL")
  .option("--stack <stack>", "Stack")
  .option("--agent <env>", "cursor | claude-code | codex | generic")
  .option("--implementer <who>", "codex | claude | cursor | local")
  .option("--mode <mode>", "standard | apex", "standard")
  .option("--criterion <c>", "Acceptance criterion (repeatable)", collect, [])
  .option("--gate <g>", "Human gate (repeatable)", collect, [])
  .action(async (opts) => {
    const goal = opts.goal as string;
    const bar = resolveBar(goal, opts.bar as string, opts.barName as string);
    if (isVagueName(bar.name)) {
      console.error("Refuse vague bar name.");
      process.exit(1);
    }
    const agentEnv =
      (opts.agent as "cursor" | "claude-code" | "codex" | "generic") ??
      detectAgentEnv();
    const text = composeSystemPrompt({
      goal,
      barName: bar.name,
      barUrl: bar.url,
      stack: opts.stack as string | undefined,
      agentEnv,
      implementer: opts.implementer as
        "codex" | "claude" | "cursor" | "local" | undefined,
      mode: opts.mode as "standard" | "apex",
      acceptanceCriteria: opts.criterion as string[],
      humanGates: opts.gate as string[],
      derived: !(opts.criterion as string[]).length,
    });
    console.log(text);
  });

program
  .command("run")
  .description("Validate bar, create ledger, run builder↔critic loop")
  .requiredOption("--goal <goal>", "Goal text")
  .option("--bar <idOrUrl>", "Bar id from propose (a|b|c) or a full URL")
  .option("--bar-name <name>", "Bar display name when --bar is a URL")
  .option("--stack <stack>", "Stack constraint")
  .option("--budget <budget>", "Human-readable budget line")
  .option("--max-usd <n>", "Hard USD budget gate")
  .option("--max-tokens <n>", "Hard token budget gate")
  .option("--metric <metric>", "Measurable metric name")
  .option("--target <target>", "Measurable target value")
  .option("--ours-metric <value>", "Current measurable value for ours")
  .option("--agent <env>", "cursor | claude-code | codex | generic")
  .option("--implementer <who>", "codex | claude | cursor | local")
  .option("--mode <mode>", "standard | apex", "standard")
  .option("--preview-url <url>", "Local preview for apex shots")
  .option("--climb", "Apex climb: human/budget is the real brake")
  .option(
    "--dispatch-only",
    "Write agent dispatch packets; skip local stub builder",
  )
  .option(
    "--spawn-agent",
    "Spawn Claude/Codex CLI from dispatch (falls back to local builder)",
  )
  .option("--spawn-dry", "Dry-run spawn (log only; uses local builder)")
  .option("--spawn-timeout <ms>", "Spawn timeout ms", "600000")
  .option("--llm-critic", "Use OpenRouter text critic")
  .option("--vision-critic", "Use OpenRouter vision critic on screenshots")
  .option(
    "--no-auto-vision",
    "Do not auto-enable vision when OPENROUTER_API_KEY is set",
  )
  .option("--max-rounds <n>", "DEMO/SAFETY ONLY — caps rounds per piece")
  .option("--skip-bar-fetch", "Skip network bar health (tests only)")
  .option("--cwd <dir>", "Working directory", process.cwd())
  .action(async (opts) => {
    const goal = opts.goal as string;
    if (!opts.bar) {
      console.error('Pass --bar <a|b|c|url>. First: gauntlet propose "…"');
      process.exit(1);
    }
    const bar = resolveBar(goal, opts.bar as string, opts.barName as string);
    const measurable =
      opts.metric && opts.target
        ? {
            metric: opts.metric as string,
            target: opts.target as string,
            ours: opts.oursMetric as string | undefined,
          }
        : undefined;

    const { runId, dir, meta, aimPrompt, systemPrompt } = await createRun({
      goal,
      bar,
      cwd: opts.cwd as string,
      stack: opts.stack as string | undefined,
      budget: opts.budget as string | undefined,
      measurable,
      agentEnv:
        (opts.agent as "cursor" | "claude-code" | "codex" | "generic") ??
        detectAgentEnv(),
      implementer: opts.implementer as
        "codex" | "claude" | "cursor" | "local" | undefined,
      mode: opts.mode as "standard" | "apex",
      maxUsd: opts.maxUsd ? Number(opts.maxUsd) : undefined,
      maxTokens: opts.maxTokens ? Number(opts.maxTokens) : undefined,
      previewUrl: opts.previewUrl as string | undefined,
      climbUntilHumanStop: Boolean(opts.climb) || opts.mode === "apex",
      skipBarFetch: Boolean(opts.skipBarFetch),
    });

    console.log(`Run: ${runId}\nDir: ${dir}`);
    if (!meta.barValidation?.ok) {
      console.error("Bar health check FAILED — refusing.");
      console.error((meta.barValidation?.reasons ?? []).join("\n"));
      process.exit(2);
    }
    console.log("\n--- aim prompt ---\n" + aimPrompt + "\n--- end ---");
    console.log(`Orchestrator brief: ${path.join(dir, "ORCHESTRATOR.md")}`);
    if (meta.mode === "apex") {
      console.log(`CONTRACT: ${path.join(dir, "CONTRACT.md")}`);
    }

    if (opts.dispatchOnly && !opts.spawnAgent) {
      console.log(
        "\nDispatch-only: packets under dispatch/. Paste ORCHESTRATOR.md into Claude/Codex.",
      );
      console.log(systemPrompt.slice(0, 400) + "…");
      return;
    }

    const autoVision =
      Boolean(process.env.OPENROUTER_API_KEY) && opts.autoVision !== false;
    const hooks: Parameters<typeof runLoop>[1] = {
      visionCritic: Boolean(opts.visionCritic) || autoVision,
      dispatchOnly: Boolean(opts.dispatchOnly),
      spawnAgent: Boolean(opts.spawnAgent),
      spawnDryRun: Boolean(opts.spawnDry),
      spawnTimeoutMs: opts.spawnTimeout ? Number(opts.spawnTimeout) : undefined,
      spawnKind:
        meta.implementer === "codex" || meta.agentEnv === "codex"
          ? "codex"
          : "claude",
    };
    if (hooks.visionCritic && !opts.visionCritic && autoVision) {
      console.log("Auto vision critic: OPENROUTER_API_KEY detected.");
    }
    if (opts.maxRounds) hooks.maxRoundsPerPiece = Number(opts.maxRounds);
    if (opts.llmCritic)
      hooks.criticFn = (prompt, limits) =>
        openRouterCriticWithUsage(prompt, { maxTokens: limits.maxTokens });

    const final = await runLoop(runId, hooks, opts.cwd as string);
    const pieces = await readPieces(dir);
    console.log(renderProgress(final, pieces));
    console.log(`progress: ${path.join(dir, "progress.md")}`);
    console.log(`workbench: ${path.join(dir, "workbench.md")}`);
  });

program
  .command("resume")
  .description("Resume a stopped / incomplete run")
  .argument("[runId]", "Run id")
  .option("--cwd <dir>", "Working directory", process.cwd())
  .option("--llm-critic", "OpenRouter critic")
  .option("--vision-critic", "Vision critic")
  .option("--max-rounds <n>", "Demo safety cap")
  .action(async (runId: string | undefined, opts) => {
    const id = runId ?? (await findActiveRunId(opts.cwd as string));
    if (!id) {
      console.error("No run to resume.");
      process.exit(1);
    }
    await resumeRun(id, opts.cwd as string);
    const hooks: Parameters<typeof runLoop>[1] = {
      visionCritic: Boolean(opts.visionCritic),
    };
    if (opts.maxRounds) hooks.maxRoundsPerPiece = Number(opts.maxRounds);
    if (opts.llmCritic)
      hooks.criticFn = (prompt, limits) =>
        openRouterCriticWithUsage(prompt, { maxTokens: limits.maxTokens });
    const final = await runLoop(id, hooks, opts.cwd as string);
    console.log(renderProgress(final, await readPieces(runDir(id, opts.cwd))));
  });

program
  .command("status")
  .description("Show live progress for a run")
  .argument("[runId]", "Run id (defaults to latest active)")
  .option("--cwd <dir>", "Working directory", process.cwd())
  .option("--json", "Print meta + pieces JSON")
  .action(async (runId: string | undefined, opts) => {
    const id = runId ?? (await findActiveRunId(opts.cwd as string));
    if (!id) {
      console.error("No runs found.");
      process.exit(1);
    }
    const dir = runDir(id, opts.cwd as string);
    const meta = await readMeta(dir);
    const pieces = await readPieces(dir);
    if (opts.json) {
      console.log(JSON.stringify({ meta, pieces }, null, 2));
      return;
    }
    console.log(renderProgress(meta, pieces));
    console.log(`\nLedger: ${dir}`);
  });

program
  .command("stop")
  .description("Human brake — mark run stopped_by_user")
  .argument("[runId]", "Run id")
  .option("--cwd <dir>", "Working directory", process.cwd())
  .action(async (runId: string | undefined, opts) => {
    const meta = await stopRun(runId, opts.cwd as string);
    console.log(`Stopped: ${meta.id} → ${meta.status}`);
  });

program
  .command("validate-bar")
  .description("Run the three bar tests against a URL")
  .requiredOption("--name <name>", "Named reference")
  .requiredOption("--url <url>", "Fetchable URL")
  .option("--cwd <dir>", "Working directory", process.cwd())
  .action(async (opts) => {
    const bar: BarCandidate = {
      id: "check",
      name: opts.name as string,
      url: opts.url as string,
    };
    const tmp = path.join(opts.cwd as string, "runs", "_bar-check");
    const v = await validateBar(bar, { runDir: tmp });
    console.log(JSON.stringify(v, null, 2));
    process.exit(v.ok ? 0 : 2);
  });

program
  .command("shot")
  .description("Apex-style named screenshot capture of a URL")
  .requiredOption("--url <url>", "Page URL (local preview or bar)")
  .option("--out <dir>", "Output directory", "shots")
  .action(async (opts) => {
    const results = await captureNamedShots({
      url: opts.url as string,
      outDir: opts.out as string,
    });
    console.log(JSON.stringify(results, null, 2));
  });

program
  .command("compare")
  .description("Compare two frames (hash smoke or --grid edge-energy)")
  .argument("<a>", "Image A (PNG for --grid)")
  .argument("<b>", "Image B (PNG for --grid)")
  .option(
    "--grid [n]",
    "Apex-style grid edge-energy compare (default 6 when flag present)",
  )
  .option("--out <path>", "Write markdown report path")
  .action(async (a: string, b: string, opts) => {
    if (opts.grid !== undefined) {
      const { compareFramesGrid, writeCompareReport } =
        await import("../runtime/apex/compare.js");
      const grid = Number(opts.grid === true ? 6 : opts.grid);
      const result = await compareFramesGrid(a, b, { grid });
      console.log(JSON.stringify(result, null, 2));
      console.log(result.note);
      if (opts.out) await writeCompareReport(opts.out as string, result);
      process.exit(result.regression ? 2 : 0);
    }
    console.log(JSON.stringify(await compareFrames(a, b), null, 2));
  });

program
  .command("doctor")
  .description("Check CLIs, keys, and Playwright readiness for testing")
  .action(async () => {
    const { detectAgents } = await import("../adapters/spawn.js");
    const agents = await detectAgents();
    const report = {
      claude: agents.claude ?? "(missing)",
      codex: agents.codex ?? "(missing)",
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? "set" : "missing",
      GAUNTLET_WEB_TOKEN: process.env.GAUNTLET_WEB_TOKEN
        ? "set"
        : "optional/unset",
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY
        ? "set"
        : "missing (checkout placeholder)",
      STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO ?? "(placeholder)",
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET
        ? "set"
        : "missing",
      playwright: "installed as npm dep — run: npx playwright install chromium",
      tips: [
        "Vision critic: export OPENROUTER_API_KEY=… then gauntlet run --vision-critic",
        "Spawn: gauntlet run --spawn-agent --spawn-dry  (safe) or --spawn-agent (live tokens)",
        "Compare: gauntlet compare a.png b.png --grid 6",
        "Web auth: export GAUNTLET_WEB_TOKEN=… and send Authorization: Bearer …",
      ],
    };
    console.log(JSON.stringify(report, null, 2));
    const ready =
      Boolean(agents.claude || agents.codex) ||
      Boolean(process.env.OPENROUTER_API_KEY);
    process.exit(ready ? 0 : 1);
  });

program
  .command("demo")
  .description("End-to-end demo: athletic landing page vs live named bar")
  .option("--bar-url <url>", "Live bar URL", "https://example.com")
  .option("--bar-name <name>", "Bar name", "example.com (fetchable demo bar)")
  .option("--live-nike", "Use Nike running as bar")
  .option("--llm-critic", "Use OpenRouter critic")
  .option("--cwd <dir>", "Working directory", process.cwd())
  .action(async (opts) => {
    const goal =
      "a dark athletic landing page for a running brand. pieces: hero, typography, color";
    const bar: BarCandidate = opts.liveNike
      ? {
          id: "a",
          name: "Nike running campaign page",
          url: "https://www.nike.com/running",
        }
      : {
          id: "demo",
          name: opts.barName as string,
          url: opts.barUrl as string,
        };

    const { runId, dir, meta, aimPrompt } = await createRun({
      goal,
      bar,
      cwd: opts.cwd as string,
      stack: "HTML/CSS",
      agentEnv: detectAgentEnv(),
      mode: "standard",
    });

    if (!meta.barValidation?.ok) {
      console.error("Bar health check failed — demo refuses.");
      process.exit(2);
    }

    console.log(`Run ${runId}\n${aimPrompt}\n`);

    const hooks: Parameters<typeof runLoop>[1] = {
      maxRoundsPerPiece: 5,
      builderFn: async ({ piece, gap, runDir }) => {
        const { mkdir, writeFile } = await import("node:fs/promises");
        const outDir = path.join(runDir, "artifacts", piece.id);
        await mkdir(outDir, { recursive: true });
        const file = path.join(outDir, "index.html");
        const improved = Boolean(gap);
        await writeFile(
          file,
          `<!doctype html><html><head><meta charset="utf-8"/><title>Night Mile</title>
<style>body{margin:0;background:#07090b;color:#f2f4f6;font-family:system-ui}
.hero{min-height:100vh;display:grid;align-content:end;padding:8vw;background:radial-gradient(ellipse at 20% 0%,#1a3a28,transparent 50%),#07090b}
h1{font-size:clamp(3rem,10vw,7rem);letter-spacing:-.04em}</style></head>
<body><section class="hero"><h1>Run after dark.</h1>
<p>${improved ? "Reflective kit. Built against a real bar." : "Initial pass."}</p>
</section></body></html>`,
          "utf8",
        );
        return { artifactPath: file, openAs: `file://${file}` };
      },
    };

    if (opts.llmCritic) {
      hooks.criticFn = (prompt, limits) =>
        openRouterCriticWithUsage(prompt, { maxTokens: limits.maxTokens });
    } else {
      hooks.verdictFn = async ({ round }) =>
        round <= 1
          ? {
              winner: "bar",
              gap: "Scale the hero type and tighten the CTA.",
              confidence: 0.75,
              note: "demo-verdict",
            }
          : {
              winner: "ours",
              gap: "No remaining gap.",
              confidence: 0.8,
              note: "demo-verdict",
            };
    }

    const final = await runLoop(runId, hooks, opts.cwd as string);
    console.log(renderProgress(final, await readPieces(dir)));
    console.log(`\nEvidence: ${path.join(dir, "evidence")}`);
  });

function collect(value: string, prev: string[]) {
  prev.push(value);
  return prev;
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
