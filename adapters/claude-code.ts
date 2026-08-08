/** Claude Code adapter — map to /loop + ultracode. */
export const CLAUDE_CODE_LOOP_VERBS =
  "/loop on each piece until the critic picks ours blind. Do not stop before that. Fan out subagents and ultracode.";

export function claudeCodePieceLoopPrompt(pieceName: string): string {
  return [
    `Focus on piece: ${pieceName}.`,
    "Builder improves the artifact. Separate critic does blind A/B vs the fetched bar.",
    CLAUDE_CODE_LOOP_VERBS,
  ].join("\n");
}
