import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loopVerbs, writeAimPrompt } from "./aim-prompt.js";
import { inferGoalType, isVagueName, proposeBars } from "./bar.js";
import {
  buildBlindCriticPrompt,
  mapBlindWinner,
  parseCriticJson,
  randomizePair,
} from "./critic.js";
import { decompose } from "./decompose.js";
import { createRun, runLoop } from "./runner.js";
import { stopRun } from "./stop.js";

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
      const { writeMeta, readMeta, runDir, writePieces, readPieces } =
        await import("./ledger.js");
      const { resumeRun } = await import("./checkpoint.js");
      const dir = runDir(runId, cwd);
      const meta = await readMeta(dir);
      meta.status = "stopped_by_user";
      await writeMeta(dir, meta);
      const pieces = await readPieces(dir);
      pieces[0].status = "stopped";
      await writePieces(dir, pieces);
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
