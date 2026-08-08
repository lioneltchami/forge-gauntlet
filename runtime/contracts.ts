/**
 * Spisak-inspired contracts — orchestrator never implements;
 * implementer never grades; critic is fresh + blind.
 */
export type RoleSplit = {
	orchestrator: "claude" | "cursor" | "human";
	implementer: "codex" | "claude" | "cursor" | "local";
	critic: "vision" | "text" | "heuristic" | "subagent";
};

export function buildDelegationXml(args: {
	pieceName: string;
	goal: string;
	gap: string | null;
	artifactHint: string;
	runDir: string;
	humanGates: string[];
	safetyNever: string[];
}): string {
	const gates =
		args.humanGates.length > 0
			? args.humanGates.join("; ")
			: "spend over budget; production promotion; credential provisioning; irreversible mutation";
	const never =
		args.safetyNever.length > 0
			? args.safetyNever.join("; ")
			: "commit secrets/PII; invent bar evidence; soft-score your own work";

	return `<task>
Piece: ${args.pieceName}
Goal: ${args.goal}
Run dir: ${args.runDir}
Current gap from blind critic: ${args.gap ?? "(first pass — no gap yet)"}
Expected end state: improve this piece only; leave artifact at ${args.artifactHint}; do not self-critique.
</task>
<structured_output_contract>
Return exactly: files changed, open-as URL/path/command, evidence map. No narrative padding. No self-grade.
</structured_output_contract>
<default_follow_through_policy>
Proceed on low-risk details. STOP and report when a step requires: ${gates}.
</default_follow_through_policy>
<completeness_contract>
Resolve the piece fully. Do not stop at the first plausible result.
</completeness_contract>
<verification_loop>
Open/run the artifact before finalizing. Read-back after every write.
</verification_loop>
<missing_context_gating>
Do not guess live env facts. Inspect or state unknowns.
</missing_context_gating>
<action_safety>
Scope to this piece only. Never: ${never}.
</action_safety>`;
}

export const HOSTILE_CRITIC_INSTRUCTION = [
	"You are a hostile acceptance auditor. Assume the work is wrong until evidence proves otherwise.",
	"You receive unlabeled A/B evidence only — never builder notes or prior drafts.",
	"Pick A or B. Binary. One gap sentence for the loser.",
	"Work must win against the reference. Tie = bar wins for the loop.",
	'JSON only: {"winner":"A"|"B","gap":"...","confidence":0.0-1.0}',
].join(" ");
