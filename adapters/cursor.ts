/** Cursor adapter — how the skill should fan out builders/critics. */
export function cursorFanoutInstructions(
  pieceName: string,
  gap: string | null,
): {
  builderTask: string;
  criticTask: string;
} {
  return {
    builderTask: [
      `You are the BUILDER for gauntlet piece "${pieceName}".`,
      gap ? `Previous critic gap to close: ${gap}` : "This is the first pass.",
      "Produce the artifact only. Do not critique yourself. Do not score quality.",
    ].join("\n"),
    criticTask: [
      `You are the CRITIC for gauntlet piece "${pieceName}".`,
      "You have fresh context. You do not know how the builder tried.",
      "You will receive unlabeled A/B evidence only. Pick A or B. Binary. One gap sentence.",
      "Never use scores out of 10.",
    ].join("\n"),
  };
}

export const CURSOR_LOOP_VERBS =
  "Keep looping each piece until the critic picks ours blind. Run the builder and critic as separate Task/subagents with isolated context.";
