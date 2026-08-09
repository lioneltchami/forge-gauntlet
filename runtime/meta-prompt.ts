/**
 * Shumer meta-prompt — paste into a strong model with your goal.
 * From https://somethingbig.ai/gauntlet-loop — adapted for Forge Gauntlet.
 * Output is a short aim prompt to run inside Claude Code / Codex / Cursor.
 */
export function writeMetaPrompt(goal: string, optionalRefs?: string): string {
  const refs = optionalRefs?.trim() || "(none supplied — propose one)";
  return `I want to run a Gauntlet Loop for this goal:

${goal.trim()}

Possible references or quality bars:

${refs}

Choose the strongest concrete bar that an agent can actually inspect and compare its work against. If I have not supplied one, propose a useful comp or measurement that plays the same role for this task that real Call of Duty screenshots played for Matt Shumer's Claude of Duty game (https://github.com/mshumer/Claude-of-Duty/blob/main/prompt.md). Explain the bar in one sentence.

Then write a short prompt for Claude Code or Codex in the style of Matt's prompt (minimal is better — the agent decides the specifics).

Give the lead agent the goal and the bar, but let it choose the approach. Tell it to divide the goal into the smallest pieces that can be improved and judged independently. For each important piece, it should fan out a builder and a separate critic with fresh context.

Each critic must inspect the real output, compare it directly with the bar—using a blind A/B comparison when possible—identify the biggest remaining gap, and send it back for another round. Keep looping until our output wins or I stop the run.

Have the lead agent maintain a simple live progress page (progress.md / workbench.md) that shows the work evolving over time.

Have it use subagents (and ultracode when available). Do not prescribe the architecture, exact decomposition, or a fixed number of rounds. Keep the final prompt short, just like Matt's.

Optional: after all pieces win, one fresh smoothing critic on the integrated whole before accepting done.`;
}
