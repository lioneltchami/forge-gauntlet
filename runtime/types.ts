import { z } from "zod";

export const GoalTypeSchema = z.enum([
  "site",
  "writing",
  "code",
  "game",
  "research",
  "other",
]);
export type GoalType = z.infer<typeof GoalTypeSchema>;

export const MeasurableSchema = z.object({
  metric: z.string().min(1),
  target: z.string().min(1),
  ours: z.string().optional(),
  met: z.boolean().optional(),
});
export type Measurable = z.infer<typeof MeasurableSchema>;

export const BarCandidateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  url: z.string().url().optional(),
  notes: z.string().optional(),
  measurable: MeasurableSchema.optional(),
});
export type BarCandidate = z.infer<typeof BarCandidateSchema>;

export const BarValidationSchema = z.object({
  named: z.boolean(),
  fetchable: z.boolean(),
  comparable: z.boolean(),
  ok: z.boolean(),
  reasons: z.array(z.string()),
  snapshotPath: z.string().optional(),
  snapshotHash: z.string().optional(),
  contentType: z.enum(["url", "text", "local"]).optional(),
});
export type BarValidation = z.infer<typeof BarValidationSchema>;

export const PieceStatusSchema = z.enum([
  "pending",
  "building",
  "critiquing",
  "won",
  "stopped",
  "failed",
]);
export type PieceStatus = z.infer<typeof PieceStatusSchema>;

export const PieceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: PieceStatusSchema,
  round: z.number().int().nonnegative(),
  lastVerdict: z.enum(["ours", "bar"]).nullable(),
  gap: z.string().nullable(),
  error: z.string().nullable().optional(),
  artifactPath: z.string().nullable(),
  openAs: z.string().nullable(),
});
export type Piece = z.infer<typeof PieceSchema>;

export const VerdictSchema = z.object({
  winner: z.enum(["ours", "bar"]),
  gap: z.string(),
  confidence: z.number().min(0).max(1),
  measurableMet: z.boolean().optional(),
  note: z.string().optional(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const RunStatusSchema = z.enum([
  "proposed",
  "running",
  "completed",
  "stopped_by_user",
  "failed_bar",
  "failed_agent",
  "failed_evidence",
  "blocked_gate",
  "budget_exhausted",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const BudgetStateSchema = z.object({
  maxUsd: z.number().optional(),
  maxTokens: z.number().optional(),
  usedUsd: z.number(),
  usedTokens: z.number(),
  exhausted: z.boolean(),
  accountingError: z.string().optional(),
});
export type BudgetState = z.infer<typeof BudgetStateSchema>;

export const RunMetaSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: RunStatusSchema,
  goal: z.string(),
  goalType: GoalTypeSchema,
  bar: BarCandidateSchema,
  barValidation: BarValidationSchema.optional(),
  stack: z.string().optional(),
  budget: z.string().optional(),
  agentEnv: z
    .enum(["cursor", "claude-code", "codex", "generic"])
    .default("generic"),
  implementer: z
    .enum(["codex", "claude", "cursor", "local"])
    .default("local")
    .optional(),
  mode: z.enum(["standard", "apex"]).default("standard").optional(),
  measurable: MeasurableSchema.optional(),
  humanGates: z.array(z.string()).optional(),
  safetyNever: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  budgetState: BudgetStateSchema.optional(),
  previewUrl: z.string().optional(),
  climbUntilHumanStop: z.boolean().optional(),
});
export type RunMeta = z.infer<typeof RunMetaSchema>;

export const BuilderOutputSchema = z.object({
  artifactPath: z.string(),
  openAs: z.string(),
  notes: z.string().optional(),
});
export type BuilderOutput = z.infer<typeof BuilderOutputSchema>;
