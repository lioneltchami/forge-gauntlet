import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { heuristicCritic } from "../runtime/critic.js";
import { CLAUDE_CODE_LOOP_VERBS } from "./claude-code.js";
import { CURSOR_LOOP_VERBS, cursorFanoutInstructions } from "./cursor.js";
import { detectEnvFromArgv, portableVerbs } from "./verbs.js";

describe("portable verbs", () => {
	it("maps agent environments", () => {
		assert.equal(portableVerbs("cursor"), CURSOR_LOOP_VERBS);
		assert.equal(portableVerbs("claude-code"), CLAUDE_CODE_LOOP_VERBS);
		assert.match(portableVerbs("generic"), /parallel subagents/);
		assert.equal(detectEnvFromArgv(["--agent", "claude"]), "claude-code");
	});

	it("isolates builder vs critic task text", () => {
		const { builderTask, criticTask } = cursorFanoutInstructions("hero", "gap");
		assert.match(builderTask, /BUILDER/);
		assert.match(criticTask, /CRITIC/);
		assert.equal(/builder rationale|how hard/i.test(criticTask), false);
	});
});

describe("measurable half", () => {
	it("forces bar win when metric fails even if taste would pick ours", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "g-meas-"));
		try {
			const left = path.join(dir, "a.txt");
			const right = path.join(dir, "b.txt");
			// Left denser → heuristic prefers left; mark left as ours
			await writeFile(left, "word ".repeat(200), "utf8");
			await writeFile(right, "short", "utf8");
			const pair = {
				leftPath: left,
				rightPath: right,
				leftIsOurs: true,
				kind: "text" as const,
			};
			const v = await heuristicCritic(pair, {
				metric: "LCP",
				target: "2.5s",
				ours: "4.0s",
				met: false,
			});
			assert.equal(v.winner, "bar");
			assert.match(v.gap, /Measurable half/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
