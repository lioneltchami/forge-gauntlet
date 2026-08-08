import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loopVerbs, writeAimPrompt } from "./aim-prompt.js";
import { syntheticPng } from "./apex/compare.js";
import { inferGoalType, isVagueName, proposeBars } from "./bar.js";
import {
  buildBlindCriticPrompt,
  mapBlindWinner,
  parseCriticJson,
  randomizePair,
} from "./critic.js";
import { decompose } from "./decompose.js";
import { normalizeTextEvidence } from "./evidence/index.js";
import { createRun, runLoop } from "./runner.js";
import { stopRun } from "./stop.js";

const TEST_SCREENSHOT = syntheticPng({
  width: 24,
  height: 24,
  fill: [30, 40, 50],
  edgeBoost: true,
});

const testScreenshot = async (
  _url: string,
  outPath: string,
  viewport: { width: number; height: number },
) => {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, TEST_SCREENSHOT);
  return { path: outPath, hash: "test", viewport };
};

describe("bar rules", () => {
  it("rejects vague names", () => {
    assert.equal(isVagueName("award-winning design"), true);
    assert.equal(isVagueName("Nike running campaign page"), false);
  });

  it("infers site goals", () => {
    assert.equal(inferGoalType("landing page for runners"), "site");
  });

  it("proposes 2–3 named bars", () => {
    const bars = proposeBars("pricing page for a SaaS");
    assert.ok(bars.length >= 2 && bars.length <= 3);
    assert.ok(bars.every((b) => b.url && b.name));
  });
});

describe("blind critic", () => {
  it("never labels ours/bar in the prompt", () => {
    const pair = randomizePair("/tmp/a.png", "/tmp/b.png", "image");
    const prompt = buildBlindCriticPrompt(pair, "hero");
    assert.equal(/\bours\b|\btheirs\b|\bbuilder\b/i.test(prompt), false);
    assert.match(prompt, /"winner":"A"\|"B"/);
  });

  it("inlines normalized text instead of exposing local paths", () => {
    const pair = randomizePair(
      "/private/run/candidate-a.txt",
      "/private/run/candidate-b.txt",
      "text",
    );
    const prompt = buildBlindCriticPrompt(pair, "introduction", {
      leftText: "Candidate A prose.",
      rightText: "Candidate B prose.",
    });

    assert.match(prompt, /Candidate A prose/);
    assert.match(prompt, /Candidate B prose/);
    assert.doesNotMatch(prompt, /\/private\/run/);
    assert.throws(
      () => buildBlindCriticPrompt(pair, "introduction"),
      /text evidence required/i,
    );
    assert.throws(
      () =>
        buildBlindCriticPrompt(pair, "introduction", {
          leftText: "",
          rightText: "Candidate B prose.",
        }),
      /Non-empty text evidence required/i,
    );
  });

  it("maps A/B without leaking labels", () => {
    assert.equal(mapBlindWinner("A", true), "ours");
    assert.equal(mapBlindWinner("A", false), "bar");
    assert.equal(mapBlindWinner("B", true), "bar");
  });

  it("parses critic JSON", () => {
    const p = parseCriticJson(
      'Sure\n{"winner":"B","gap":"Type scale.","confidence":0.9}\n',
    );
    assert.equal(p.winner, "B");
  });
});

describe("decompose + aim prompt", () => {
  it("normalizes both HTML sources with one evidence transform", () => {
    const html =
      "<style>hidden{}</style><script>bad()</script><h1>Hello</h1><p>World</p>";
    assert.equal(normalizeTextEvidence(html), "Hello World");
    assert.match(
      normalizeTextEvidence("const identity = <T>(value: T) => value;"),
      /<T>/,
    );
  });

  it("decomposes site pieces", () => {
    const pieces = decompose("landing", "site");
    assert.ok(pieces.some((p) => p.name === "hero"));
  });

  it("writes portable verbs", () => {
    assert.match(loopVerbs("claude-code"), /\/loop/);
    assert.match(loopVerbs("cursor"), /subagents/);
    const aim = writeAimPrompt({
      goal: "a pricing page",
      barName: "Stripe pricing",
      barUrl: "https://stripe.com/pricing",
      agentEnv: "cursor",
      measurable: { metric: "sections", target: "3" },
    });
    assert.match(aim, /Stripe pricing/);
    assert.match(aim, /sections = 3/);
  });
});

describe("runtime loop", () => {
  it("renders both visual candidates as anonymous PNG evidence", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { readdir } = await import("node:fs/promises");
      const { runId, dir } = await createRun({
        goal: "landing page. pieces: hero",
        bar: {
          id: "reference",
          name: "Reference Landing Page",
          url: "data:text/html,<h1>Reference</h1>",
        },
        cwd,
        skipBarFetch: true,
      });
      await runLoop(
        runId,
        {
          screenshotFn: testScreenshot,
          verdictFn: async () => ({
            winner: "ours",
            gap: "Done.",
            confidence: 0.9,
          }),
        },
        cwd,
      );

      const blindDir = path.join(
        dir,
        "evidence",
        "piece-01",
        "round-1",
        "blind",
      );
      const files = await readdir(blindDir);
      assert.equal(files.length, 2);
      assert.ok(
        files.every((file) => /^candidate-[0-9a-f-]{36}\.png$/.test(file)),
      );
      assert.equal(
        files.some((file) => /candidate-[12]\./.test(file)),
        false,
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails closed when visual evidence cannot be captured", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId } = await createRun({
        goal: "landing page. pieces: hero",
        bar: {
          id: "reference",
          name: "Reference Landing Page",
          url: "https://example.com",
        },
        cwd,
        skipBarFetch: true,
      });

      await assert.rejects(
        runLoop(
          runId,
          {
            screenshotFn: async () => {
              throw new Error("capture denied");
            },
            verdictFn: async () => {
              throw new Error("critic must not run without evidence");
            },
          },
          cwd,
        ),
        /capture denied/,
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails closed when a requested vision critic is unavailable", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    const previousKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const { runId } = await createRun({
        goal: "landing page. pieces: hero",
        bar: {
          id: "reference",
          name: "Reference Landing Page",
          url: "https://example.com",
        },
        cwd,
        skipBarFetch: true,
      });

      await assert.rejects(
        runLoop(
          runId,
          {
            screenshotFn: testScreenshot,
            visionCritic: true,
          },
          cwd,
        ),
        /OPENROUTER_API_KEY is unset/,
      );
    } finally {
      if (previousKey == null) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("creates ledger, loops until blind win, respects stop", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId, dir, meta } = await createRun({
        goal: "tiny page. pieces: hero",
        bar: {
          id: "a",
          name: "Example Domain",
          url: "https://example.com",
        },
        cwd,
        skipBarFetch: true,
      });
      assert.equal(meta.status, "proposed");
      assert.ok(dir.includes(runId));

      let roundSeen = 0;
      const final = await runLoop(
        runId,
        {
          maxRoundsPerPiece: 4,
          screenshotFn: testScreenshot,
          verdictFn: async ({ round }) => {
            roundSeen = round;
            if (round === 1) {
              return {
                winner: "bar" as const,
                gap: "Bigger hero type.",
                confidence: 0.7,
              };
            }
            return {
              winner: "ours" as const,
              gap: "Done.",
              confidence: 0.9,
            };
          },
        },
        cwd,
      );
      assert.equal(final.status, "completed");
      assert.ok(roundSeen >= 2);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("human brake sets stopped_by_user", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId } = await createRun({
        goal: "x. pieces: a, b",
        bar: { id: "a", name: "Example Domain", url: "https://example.com" },
        cwd,
        skipBarFetch: true,
      });
      // mark running then stop
      const { writeMeta, readMeta, runDir, readPieces, writeProgress } =
        await import("./ledger.js");
      const dir = runDir(runId, cwd);
      const meta = await readMeta(dir);
      meta.status = "running";
      await writeMeta(dir, meta);
      const stopped = await stopRun(runId, cwd);
      assert.equal(stopped.status, "stopped_by_user");
      const pieces = await readPieces(dir);
      assert.ok(
        pieces.every((p) => p.status === "stopped" || p.status === "won"),
      );
      await writeProgress(dir, stopped, pieces);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("does not overwrite a stop requested during an active round", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId, dir } = await createRun({
        goal: "write article. pieces: introduction",
        bar: {
          id: "reference",
          name: "Reference Article",
          url: "data:text/plain,A%20clear%20reference%20article.",
        },
        cwd,
        skipBarFetch: true,
      });
      let verdictCalls = 0;

      const final = await runLoop(
        runId,
        {
          maxRoundsPerPiece: 3,
          verdictFn: async () => {
            verdictCalls += 1;
            if (verdictCalls > 1) {
              throw new Error("loop continued after human stop");
            }
            await stopRun(runId, cwd);
            return {
              winner: "bar",
              gap: "Keep improving.",
              confidence: 0.8,
            };
          },
        },
        cwd,
      );

      assert.equal(verdictCalls, 1);
      assert.equal(final.status, "stopped_by_user");
      const { readPieces } = await import("./ledger.js");
      const pieces = await readPieces(dir);
      assert.ok(pieces.every((p) => p.status === "stopped"));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("persists budget_exhausted instead of leaving the run active", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId, dir } = await createRun({
        goal: "write article. pieces: introduction",
        bar: {
          id: "reference",
          name: "Reference Article",
          url: "data:text/plain,A%20clear%20reference%20article.",
        },
        cwd,
        skipBarFetch: true,
        maxTokens: 0,
      });
      const final = await runLoop(
        runId,
        {
          criticFn: async () => {
            throw new Error("model must not run with zero budget");
          },
        },
        cwd,
      );

      assert.equal(final.status, "budget_exhausted");
      const { readMeta } = await import("./ledger.js");
      assert.equal((await readMeta(dir)).status, "budget_exhausted");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("records critic usage and stops before another paid round", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId, dir } = await createRun({
        goal: "write article. pieces: introduction",
        bar: {
          id: "reference",
          name: "Reference Article",
          url: "data:text/plain,A%20clear%20reference%20article.",
        },
        cwd,
        skipBarFetch: true,
        maxTokens: 12,
        maxUsd: 1,
      });
      let criticCalls = 0;
      let tokenLimitSeen: number | undefined;

      const final = await runLoop(
        runId,
        {
          criticFn: async (_prompt, limits) => {
            criticCalls += 1;
            tokenLimitSeen = limits.maxTokens;
            return {
              raw: JSON.stringify({
                winner: "A",
                gap: "Keep improving.",
                confidence: 0.8,
              }),
              usage: { tokens: 12, usd: 0.02 },
            };
          },
        },
        cwd,
      );

      assert.equal(criticCalls, 1);
      assert.equal(tokenLimitSeen, 12);
      assert.equal(final.status, "budget_exhausted");
      assert.equal(final.budgetState?.usedTokens, 12);
      assert.equal(final.budgetState?.usedUsd, 0.02);
      const { readMeta } = await import("./ledger.js");
      assert.equal((await readMeta(dir)).status, "budget_exhausted");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails closed when capped model usage is unavailable", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId } = await createRun({
        goal: "write article. pieces: introduction",
        bar: {
          id: "reference",
          name: "Reference Article",
          url: "data:text/plain,A%20clear%20reference%20article.",
        },
        cwd,
        skipBarFetch: true,
        maxTokens: 100,
      });

      const final = await runLoop(
        runId,
        {
          criticFn: async () => ({
            raw: JSON.stringify({
              winner: "A",
              gap: "Keep improving.",
              confidence: 0.8,
            }),
          }),
        },
        cwd,
      );

      assert.equal(final.status, "budget_exhausted");
      assert.equal(final.budgetState?.exhausted, true);
      assert.match(
        final.budgetState?.accountingError ?? "",
        /usage unavailable/i,
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("writes ORCHESTRATOR, workbench, dispatch; apex writes CONTRACT", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { access } = await import("node:fs/promises");
      const { runId, dir, systemPrompt } = await createRun({
        goal: "game piece. pieces: hero",
        bar: { id: "a", name: "Example Domain", url: "https://example.com" },
        cwd,
        skipBarFetch: true,
        mode: "apex",
        agentEnv: "claude-code",
        maxUsd: 10,
      });
      assert.match(systemPrompt, /Apex|CONTRACT|orchestrator/i);
      await access(path.join(dir, "ORCHESTRATOR.md"));
      await access(path.join(dir, "workbench.md"));
      await access(path.join(dir, "CONTRACT.md"));
      await access(path.join(dir, "dispatch", "ORCHESTRATOR.md"));

      await runLoop(
        runId,
        {
          maxRoundsPerPiece: 1,
          screenshotFn: testScreenshot,
          verdictFn: async () => ({
            winner: "bar",
            gap: "still short",
            confidence: 0.5,
          }),
        },
        cwd,
      );
      const { readdir } = await import("node:fs/promises");
      const dispatch = await readdir(path.join(dir, "dispatch"));
      assert.ok(dispatch.some((f) => f.includes("builder")));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("resume clears stopped pieces and continues", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-"));
    try {
      const { runId } = await createRun({
        goal: "x. pieces: hero",
        bar: { id: "a", name: "Example Domain", url: "https://example.com" },
        cwd,
        skipBarFetch: true,
      });
      const { runDir } = await import("./ledger.js");
      const { resumeRun } = await import("./checkpoint.js");
      const dir = runDir(runId, cwd);
      await stopRun(runId, cwd);
      const resumed = await resumeRun(runId, cwd);
      assert.equal(resumed.meta.status, "running");
      assert.equal(resumed.pieces[0].status, "pending");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("compose", () => {
  it("emits Spisak-shaped prompt with role split", async () => {
    const { composeSystemPrompt } = await import("./compose.js");
    const text = composeSystemPrompt({
      goal: "pricing page",
      barName: "Stripe pricing",
      barUrl: "https://stripe.com/pricing",
      agentEnv: "claude-code",
      mode: "apex",
    });
    assert.match(text, /never implement/i);
    assert.match(text, /Stripe pricing/);
    assert.match(text, /Apex/);
    assert.match(text, /claude is the sole implementer/i);
  });
});
