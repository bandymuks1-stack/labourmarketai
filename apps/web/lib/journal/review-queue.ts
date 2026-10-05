import "server-only";

import { createClient } from "@/lib/supabase/server";
import { recognizeEntryDepth } from "@/lib/structuring/recognize-entry";
import { resolveWorkDay, type WorkTimeMetricRow } from "@/lib/journal/work-time";
import {
  WORKER_NAME_FIELDS,
  resolveWorkerName,
  type WorkerNameRow,
} from "@/lib/journal/worker-name";
import {
  scopeSkillsToConfirm,
  type QuickConfirmScope,
  type QuickQueueSkill,
} from "@/lib/journal/quick-confirm-model";

export type { QuickConfirmScope, QuickQueueSkill };

/**
 * One-Tap Confirm queue (S3.5) — the shared read model for the manager's
 * quick-confirm view. Reuses the SAME gated source as the inbox: the
 * SECURITY DEFINER `reviewable_journal_entry_ids` RPC (migration 0034) is
 * the only thing that decides what is reviewable. No new read scope, no
 * write here at all — confirms go through the existing RPC chain only.
 *
 * Slugs (skills / recognized works) are returned untranslated; the page
 * translates them, mirroring the inbox page's slug→JSON name pattern (§2).
 *
 * CONFIRM SCOPE (window 6): the tap verifies the skills THIS entry is linked
 * to (`journal_entry_skills`, manager-readable by its own RLS), not the
 * worker's whole declared list — see quick-confirm-model.ts for the rule.
 */

export type QuickQueueEntry = {
  id: string;
  workerName: string;
  createdAt: string;
  /** The day the work happened — the SAME rule as the journal and the
   *  calendar (`resolveWorkDay`): the stated `work_date`, else the filing day.
   *  A reviewer confirms WORK; showing the filing day put the wrong date on
   *  the card (production walk 2026-09-28). */
  workDay: string;
  originalText: string;
  /** Deterministic work items recognized from the text — display only. */
  recognizedSlugs: string[];
  /** Exactly the set a one-tap confirm would verify — scoped to the entry's
   *  linked skills when it has links. Shown explicitly on the card. */
  skillsToConfirm: QuickQueueSkill[];
  /** Which rule produced `skillsToConfirm` (named state, never guessed). */
  confirmScope: QuickConfirmScope;
};

/**
 * The queue with the FAILURE told apart from "nothing to review" (SEP-7).
 *   ok               the gated set was read; `entries` is empty when nothing waits
 *   needs-migration  the gating RPC is not applied — nothing can be reviewable yet
 *   unavailable      the gating RPC or the entry read FAILED — NOT an empty queue
 * `fetchQuickReviewQueue` keeps its historical shape and delegates.
 */
export type QuickReviewQueueResult =
  | { status: "ok"; entries: QuickQueueEntry[] }
  | { status: "needs-migration" }
  | { status: "unavailable" };

type ReviewableIdsRead =
  | { status: "ok"; ids: string[] }
  | { status: "needs-migration" }
  | { status: "unavailable" };

async function readReviewableIds(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ReviewableIdsRead> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: idRows, error } = await (supabase as any).rpc("reviewable_journal_entry_ids");
    if (error) {
      return error.code === "42883" || error.code === "PGRST202" || error.code === "42P01"
        ? { status: "needs-migration" }
        : { status: "unavailable" };
    }
    if (!Array.isArray(idRows)) return { status: "unavailable" };
    const ids = idRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) =>
        typeof r === "string"
          ? r
          : (r?.reviewable_journal_entry_ids ?? r?.id ?? null),
      )
      .filter((v: unknown): v is string => typeof v === "string");
    return { status: "ok", ids };
  } catch {
    return { status: "unavailable" };
  }
}

export async function readQuickReviewQueueResult(): Promise<QuickReviewQueueResult> {
  const supabase = await createClient();
  const gate = await readReviewableIds(supabase);
  if (gate.status !== "ok") return gate;
  try {
    return { status: "ok", entries: await queueFromIds(supabase, gate.ids) };
  } catch {
    return { status: "unavailable" };
  }
}

export async function fetchQuickReviewQueue(): Promise<QuickQueueEntry[]> {
  const supabase = await createClient();
  // Gated reviewable set — degrades to an empty queue until applied (honest).
  // Historical shape: an unreadable gate is also an empty queue here; the
  // entry read below still THROWS. Honest callers use readQuickReviewQueueResult.
  const gate = await readReviewableIds(supabase);
  return gate.status === "ok" ? queueFromIds(supabase, gate.ids) : [];
}

async function queueFromIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewableIds: string[],
): Promise<QuickQueueEntry[]> {
  if (reviewableIds.length === 0) return [];

  const { data: rows, error: rowsError } = await supabase
    .from("journal_entries")
    .select(
      `id, original_text, created_at, worker_id, workers!inner(${WORKER_NAME_FIELDS})`,
    )
    .in("id", reviewableIds)
    .order("created_at", { ascending: true });
  // FAILED ≠ EMPTY (SEP-7). A read that failed is thrown, never returned as
  // "nothing to review": the quick inbox names the state, and the chat and
  // the opening brief already catch a thrown read and say nothing rather than
  // invent an empty queue.
  if (rowsError) {
    throw new Error(`review_queue_unavailable:${rowsError.code ?? "unknown"}`);
  }
  const entries = rows ?? [];
  if (entries.length === 0) return [];

  // Declared-unverified skills per worker — the candidate set. A failed read
  // is a NAMED state (`skillsUnavailable`), never an empty list pretending
  // the worker has nothing to confirm.
  const workerIds = [
    ...new Set(entries.map((r) => r.worker_id).filter(Boolean)),
  ] as string[];
  const skillsByWorker = new Map<string, QuickQueueSkill[]>();
  let skillsUnavailable = false;
  if (workerIds.length > 0) {
    const wsRes = await supabase
      .from("worker_skills")
      .select("worker_id, skill_id, verified, skills(slug)")
      .in("worker_id", workerIds);
    if (wsRes.error) {
      skillsUnavailable = true;
    } else {
      for (const r of wsRes.data ?? []) {
        const slug = (r.skills as { slug: string | null } | null)?.slug;
        if (!r.worker_id || !r.skill_id || !slug) continue;
        if (r.verified === true) continue; // already verified — nothing to confirm
        const list = skillsByWorker.get(r.worker_id) ?? [];
        list.push({ id: r.skill_id, slug });
        skillsByWorker.set(r.worker_id, list);
      }
    }
  }

  // The entry ↔ skill links (bounded to the reviewable ids; RLS lets the
  // manager of the entry's organization read them). A failed read means
  // "links unknown" → the per-worker fallback applies, still fully listed.
  const entryIds = entries.map((r) => r.id);
  let linksByEntry: Map<string, Set<string>> | null = new Map();
  const linkRes = await supabase
    .from("journal_entry_skills")
    .select("journal_entry_id, skill_id")
    .in("journal_entry_id", entryIds);
  if (linkRes.error) {
    linksByEntry = null;
  } else {
    for (const l of linkRes.data ?? []) {
      if (!l.journal_entry_id || !l.skill_id) continue;
      const set = linksByEntry.get(l.journal_entry_id) ?? new Set<string>();
      set.add(l.skill_id);
      linksByEntry.set(l.journal_entry_id, set);
    }
  }

  // Stated work days, one bounded read. Unreadable → the filing day, the
  // same fallback `resolveWorkDay` applies to an entry with no stated day.
  const workDateRows = new Map<string, WorkTimeMetricRow[]>();
  const wdRes = await supabase
    .from("journal_entry_metrics")
    .select("entry_id, metric_slug, value_text, value_numeric, unit_slug, created_at")
    .in("entry_id", entryIds)
    .eq("metric_slug", "work_date");
  for (const m of (wdRes.data ?? []) as (WorkTimeMetricRow & { entry_id: string })[]) {
    const list = workDateRows.get(m.entry_id) ?? [];
    list.push(m);
    workDateRows.set(m.entry_id, list);
  }

  return entries.map((r) => {
    const workerName = resolveWorkerName(r.workers as WorkerNameRow);
    const depth = recognizeEntryDepth(r.original_text ?? "");
    const scoped = scopeSkillsToConfirm({
      linkedSkillIds: linksByEntry === null ? null : (linksByEntry.get(r.id) ?? new Set()),
      workerUnverified: skillsUnavailable
        ? null
        : r.worker_id
          ? (skillsByWorker.get(r.worker_id) ?? [])
          : [],
    });
    return {
      id: r.id,
      workerName,
      createdAt: r.created_at,
      workDay: resolveWorkDay(workDateRows.get(r.id) ?? [], r.created_at),
      originalText: r.original_text ?? "",
      recognizedSlugs: depth.works.map((w) => w.slug),
      skillsToConfirm: scoped.skills,
      confirmScope: scoped.scope,
    };
  });
}
