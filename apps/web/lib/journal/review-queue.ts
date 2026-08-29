import "server-only";

import { createClient } from "@/lib/supabase/server";
import { recognizeEntryDepth } from "@/lib/structuring/recognize-entry";
import {
  WORKER_NAME_FIELDS,
  resolveWorkerName,
  type WorkerNameRow,
} from "@/lib/journal/worker-name";

/**
 * One-Tap Confirm queue (S3.5) — the shared read model for the manager's
 * quick-confirm view. Reuses the SAME gated source as the inbox: the
 * SECURITY DEFINER `reviewable_journal_entry_ids` RPC (migration 0034) is
 * the only thing that decides what is reviewable. No new read scope, no
 * write here at all — confirms go through the existing RPC chain only.
 *
 * Slugs (skills / recognized works) are returned untranslated; the page
 * translates them, mirroring the inbox page's slug→JSON name pattern (§2).
 */

export type QuickQueueSkill = { id: string; slug: string };

export type QuickQueueEntry = {
  id: string;
  workerName: string;
  createdAt: string;
  originalText: string;
  /** Deterministic work items recognized from the text — display only. */
  recognizedSlugs: string[];
  /** The worker's declared, NOT-yet-verified skills — exactly the set a
   *  one-tap confirm would verify. Shown explicitly on the card. */
  skillsToConfirm: QuickQueueSkill[];
};

export async function fetchQuickReviewQueue(): Promise<QuickQueueEntry[]> {
  const supabase = await createClient();

  // Gated reviewable set — degrades to an empty queue until applied (honest).
  let reviewableIds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: idRows } = await (supabase as any).rpc(
    "reviewable_journal_entry_ids",
  );
  if (Array.isArray(idRows)) {
    reviewableIds = idRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) =>
        typeof r === "string"
          ? r
          : (r?.reviewable_journal_entry_ids ?? r?.id ?? null),
      )
      .filter((v: unknown): v is string => typeof v === "string");
  }
  if (reviewableIds.length === 0) return [];

  const { data: rows } = await supabase
    .from("journal_entries")
    .select(
      `id, original_text, created_at, worker_id, workers!inner(${WORKER_NAME_FIELDS})`,
    )
    .in("id", reviewableIds)
    .order("created_at", { ascending: true });
  const entries = rows ?? [];
  if (entries.length === 0) return [];

  // Declared-unverified skills per worker — the explicit confirm set.
  const workerIds = [
    ...new Set(entries.map((r) => r.worker_id).filter(Boolean)),
  ] as string[];
  const skillsByWorker = new Map<string, QuickQueueSkill[]>();
  if (workerIds.length > 0) {
    const { data: ws } = await supabase
      .from("worker_skills")
      .select("worker_id, skill_id, verified, skills(slug)")
      .in("worker_id", workerIds);
    for (const r of ws ?? []) {
      const slug = (r.skills as { slug: string | null } | null)?.slug;
      if (!r.worker_id || !r.skill_id || !slug) continue;
      if (r.verified === true) continue; // already verified — nothing to confirm
      const list = skillsByWorker.get(r.worker_id) ?? [];
      list.push({ id: r.skill_id, slug });
      skillsByWorker.set(r.worker_id, list);
    }
  }

  return entries.map((r) => {
    const workerName = resolveWorkerName(r.workers as WorkerNameRow);
    const depth = recognizeEntryDepth(r.original_text ?? "");
    return {
      id: r.id,
      workerName,
      createdAt: r.created_at,
      originalText: r.original_text ?? "",
      recognizedSlugs: depth.works.map((w) => w.slug),
      skillsToConfirm: r.worker_id
        ? (skillsByWorker.get(r.worker_id) ?? [])
        : [],
    };
  });
}
