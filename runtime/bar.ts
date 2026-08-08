import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BarCandidate, BarValidation, GoalType } from "./types.js";

const VAGUE_PATTERNS = [
	/award[- ]?winning/i,
	/best[- ]?in[- ]?class/i,
	/world[- ]?class/i,
	/aaa quality/i,
	/top[- ]?tier/i,
	/modern and clean/i,
	/industry leading/i,
	/beautiful design/i,
];

export function isVagueName(name: string): boolean {
	if (name.trim().split(/\s+/).length < 2 && !name.includes(".")) return true;
	return VAGUE_PATTERNS.some((re) => re.test(name));
}

export function inferGoalType(goal: string): GoalType {
	const g = goal.toLowerCase();
	if (/(landing|pricing|website|page|ui|homepage|saas)/.test(g)) return "site";
	if (/(essay|article|explainer|blog|write|post)/.test(g)) return "writing";
	if (/(cli|api|library|repo|benchmark|tool)/.test(g)) return "code";
	if (/(game|fps|roguelike|threejs|godot|unity)/.test(g)) return "game";
	if (/(research|paper|analysis|report)/.test(g)) return "research";
	return "other";
}

/** Propose 2–3 named bars for a goal. Prefer fetchable URLs. */
export function proposeBars(goal: string, goalType?: GoalType): BarCandidate[] {
	const type = goalType ?? inferGoalType(goal);
	const g = goal.toLowerCase();

	if (type === "site") {
		if (/(run|athletic|gym|sport)/.test(g)) {
			return [
				{
					id: "a",
					name: "Nike running campaign page",
					url: "https://www.nike.com/running",
				},
				{
					id: "b",
					name: "On Running homepage",
					url: "https://www.on.com/en-us",
				},
				{
					id: "c",
					name: "Gymshark product landing",
					url: "https://www.gymshark.com/",
				},
			];
		}
		if (/(pric)/.test(g)) {
			return [
				{ id: "a", name: "Stripe pricing", url: "https://stripe.com/pricing" },
				{ id: "b", name: "Linear pricing", url: "https://linear.app/pricing" },
				{ id: "c", name: "Vercel pricing", url: "https://vercel.com/pricing" },
			];
		}
		return [
			{ id: "a", name: "Stripe homepage", url: "https://stripe.com" },
			{ id: "b", name: "Linear homepage", url: "https://linear.app" },
			{ id: "c", name: "Notion homepage", url: "https://www.notion.com" },
		];
	}

	if (type === "writing") {
		return [
			{
				id: "a",
				name: "Julia Evans 'How to dig an scary-looking problem'",
				url: "https://jvns.ca/blog/2019/06/23/a-few-debugging-resources/",
			},
			{
				id: "b",
				name: "Stripe engineering blog (named post — pick one live)",
				url: "https://stripe.com/blog/engineering",
			},
			{
				id: "c",
				name: "Paul Graham 'Do Things that Don't Scale'",
				url: "http://paulgraham.com/ds.html",
			},
		];
	}

	if (type === "code") {
		return [
			{
				id: "a",
				name: "jqlang/jq README + examples",
				url: "https://github.com/jqlang/jq",
			},
			{
				id: "b",
				name: "prettier CLI help + docs",
				url: "https://prettier.io/docs/en/cli.html",
			},
			{
				id: "c",
				name: "sindresorhus/execa README",
				url: "https://github.com/sindresorhus/execa",
			},
		];
	}

	if (type === "game") {
		return [
			{
				id: "a",
				name: "Official Call of Duty screenshots gallery (fetchable stills)",
				url: "https://www.callofduty.com/",
			},
			{
				id: "b",
				name: "Hades Steam store page screenshots",
				url: "https://store.steampowered.com/app/1145360/Hades/",
			},
			{
				id: "c",
				name: "Brotato Steam store page screenshots",
				url: "https://store.steampowered.com/app/1942280/Brotato/",
			},
		];
	}

	return [
		{ id: "a", name: "Stripe homepage", url: "https://stripe.com" },
		{ id: "b", name: "Linear homepage", url: "https://linear.app" },
		{
			id: "c",
			name: "Tailwind CSS docs",
			url: "https://tailwindcss.com/docs",
		},
	];
}

export async function validateBar(
	bar: BarCandidate,
	opts: { runDir: string; fetchImpl?: typeof fetch } = { runDir: "." },
): Promise<BarValidation> {
	const reasons: string[] = [];
	const named = Boolean(bar.name?.trim()) && !isVagueName(bar.name);
	if (!named) {
		reasons.push(
			"Bar is not named specifically (reject categories like 'award-winning design').",
		);
	}

	let fetchable = false;
	let contentType: BarValidation["contentType"];
	let snapshotPath: string | undefined;
	let snapshotHash: string | undefined;

	if (bar.url) {
		try {
			const fetchFn = opts.fetchImpl ?? fetch;
			const res = await fetchFn(bar.url, {
				method: "GET",
				redirect: "follow",
				signal: AbortSignal.timeout(15000),
				headers: { "user-agent": "gauntlet-bar-health-check/0.1" },
			});
			if (!res.ok) {
				reasons.push(`URL returned HTTP ${res.status} — not fetchable.`);
			} else {
				const buf = Buffer.from(await res.arrayBuffer());
				fetchable = buf.byteLength > 0;
				contentType = "url";
				const evidenceDir = path.join(opts.runDir, "evidence", "_bar");
				await mkdir(evidenceDir, { recursive: true });
				snapshotPath = path.join(evidenceDir, "bar-fetch.bin");
				await writeFile(snapshotPath, buf);
				snapshotHash = createHash("sha256").update(buf).digest("hex");
			}
		} catch (err) {
			reasons.push(
				`Failed to fetch bar URL: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else {
		reasons.push("No URL provided — critic cannot fetch the reference.");
	}

	const comparable = named && fetchable;
	if (!comparable && named && fetchable === false) {
		reasons.push("Bar is not comparable without a fetchable artifact.");
	}

	const ok = named && fetchable && comparable;
	return {
		named,
		fetchable,
		comparable,
		ok,
		reasons,
		snapshotPath,
		snapshotHash,
		contentType,
	};
}
