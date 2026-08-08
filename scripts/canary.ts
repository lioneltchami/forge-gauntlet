#!/usr/bin/env node

/**
 * Controlled canary for Gauntlet Runtime.
 *
 * Default: offline / dry — no model spend.
 * Live OpenRouter canary: GAUNTLET_LIVE_CANARY=1 npm run canary -- --live
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "cli", "gauntlet.ts");

const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const network = args.has("--network") || live;

function run(
  cmdArgs: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", cli, ...cmdArgs],
      {
        cwd: root,
        env: { ...process.env, ...opts.env },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gauntlet ${cmdArgs[0]} exited ${code}`));
    });
  });
}

async function main() {
  if (live && process.env.GAUNTLET_LIVE_CANARY !== "1") {
    throw new Error(
      "Refusing live canary. Set GAUNTLET_LIVE_CANARY=1 to spend tokens intentionally.",
    );
  }
  if (live && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Live canary requires OPENROUTER_API_KEY.");
  }

  console.log(
    `Canary mode: ${live ? "LIVE" : "dry"}${network ? " + network" : " (offline)"}`,
  );

  await run(["doctor"]);
  await run(["propose", "canary landing page", "--json"]);
  await run([
    "compose",
    "--goal",
    "canary landing page. pieces: hero",
    "--bar",
    "a",
    "--agent",
    "claude-code",
  ]);

  const cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-canary-"));
  try {
    const runArgs = [
      "run",
      "--goal",
      network
        ? "canary landing page. pieces: hero"
        : "write article. pieces: draft",
      "--bar",
      network ? "https://example.com" : "data:text/plain,Canary%20reference.",
      "--bar-name",
      network ? "Example Domain" : "Canary Reference",
      "--max-rounds",
      "1",
      "--cwd",
      cwd,
    ];
    if (!network) runArgs.push("--skip-bar-fetch");
    if (!live) {
      runArgs.push("--spawn-agent", "--spawn-dry", "--no-auto-vision");
    } else {
      runArgs.push(
        "--llm-critic",
        "--no-auto-vision",
        "--max-usd",
        "0.25",
        "--max-tokens",
        "4000",
      );
    }
    await run(runArgs, {
      env: live ? undefined : { OPENROUTER_API_KEY: "" },
    });
    console.log("Canary OK");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
