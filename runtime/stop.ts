import {
  findActiveRunId,
  readMeta,
  readPieces,
  requestStop,
  runDir,
  writeMeta,
  writePieces,
  writeProgress,
} from "./ledger.js";
import type { RunMeta } from "./types.js";

export async function stopRun(
  runId?: string,
  cwd = process.cwd(),
): Promise<RunMeta> {
  const id = runId ?? (await findActiveRunId(cwd));
  if (!id) throw new Error("No active run to stop.");
  const dir = runDir(id, cwd);
  const meta = await readMeta(dir);
  if (meta.status === "completed" || meta.status === "stopped_by_user") {
    return meta;
  }
  await requestStop(dir);
  meta.status = "stopped_by_user";
  meta.updatedAt = new Date().toISOString();
  const pieces = await readPieces(dir);
  for (const p of pieces) {
    if (p.status !== "won") p.status = "stopped";
  }
  await writeMeta(dir, meta);
  await writePieces(dir, pieces);
  await writeProgress(dir, meta, pieces);
  return meta;
}

export function shouldContinue(meta: RunMeta): boolean {
  return meta.status === "running" && !meta.budgetState?.exhausted;
}
