/**
 * Apex-inspired capture harness (jolbol1/apex-gp lessons):
 * named shots, local preview URL, lightweight frame compare.
 * Full GPU CDP pause/renderFrame can be layered later per-project.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { screenshotUrl } from "../evidence/index.js";

export const DEFAULT_SHOTS = ["hero", "wide", "detail", "mobile"] as const;

export type ShotName = (typeof DEFAULT_SHOTS)[number] | string;

export async function captureNamedShots(args: {
	url: string;
	outDir: string;
	shots?: ShotName[];
}): Promise<{ name: string; path: string; hash: string }[]> {
	const shots = args.shots ?? [...DEFAULT_SHOTS];
	await mkdir(args.outDir, { recursive: true });
	const results: { name: string; path: string; hash: string }[] = [];
	for (const name of shots) {
		const viewport =
			name === "mobile"
				? { width: 390, height: 844 }
				: { width: 1440, height: 900 };
		const out = path.join(args.outDir, `${name}.png`);
		const shot = await screenshotUrl(args.url, out, viewport);
		results.push({ name, path: shot.path, hash: shot.hash });
	}
	await writeFile(
		path.join(args.outDir, "shots.json"),
		JSON.stringify(results, null, 2) + "\n",
		"utf8",
	);
	return results;
}

/** Very light regression signal — hash + bytes. Prefer compareFramesGrid for apex. */
export async function compareFrames(
	aPath: string,
	bPath: string,
): Promise<{
	sameHash: boolean;
	hashA: string;
	hashB: string;
	byteDelta: number;
	note: string;
}> {
	const a = await readFile(aPath);
	const b = await readFile(bPath);
	const hashA = createHash("sha256").update(a).digest("hex");
	const hashB = createHash("sha256").update(b).digest("hex");
	return {
		sameHash: hashA === hashB,
		hashA,
		hashB,
		byteDelta: Math.abs(a.byteLength - b.byteLength),
		note: "Smoke hash compare. Use gauntlet compare --grid for edge-energy (apex-style).",
	};
}

/**
 * CONTRACT.md scaffold — apex lesson: shared interfaces before parallel fan-out.
 */
export function renderContractMd(args: {
	goal: string;
	barName: string;
	stack: string;
	pieces: string[];
	previewUrl?: string;
}): string {
	return `# CONTRACT — Gauntlet Apex Run

> Binding interface doc. Fifteen specialists must not thrash each other.
> Read before changing a shared signature.

## Mission

${args.goal}

## Bar

${args.barName}

## Stack

${args.stack}

## Preview / capture

- Preview URL: ${args.previewUrl ?? "(set with --preview-url)"}
- Capture: \`gauntlet shot --url <preview> --out evidence/shots\`
- Critics score **frames**, not source listings.

## Pieces (disjoint ownership)

${args.pieces.map((p) => `- \`${p}\` — sole owner until integration barrier`).join("\n")}

## Capture contract (fill for games)

Expose on \`window.__GAUNTLET__\` when building interactive/WebGL work:

\`\`\`js
{
  pause(): void,
  resume(): void,
  renderFrame(i: number): void,  // fixed dt
  getPose(name: string): object
}
\`\`\`

Named shots: ${DEFAULT_SHOTS.join(", ")} (+ project-specific).

## House rules

- No inventing bar evidence.
- No critic reuse across retries of the same piece.
- Human gates / budget outrank “keep looping.”
- Checkpoint after every round: \`checkpoint.json\` + git commit recommended.

## Attribution

Technique: Matt Shumer. Long-run harness lessons: [jolbol1/apex-gp](https://github.com/jolbol1/apex-gp).
Role-split contracts: [NicholasSpisak/gauntlet-loop](https://github.com/NicholasSpisak/gauntlet-loop).
`;
}

export async function writeContractFile(
	dir: string,
	args: Parameters<typeof renderContractMd>[0],
): Promise<string> {
	const p = path.join(dir, "CONTRACT.md");
	await writeFile(p, renderContractMd(args) + "\n", "utf8");
	return p;
}
