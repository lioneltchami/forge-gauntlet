import { type AimPromptInput, writeAimPrompt } from "./aim-prompt.js";
import { HOSTILE_CRITIC_INSTRUCTION } from "./contracts.js";

export type ComposeInput = AimPromptInput & {
	title?: string;
	acceptanceCriteria?: string[];
	humanGates?: string[];
	safetyNever?: string[];
	derived?: boolean;
	fanOutSequential?: string[];
	fanOutParallel?: string[];
	implementer?: "codex" | "claude" | "cursor" | "local";
	mode?: "standard" | "apex";
};

/**
 * Emit a Spisak-shaped orchestrator system prompt (paste into fresh session)
 * while keeping Shumer aim-prompt density for the core loop.
 */
export function composeSystemPrompt(input: ComposeInput): string {
	const title = input.title ?? input.goal.slice(0, 60);
	const criteria =
		input.acceptanceCriteria && input.acceptanceCriteria.length > 0
			? input.acceptanceCriteria
			: [
					`Blind critic picks ours over ${input.barName} for every piece.`,
					"Evidence fetched — no hallucinated comparison.",
					"Human brake respected (`gauntlet stop` / hard gates).",
				];
	const derivedTag = input.derived ? " `DERIVED — confirm before running`" : "";
	const gates = input.humanGates?.length
		? input.humanGates
		: [
				"Spend over named budget",
				"Production promotion",
				"Credential / secret provisioning",
			];
	const never = input.safetyNever?.length
		? input.safetyNever
		: [
				"Commit secrets/PII",
				"Reuse critic context across retries",
				"Invent bar evidence",
			];
	const seq = input.fanOutSequential?.length
		? input.fanOutSequential.join(" → ")
		: "bar validate → foundation/contract → pieces → integrate → smoothing pass";
	const par = input.fanOutParallel?.length
		? input.fanOutParallel.join(", ")
		: "independent pieces after foundation";

	const aim = writeAimPrompt(input);
	const implementer =
		input.implementer ??
		(input.agentEnv === "claude-code"
			? "claude"
			: input.agentEnv === "cursor"
				? "cursor"
				: input.agentEnv === "codex"
					? "codex"
					: "local");
	const apexBlock =
		input.mode === "apex"
			? [
					"",
					"## Apex / long-run mode",
					"- Maintain `CONTRACT.md` for shared interfaces before wide fan-out.",
					"- Capture named shots via the Gauntlet capture harness; critics score frames, not source.",
					"- Checkpoint after every piece/round; resume with `gauntlet resume`.",
					"- Expect millions of tokens / many hours. Budget gates outrank “keep going.”",
					"- Optional climb mode: bar may remain unreachable — human stops when good enough to ship.",
				].join("\n")
			: "";

	return `# System Prompt — ${title} (Orchestrator / Implementer / Critic)

## Mission

Fully execute: ${input.goal}
Destination only — implementer owns architecture. Single source of truth for this run's ledger under \`runs/<id>/\`.

## The bar

- **Reference:** ${input.barName}${input.barUrl ? ` (${input.barUrl})` : ""}
- **Acceptance criteria${derivedTag}:**
${criteria.map((c) => `  - ${c}`).join("\n")}
${input.measurable ? `- **Measurable half:** ${input.measurable.metric} = ${input.measurable.target} (taste win alone is insufficient)` : ""}

## Role split — hard boundary

**You (orchestrator) never implement.** You decompose, write delegation contracts, adjudicate evidence, update the progress ledger.
**${implementer} is the sole implementer** for artifacts (or Cursor Task / Claude subagent when configured).
**Blind critics** are fresh-context only. ${HOSTILE_CRITIC_INSTRUCTION}

## Shumer aim (execute this loop)

${aim}

## The loop — per piece

1. Contract (delegation XML for implementer).
2. Implement.
3. Blind audit on fetched evidence (labels stripped).
4. Iterate — feed **only** the critic gap back. Fresh critic every retry.
5. Mark and log in \`progress.md\` / \`workbench.md\`.
6. After all pieces: one fresh **smoothing** critic on the integrated whole.

No arbitrary iteration cap. Exit = all pieces win blind, human gate, budget gate, or \`gauntlet stop\`.

## Fan-out map

- **Sequential (gated):** ${seq}
- **Parallel:** ${par}

## Progress ledger

Maintain live \`progress.md\` (and optional \`workbench.md\`). Human reads it; do not ping after every win — advance.

## Hard stops — loop never overrides

1. Human gates: ${gates.join("; ")}.
2. Safety: ${never.join("; ")}.
3. Bar unreachable / unfetchable → refuse, do not hallucinate AAA approval.
${apexBlock}

## Definition of done

Every piece critic-verified as \`ours\`; measurable half met if named; smoothing pass clean; every pending human gate listed.
`;
}
