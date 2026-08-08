import { CLAUDE_CODE_LOOP_VERBS } from "./claude-code.js";
import { CURSOR_LOOP_VERBS } from "./cursor.js";

export type AgentEnv = "cursor" | "claude-code" | "codex" | "generic";

export const CODEX_LOOP_VERBS =
  "Dispatch each piece to Codex via the delegation contract. On retry: task --resume-last with critic gap only. Fresh blind critic every retry.";

export function portableVerbs(env: AgentEnv): string {
  if (env === "claude-code") return CLAUDE_CODE_LOOP_VERBS;
  if (env === "cursor") return CURSOR_LOOP_VERBS;
  if (env === "codex") return CODEX_LOOP_VERBS;
  return "Keep looping until the critic picks ours. Run the builders and critics as parallel subagents.";
}

export function detectEnvFromArgv(argv: string[]): AgentEnv {
  const joined = argv.join(" ").toLowerCase();
  if (joined.includes("codex")) return "codex";
  if (joined.includes("claude")) return "claude-code";
  if (joined.includes("cursor")) return "cursor";
  return "generic";
}
