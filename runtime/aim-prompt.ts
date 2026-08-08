import type { GoalType } from "./types.js";

export type AimPromptInput = {
  goal: string;
  barName: string;
  barUrl?: string;
  measurable?: { metric: string; target: string };
  budget?: string;
  stack?: string;
  agentEnv: "cursor" | "claude-code" | "codex" | "generic";
};

export function loopVerbs(env: AimPromptInput["agentEnv"]): string {
  if (env === "claude-code") {
    return "/loop on each piece until the critic picks ours blind. Do not stop before that. Fan out subagents and ultracode.";
  }
  if (env === "cursor") {
    return "Keep looping each piece until the critic picks ours blind. Run the builder and critic as separate subagents with isolated context.";
  }
  if (env === "codex") {
    return "Dispatch each piece to Codex via the delegation contract. On retry use task --resume-last with critic gap only. Fresh blind critic every retry.";
  }
  return "Keep looping until the critic picks ours. Run the builders and critics as parallel subagents.";
}

export function writeAimPrompt(input: AimPromptInput): string {
  const bar = input.barUrl
    ? `${input.barName} (${input.barUrl})`
    : input.barName;
  const lines: string[] = [];
  lines.push(`Build ${input.goal}.`);
  lines.push("");
  lines.push(
    `The bar is ${bar}. Get the real thing first and compare against it directly, not against a description of it.`,
  );
  if (input.measurable) {
    lines.push(
      `Also beat ${input.measurable.metric} = ${input.measurable.target}. Taste and the number both have to win.`,
    );
  }
  if (input.budget) lines.push(`Stay under ${input.budget}.`);
  if (input.stack) lines.push(`Do this in ${input.stack}.`);
  lines.push("");
  lines.push(
    "Break this into the smallest pieces that can be improved and judged on their own. For each piece, fan out a builder and a separate critic with fresh context. The critic inspects the actual output, puts it next to the bar blind with the labels stripped, says which one is better, and names the single biggest remaining gap. Then it goes back to the builder.",
  );
  lines.push("");
  lines.push(
    "The critic should be a harsh critic. Praise is not useful. If ours does not win, it keeps going.",
  );
  lines.push("");
  lines.push(loopVerbs(input.agentEnv));
  lines.push("");
  lines.push(
    "Keep a live progress page updating as the work evolves so I can watch it.",
  );
  lines.push("");
  lines.push("Fan out subagents.");
  return lines.join("\n");
}

export function detectAgentEnv(
  hint?: string,
): "cursor" | "claude-code" | "codex" | "generic" {
  const h = (hint ?? process.env.GAUNTLET_AGENT_ENV ?? "").toLowerCase();
  if (h.includes("codex")) return "codex";
  if (h.includes("claude")) return "claude-code";
  if (h.includes("cursor")) return "cursor";
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_AGENT) return "cursor";
  return "generic";
}

export function defaultStackForGoal(goalType: GoalType): string | undefined {
  if (goalType === "site") return "HTML/CSS (or your project stack)";
  if (goalType === "game") return "Three.js";
  return undefined;
}
