import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { compareFramesGrid, syntheticPng } from "../runtime/apex/compare.js";
import {
	buildAgentInvocation,
	detectAgents,
	findArtifactAfterSpawn,
	parseAgentUsage,
	snapshotArtifacts,
	spawnImplementer,
} from "./spawn.js";

describe("spawn adapters", () => {
	it("detects claude and/or codex on this machine", async () => {
		const agents = await detectAgents();
		// At least one should exist in the developer's environment; if neither, still ok for CI
		assert.equal(
			typeof agents.claude === "string" || agents.claude === null,
			true,
		);
		assert.equal(
			typeof agents.codex === "string" || agents.codex === null,
			true,
		);
	});

	it("dry-run spawn writes a log without calling the model", async () => {
		const cwd = await mkdtemp(path.join(tmpdir(), "spawn-"));
		try {
			const prompt = path.join(cwd, "prompt.md");
			await writeFile(prompt, "# test dispatch\n", "utf8");
			const result = await spawnImplementer({
				kind: "claude",
				promptPath: prompt,
				cwd,
				runDir: cwd,
				pieceId: "piece-01",
				round: 1,
				dryRun: true,
			});
			assert.equal(result.ok, true);
			assert.equal(result.skipped, true);
			assert.ok(result.logPath);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("parses Claude and Codex cumulative usage", () => {
		assert.deepEqual(
			parseAgentUsage(
				"claude",
				JSON.stringify({
					usage: { input_tokens: 40, output_tokens: 10 },
					total_cost_usd: 0.012,
				}),
			),
			{ tokens: 50, usd: 0.012 },
		);
		assert.deepEqual(
			parseAgentUsage(
				"codex",
				[
					JSON.stringify({ type: "turn.started" }),
					JSON.stringify({
						type: "turn.completed",
						usage: {
							input_tokens: 30,
							cached_input_tokens: 5,
							output_tokens: 15,
						},
					}),
				].join("\n"),
			),
			{ tokens: 50, usd: undefined },
		);
	});

	it("builds writable non-interactive commands without prompt argv leakage", () => {
		const prompt = "private dispatch prompt";
		const claude = buildAgentInvocation("claude", prompt, 0.5);
		assert.deepEqual(claude.args, [
			"-p",
			"--output-format",
			"json",
			"--permission-mode",
			"acceptEdits",
			"--max-budget-usd",
			"0.5",
		]);
		assert.equal(claude.stdin, prompt);
		assert.equal(claude.args.includes(prompt), false);

		const codex = buildAgentInvocation("codex", prompt);
		assert.deepEqual(codex.args, [
			"exec",
			"--json",
			"--sandbox",
			"workspace-write",
			"-",
		]);
		assert.equal(codex.stdin, prompt);
		assert.equal(codex.args.includes(prompt), false);
	});

	it("accepts only artifacts created or changed by the spawn", async () => {
		const runDir = await mkdtemp(path.join(tmpdir(), "artifacts-"));
		try {
			const pieceDir = path.join(runDir, "artifacts", "piece-01");
			await mkdir(pieceDir, { recursive: true });
			const stale = path.join(pieceDir, "index.html");
			await writeFile(stale, "stale", "utf8");
			const before = await snapshotArtifacts(runDir, "piece-01");

			assert.equal(
				await findArtifactAfterSpawn(runDir, "piece-01", before),
				null,
			);

			await writeFile(stale, "stale", "utf8");
			assert.equal(
				await findArtifactAfterSpawn(runDir, "piece-01", before, "image"),
				stale,
			);
			const afterRewrite = await snapshotArtifacts(runDir, "piece-01");

			const fresh = path.join(pieceDir, "nested", "result.html");
			await mkdir(path.dirname(fresh), { recursive: true });
			await writeFile(fresh, "fresh", "utf8");
			assert.equal(
				await findArtifactAfterSpawn(runDir, "piece-01", afterRewrite),
				fresh,
			);

			const afterHtml = await snapshotArtifacts(runDir, "piece-01");
			await writeFile(path.join(pieceDir, "style.css"), "body{}", "utf8");
			assert.equal(
				await findArtifactAfterSpawn(runDir, "piece-01", afterHtml, "image"),
				stale,
			);

			const afterCss = await snapshotArtifacts(runDir, "piece-01");
			await writeFile(path.join(pieceDir, "notes.md"), "notes", "utf8");
			assert.equal(
				await findArtifactAfterSpawn(runDir, "piece-01", afterCss, "image"),
				null,
			);
		} finally {
			await rm(runDir, { recursive: true, force: true });
		}
	});
});

describe("apex grid compare", () => {
	it("flags detail loss when edges flatten", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "cmp-"));
		try {
			const sharp = path.join(dir, "a.png");
			const flat = path.join(dir, "b.png");
			await writeFile(
				sharp,
				syntheticPng({
					width: 48,
					height: 48,
					fill: [40, 40, 40],
					edgeBoost: true,
				}),
			);
			await writeFile(
				flat,
				syntheticPng({
					width: 48,
					height: 48,
					fill: [40, 40, 40],
					edgeBoost: false,
				}),
			);
			const result = await compareFramesGrid(sharp, flat, { grid: 4 });
			assert.equal(result.sameHash, false);
			assert.ok(result.detailLostCells > 0);
			assert.equal(result.regression, true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
