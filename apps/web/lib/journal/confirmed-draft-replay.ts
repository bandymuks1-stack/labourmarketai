import "server-only";

import { readWorkerCoreRow } from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";
import type { JournalSkillPipelineResult } from "@/lib/journal/skill-pipeline";
import { findConfirmedDraftEntry, runSkillPipeline } from "@/lib/journal/journal-write-core";

/**
 * THE ONE "ALREADY RECORDED" ANSWER for a confirmed journal draft whose
 * single-use token was refused as stale (P0-A 2026-10-30) — shared by the
 * MCP / mobile `journal.confirm` capability and the web chat's
 * `worker.log-work` dispatch, so both transports answer a retry after a lost
 * response the same way.
 *
 * The caller has ALREADY established that the token is genuine for this
 * exact draft and caller (`genuineTokenIssuedAt`) and passes the EXACT
 * FormData mapping its confirm sends to the write core; this only asks
 * whether that write happened (`findConfirmedDraftEntry`: a live entry
 * recorded after the token that carries every one of those facts) and, if
 * so, returns it with the skill pipeline's outcome. The pipeline is
 * idempotent — the create core's duplicate path runs it the same way. No
 * entry is written here.
 */
export async function alreadyRecordedJournalEntry(
  caller: DomainCaller,
  fields: Readonly<Record<string, string>>,
  issuedAtMs: number,
): Promise<{ entryId: string; skills: JournalSkillPipelineResult } | null> {
  const workerRead = await readWorkerCoreRow(caller);
  if (!workerRead.ok || !workerRead.value) return null;
  const entryId = await findConfirmedDraftEntry(caller.supabase, {
    workerId: workerRead.value.id,
    fields,
    issuedAtMs,
  });
  if (!entryId) return null;
  const skills = await runSkillPipeline({
    entryId,
    text: String(fields.notes ?? "").trim(),
    locale: caller.locale ?? "lt",
    excludeSlugs: [],
    caller: { supabase: caller.supabase, userId: caller.userId },
  });
  return { entryId, skills };
}
