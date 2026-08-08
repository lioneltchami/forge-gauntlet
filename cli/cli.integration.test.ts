import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "cli", "gauntlet.ts");

function runCli(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", cli, ...args], {
      cwd: root,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("CLI integration", () => {
  it("propose emits named bars as JSON", async () => {
    const { code, stdout } = await runCli([
      "propose",
      "a dark athletic landing page",
      "--json",
    ]);
    assert.equal(code, 0);
    const data = JSON.parse(stdout);
    assert.ok(Array.isArray(data.bars));
    assert.ok(data.bars.length >= 2);
    assert.ok(
      data.bars.every((b: { name?: string; url?: string }) => b.name && b.url),
    );
  });

  it("compose prints Spisak-shaped orchestrator text", async () => {
    const { code, stdout } = await runCli([
      "compose",
      "--goal",
      "landing page. pieces: hero",
      "--bar",
      "a",
      "--agent",
      "claude-code",
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /orchestrat|builder|critic|delegation/i);
    assert.match(stdout, /bar/i);
  });

  it("doctor reports readiness without failing soft mode", async () => {
    const { code, stdout } = await runCli(["doctor"]);
    assert.equal(code, 0);
    const report = JSON.parse(stdout);
    assert.ok("claude" in report);
    assert.ok("codex" in report);
    assert.ok("OPENROUTER_API_KEY" in report);
  });

  it("dry spawn loop writes ledger and stops without live tokens", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-cli-"));
    try {
      const { code, stdout, stderr } = await runCli(
        [
          "run",
          "--goal",
          "write article. pieces: draft",
          "--bar",
          "data:text/plain,Reference%20article.",
          "--bar-name",
          "Reference Article",
          "--skip-bar-fetch",
          "--spawn-agent",
          "--spawn-dry",
          "--no-auto-vision",
          "--max-rounds",
          "1",
          "--cwd",
          cwd,
        ],
        {
          env: { OPENROUTER_API_KEY: "" },
        },
      );
      assert.equal(code, 0, stderr || stdout);
      assert.match(stdout, /run-/i);

      const runMatch = stdout.match(/run-[A-Za-z0-9._-]+/);
      assert.ok(runMatch);
      const progress = await readFile(
        path.join(cwd, "runs", runMatch[0], "progress.md"),
        "utf8",
      );
      assert.match(progress, /Goal|Bar|Piece/i);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
