import { readFile } from "node:fs/promises";
import path from "node:path";

export type PlanAnalysis = {
	mission: string;
	acceptanceCriteria: string[];
	humanGates: string[];
	safetyNever: string[];
	referenceHints: string[];
	/** True when criteria were invented because the source had none. */
	derivedCriteria: boolean;
	gaps: string[];
	sourcePath?: string;
	sourceKind: "inline" | "markdown" | "html";
};

const GATE_RE =
	/\b(approval|sign[- ]?off|credential|secret|budget|spend|production|promote|irreversible|vendor|contract)\b/i;
const NEVER_RE = /\b(never|do not|don't|must not|forbid|no secrets?|no pii)\b/i;
const CRITERIA_HINT_RE =
	/\b(done means|acceptance|sla|metric|must |should |checkbox|pass(?:es|ing)?|green)\b/i;

function stripHtml(raw: string): string {
	return raw
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function checklistItems(lines: string[]): string[] {
	const items: string[] = [];
	for (const line of lines) {
		const m = line.match(/^[-*+]\s*(?:\[[ xX]\]\s*)?(.+)$/);
		if (m?.[1]) items.push(m[1].trim());
		const numbered = line.match(/^\d+[.)]\s+(.+)$/);
		if (numbered?.[1]) items.push(numbered[1].trim());
	}
	return [...new Set(items)];
}

function deriveCriteria(mission: string): string[] {
	return [
		`Blind critic picks ours over the named reference for every piece of: ${mission.slice(0, 80)}.`,
		"Evidence is fetched — no hallucinated comparison.",
		"Human gates and budgets outrank “keep going.”",
		"Final smoothing critic finds no remaining coherence gap on the integrated whole.",
	];
}

/**
 * Extract mission, criteria, gates, and safety rules from inline text,
 * markdown plans, or HTML specs (Spisak-style analysis pass).
 */
export function extractPlan(
	raw: string,
	opts: { path?: string; kind?: "inline" | "markdown" | "html" } = {},
): PlanAnalysis {
	const lowerPath = (opts.path ?? "").toLowerCase();
	const kind =
		opts.kind ??
		(lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")
			? "html"
			: opts.path
				? "markdown"
				: /<\/?[a-z][\s\S]*>/i.test(raw)
					? "html"
					: "inline");

	const text = kind === "html" ? stripHtml(raw) : raw;
	const lines = normalizeLines(text);
	const mission =
		lines.find((line) => !line.startsWith("#") && line.length > 12) ??
		lines[0] ??
		"Execute the supplied objective to its acceptance bar.";

	const checks = checklistItems(lines);
	const criteriaFromChecks = checks.filter(
		(item) => CRITERIA_HINT_RE.test(item) || !GATE_RE.test(item),
	);
	const gateFromChecks = checks.filter((item) => GATE_RE.test(item));
	const neverFromChecks = checks.filter((item) => NEVER_RE.test(item));

	const proseGates = lines.filter(
		(line) => GATE_RE.test(line) && !line.startsWith("#"),
	);
	const proseNever = lines.filter(
		(line) => NEVER_RE.test(line) && !line.startsWith("#"),
	);

	const referenceHints = lines
		.filter((line) =>
			/\b(like|vs\.?|versus|reference|compare|exemplar|competitor)\b/i.test(
				line,
			),
		)
		.slice(0, 5);

	const derivedCriteria = criteriaFromChecks.length === 0;
	const acceptanceCriteria = derivedCriteria
		? deriveCriteria(mission)
		: criteriaFromChecks.slice(0, 12);

	const humanGates = [
		...new Set([
			...gateFromChecks,
			...proseGates.map((l) => l.replace(/^[-*+]\s*/, "")),
		]),
	].slice(0, 10);
	const safetyNever = [
		...new Set([
			...neverFromChecks,
			...proseNever.map((l) => l.replace(/^[-*+]\s*/, "")),
		]),
	].slice(0, 10);

	const gaps: string[] = [];
	if (derivedCriteria) {
		gaps.push(
			"No explicit acceptance criteria found — derived defaults marked DERIVED; confirm before running.",
		);
	}
	if (!humanGates.length) {
		gaps.push(
			"No human gates extracted — using spend / credentials / production defaults.",
		);
	}
	if (!referenceHints.length && kind !== "inline") {
		gaps.push(
			"No concrete reference exemplars found in the plan — supply a named fetchable bar.",
		);
	}

	return {
		mission: mission.replace(/^#+\s*/, "").slice(0, 400),
		acceptanceCriteria,
		humanGates,
		safetyNever,
		referenceHints,
		derivedCriteria,
		gaps: gaps.slice(0, 3),
		sourcePath: opts.path,
		sourceKind: kind,
	};
}

export async function loadPlan(filePath: string): Promise<PlanAnalysis> {
	const raw = await readFile(filePath, "utf8");
	return extractPlan(raw, {
		path: path.resolve(filePath),
		kind:
			filePath.toLowerCase().endsWith(".html") ||
			filePath.toLowerCase().endsWith(".htm")
				? "html"
				: "markdown",
	});
}
