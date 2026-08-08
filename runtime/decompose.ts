import type { GoalType, Piece } from "./types.js";

const SITE_PIECES = [
	"hero",
	"typography",
	"color",
	"imagery",
	"motion",
	"mobile",
];
const WRITING_PIECES = ["opening", "explanations", "analogies", "ending"];
const CODE_PIECES = ["cli-ux", "core-behavior", "docs", "tests"];
const GAME_PIECES = ["player-feel", "visuals", "audio", "hud", "loop"];
const RESEARCH_PIECES = ["question", "methods", "evidence", "conclusions"];
const OTHER_PIECES = ["core", "polish", "edge-cases"];

export function decompose(goal: string, goalType: GoalType): Piece[] {
	const names =
		goalType === "site"
			? SITE_PIECES
			: goalType === "writing"
				? WRITING_PIECES
				: goalType === "code"
					? CODE_PIECES
					: goalType === "game"
						? GAME_PIECES
						: goalType === "research"
							? RESEARCH_PIECES
							: OTHER_PIECES;

	// Allow goal to hint fewer pieces via "pieces: a, b, c"
	const match = goal.match(/pieces:\s*([^.\n]+)/i);
	const custom = match
		? match[1]
				.split(/[,/|]/)
				.map((s) => s.trim())
				.filter(Boolean)
		: null;
	const list = custom && custom.length > 0 ? custom : names;

	return list.map((name, i) => ({
		id: `piece-${String(i + 1).padStart(2, "0")}`,
		name,
		status: "pending" as const,
		round: 0,
		lastVerdict: null,
		gap: null,
		artifactPath: null,
		openAs: null,
	}));
}
