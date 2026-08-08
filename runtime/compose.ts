import { type AimPromptInput, writeAimPrompt } from "./aim-prompt.js";
import { HOSTILE_CRITIC_INSTRUCTION } from "./contracts.js";
import { extractPlan, type PlanAnalysis } from "./plan.js";

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
	/** Risky pieces that require an adversarial second opinion after a blind win. */
	riskyPieces?: string[];
	sourceOfTruth?: string;
	planGaps?: string[];
};

export type ComposeResult = {
	systemPrompt: string;
	gaps: string[];
	analysis?: PlanAnalysis;
};

function resolveImplementer(input: ComposeInput) {
	return (
		input.implementer ??
		(input.agentEnv === "claude-code"
			? "claude"
			: input.agentEnv === "cursor"
				? "cursor"
				: input.agentEnv === "codex"
					? "codex"
					: "local")
	);
}

/**
 * Emit a Spisak-shaped orchestrator system prompt (paste into fresh session)
 * while keeping Shumer aim-prompt density for the core loop.
 */
export function composeSystemPrompt(input: ComposeInput): string {
	return composeWithGaps(input).systemPrompt;
}

/** Compose plus ≤3 honesty gap bullets (Spisak output contract). */
export function composeWithGaps(input: ComposeInput): ComposeResult {
	const title = input.title ?? input.goal.slice(0, 60);
	const derived =
		input.derived ??
		!(input.acceptanceCriteria && input.acceptanceCriteria.length > 0);
	const criteria =
		input.acceptanceCriteria && input.acceptanceCriteria.length > 0
			? input.acceptanceCriteria
			: [
					`Blind critic picks ours over ${input.barName} for every piece.`,
					"Evidence fetched — no hallucinated comparison.",
					"Human brake respected (`gauntlet stop` / hard gates).",
					"Smoothing critic finds no coherence gap on the integrated whole.",
				];
	const derivedTag = derived ? " `DERIVED — confirm before running`" : "";
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
	const risky = input.riskyPieces?.length
		? input.riskyPieces.join(", ")
		: "any piece touching credentials, production, payments, or user-facing auth";
	const seq = input.fanOutSequential?.length
		? input.fanOutSequential.join(" → ")
		: "bar validate → foundation/contract → pieces → adversarial (risky) → integrate → smoothing pass";
	const par = input.fanOutParallel?.length
		? input.fanOutParallel.join(", ")
		: "independent pieces after foundation";

	const aim = writeAimPrompt(input);
	const implementer = resolveImplementer(input);
	const source =
		input.sourceOfTruth ?? `this run's ledger under \`runs/<id>/\``;
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

	const systemPrompt = `# System Prompt — ${title} (Orchestrator / Implementer / Critic)

## Mission

Fully execute: ${input.goal}
Destination only — implementer owns architecture. Single source of truth: ${source}.

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
5. **Adversarial second opinion** for risky pieces (${risky}): independent pass; every surviving finding is a FAIL.
6. Mark and log in \`progress.md\` / \`workbench.md\` (status, rounds, verdict, open findings).
7. After all pieces: one fresh **smoothing** critic on the integrated whole — findings loop back before acceptance.

No arbitrary iteration cap. Exit = all pieces win blind + smoothing clean, human gate, budget gate, or \`gauntlet stop\`.

## Critic depth

- Binary blind A/B for taste.
- When checklists/SLAs exist: criterion → evidence map; one unproven criterion = FAIL.
- Second-order checks: empty states, retries, races, rollback, injection via untrusted text, secrets/PII leakage.

## Fan-out map

- **Sequential (gated):** ${seq}
- **Parallel:** ${par}

## Progress ledger

Maintain live \`progress.md\` and \`workbench.md\` with per-piece status, iteration count, verdict, and open findings. Human reads them; do not ping after every win — advance.

## Hard stops — loop never overrides

1. Human gates: ${gates.join("; ")}.
2. Safety: ${never.join("; ")}.
3. Bar unreachable / unfetchable → refuse, do not hallucinate AAA approval.
${apexBlock}

## Definition of done

Every piece critic-verified as \`ours\`; measurable half met if named; adversarial pass clean on risky pieces; smoothing pass clean on the integrated whole; every pending human gate listed.
`;

	const gaps = [
		...(input.planGaps ?? []),
		...(derived
			? ["Acceptance criteria were derived — confirm before running."]
			: []),
		...(!input.humanGates?.length
			? ["Human gates used defaults (spend / credentials / production)."]
			: []),
	].slice(0, 3);

	return { systemPrompt, gaps };
}

/** Compose from a plan/spec string or prior PlanAnalysis. */
export function composeFromPlan(
	input: ComposeInput & { planText?: string; planPath?: string },
): ComposeResult {
	const analysis = input.planText
		? extractPlan(input.planText, { path: input.planPath })
		: undefined;
	const merged: ComposeInput = {
		...input,
		goal: analysis?.mission ?? input.goal,
		acceptanceCriteria: input.acceptanceCriteria?.length
			? input.acceptanceCriteria
			: analysis?.acceptanceCriteria,
		humanGates: input.humanGates?.length
			? input.humanGates
			: analysis?.humanGates,
		safetyNever: input.safetyNever?.length
			? input.safetyNever
			: analysis?.safetyNever,
		derived: input.derived ?? analysis?.derivedCriteria ?? true,
		sourceOfTruth:
			input.sourceOfTruth ?? analysis?.sourcePath ?? input.planPath,
		planGaps: analysis?.gaps,
	};
	const result = composeWithGaps(merged);
	return { ...result, analysis };
}
