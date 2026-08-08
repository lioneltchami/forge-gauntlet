import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDispatchDir } from "../runtime/checkpoint.js";
import { buildDelegationXml } from "../runtime/contracts.js";
import type { Piece, RunMeta } from "../runtime/types.js";
import { CLAUDE_CODE_LOOP_VERBS } from "./claude-code.js";
import { CURSOR_LOOP_VERBS, cursorFanoutInstructions } from "./cursor.js";

export type DispatchPacket = {
  kind: "builder" | "critic";
  pieceId: string;
  round: number;
  path: string;
};

/**
 * Write on-disk dispatch packets agents (Claude Code / Codex / Cursor) pick up.
 * Runtime does not shell out to those CLIs — it prepares contracts + evidence paths.
 */
export async function writeBuilderDispatch(args: {
  runDir: string;
  meta: RunMeta;
  piece: Piece;
  gap: string | null;
}): Promise<DispatchPacket> {
  const dir = await ensureDispatchDir(args.runDir);
  const artifactHint = path.join(
    args.runDir,
    "artifacts",
    args.piece.id,
    "index.html",
  );
  const xml = buildDelegationXml({
    pieceName: args.piece.name,
    goal: args.meta.goal,
    gap: args.gap,
    artifactHint,
    runDir: args.runDir,
    humanGates: args.meta.humanGates ?? [],
    safetyNever: args.meta.safetyNever ?? [],
  });

  const env = args.meta.agentEnv;
  const verbs =
    env === "claude-code"
      ? CLAUDE_CODE_LOOP_VERBS
      : env === "cursor"
        ? CURSOR_LOOP_VERBS
        : env === "codex"
          ? "Use Codex task mode for this contract. On retry: task --resume-last with critic gap only."
          : "Keep looping until the critic picks ours. Parallel subagents.";

  const body = [
    `# Builder dispatch — ${args.piece.name} (round ${args.piece.round})`,
    "",
    `Agent env: **${env}** · Implementer: **${args.meta.implementer ?? "local"}**`,
    "",
    "## Verbs",
    verbs,
    "",
    env === "cursor"
      ? cursorFanoutInstructions(args.piece.name, args.gap).builderTask
      : "",
    "",
    "## Delegation contract",
    "```xml",
    xml,
    "```",
    "",
    "## Rules",
    "- Do not critique yourself.",
    "- Do not invent bar evidence.",
    `- Write artifact under \`${artifactHint}\` (or update open-as in notes).`,
    "",
  ].join("\n");

  const out = path.join(
    dir,
    `${args.piece.id}-r${args.piece.round}-builder.md`,
  );
  await writeFile(out, body, "utf8");
  return {
    kind: "builder",
    pieceId: args.piece.id,
    round: args.piece.round,
    path: out,
  };
}

export async function writeCriticDispatch(args: {
  runDir: string;
  piece: Piece;
  criticPromptPath: string;
  leftPath: string;
  rightPath: string;
}): Promise<DispatchPacket> {
  const dir = await ensureDispatchDir(args.runDir);
  const body = [
    `# Critic dispatch — ${args.piece.name} (round ${args.piece.round})`,
    "",
    "**Fresh context only.** Do not read builder dispatch files.",
    "",
    `Prompt: \`${args.criticPromptPath}\``,
    `A: \`${args.leftPath}\``,
    `B: \`${args.rightPath}\``,
    "",
    "Write verdict JSON to the evidence folder as instructed by the runtime prompt.",
    "",
  ].join("\n");
  const out = path.join(dir, `${args.piece.id}-r${args.piece.round}-critic.md`);
  await writeFile(out, body, "utf8");
  return {
    kind: "critic",
    pieceId: args.piece.id,
    round: args.piece.round,
    path: out,
  };
}

export async function writeOrchestratorBrief(
  runDir: string,
  systemPrompt: string,
): Promise<string> {
  await mkdir(path.join(runDir, "dispatch"), { recursive: true });
  const out = path.join(runDir, "dispatch", "ORCHESTRATOR.md");
  await writeFile(out, systemPrompt + "\n", "utf8");
  return out;
}
