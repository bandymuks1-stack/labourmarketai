import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Phase 3.2 Human-Run Matching Workbench — data layer.
 *
 * Marketplace v1 heart per the canonical product plan §8: a HUMAN sees open
 * demand (`customer_requests`, the ONE canonical intake — doctrine §17) next
 * to the worker supply, decides, and records the decision + a feedback note.
 * No automatic matching, no scoring, no ranking — the worker list is ordered
 * by recency only and every recorded match is a human decision.
 *
 * READ side: user-scoped client; customer_requests SELECT RLS (0028) and
 * workers/worker_skills/journal RLS (0001/0013) give a real admin session
 * every row; a non-admin sees only their own. The page is additionally gated
 * by requireSuperadmin.
 *
 * WRITE side: recordHumanMatch uses the EXISTING admin UPDATE RLS on
 * customer_requests (0028: `profile_id = auth.uid() or is_admin()`), so NO
 * migration and NO new table is needed: the decision is appended to
 * `payload.match_log` (append-only array inside the existing jsonb column),
 * the feedback note lands in `manual_review_note`, and the request moves
 * through the EXISTING status ladder. Degrades to needs-migration when the
 * consolidation columns (42703) or table (42P01) are absent.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Statuses the workbench may set — a human review outcome, never 'draft'
 *  (owner-only) and never a silent close. */
export type WorkbenchStatus = "in_review" | "needs_followup" | "approved";

export const WORKBENCH_STATUSES: readonly WorkbenchStatus[] = [
  "in_review",
  "needs_followup",
  "approved",
];

/** Open demand statuses shown on the board. */
const OPEN_STATUSES = ["submitted", "in_review", "needs_followup"] as const;

export interface MatchLogEntry {
  readonly worker_id: string;
  readonly worker_name: string | null;
  readonly note: string | null;
  readonly status_set: WorkbenchStatus;
  readonly decided_by: string;
  /** Server-side ISO timestamp (Next server action, not client-supplied). */
  readonly decided_at: string;
  /** Honest provenance marker — every entry is a human decision. */
  readonly decided_via: "human";
}

export interface DemandRow {
  readonly id: string;
  readonly title: string;
  readonly kind: string | null;
  readonly needSummary: string | null;
  readonly country: string | null;
  readonly location: string | null;
  readonly roleOrWorkType: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly duration: string | null;
  readonly languageRequirement: string | null;
  readonly notes: string | null;
  readonly status: string;
  readonly manualReviewNote: string | null;
  /** Free-form per-kind fields the author actually typed (payload minus our
   *  match_log) — rendered as-is, never invented. */
  readonly payloadFields: ReadonlyArray<{ key: string; value: string }>;
  readonly matchLog: readonly MatchLogEntry[];
  readonly createdAt: string;
}

export interface SupplyWorkerRow {
  readonly id: string;
  /** profiles.id — the messaging identity for "start conversation". */
  readonly profileId: string | null;
  readonly displayName: string | null;
  readonly headline: string | null;
  readonly availabilityStatus: string | null;
  readonly availableFrom: string | null;
  readonly locationCountry: string | null;
  readonly preferredCountries: readonly string[];
  readonly experienceYears: number | null;
  readonly professionSlugs: readonly string[];
  /** Self-declared skills — honest label, never "verified". */
  readonly skillsDeclared: number;
  /** worker_skills rows with verified=true (manager-confirmed path). */
  readonly skillsConfirmed: number;
  /** Journal evidence — real counts, 0 is a plain 0. */
  readonly journalEntries: number;
  readonly managerConfirmations: number;
}

export type WorkbenchListResult =
  | {
      kind: "ok";
      demand: readonly DemandRow[];
      supply: readonly SupplyWorkerRow[];
    }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type RecordMatchResult =
  | { kind: "ok" }
  | { kind: "not-admin" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

function isMatchLogEntry(v: unknown): v is MatchLogEntry {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as MatchLogEntry).worker_id === "string" &&
    typeof (v as MatchLogEntry).decided_at === "string"
  );
}

function parseMatchLog(payload: unknown): MatchLogEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const log = (payload as { match_log?: unknown }).match_log;
  if (!Array.isArray(log)) return [];
  return log.filter(isMatchLogEntry);
}

function payloadFields(
  payload: unknown,
): Array<{ key: string; value: string }> {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>)
    .filter(([k, v]) => k !== "match_log" && v !== null && v !== "")
    .filter(([, v]) => typeof v !== "object")
    .map(([key, value]) => ({ key, value: String(value) }));
}

export async function listWorkbench(): Promise<WorkbenchListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", demand: [], supply: [] };

  const { data: requests, error } = await asAny(supabase)
    .from("customer_requests")
    .select(
      "id, title, kind, need_summary, country, location, role_or_work_type, team_size, start_period, duration, language_requirement, notes, status, manual_review_note, payload, created_at",
    )
    .in("status", [...OPEN_STATUSES])
    .order("created_at", { ascending: false });
  if (error) {
    if (
      error.code === RELATION_NOT_FOUND_CODE ||
      error.code === UNDEFINED_COLUMN_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const demand: DemandRow[] = ((requests ?? []) as any[]).map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? "—",
    kind: (r.kind as string | null) ?? null,
    needSummary: (r.need_summary as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    roleOrWorkType: (r.role_or_work_type as string | null) ?? null,
    teamSize: (r.team_size as number | null) ?? null,
    startPeriod: (r.start_period as string | null) ?? null,
    duration: (r.duration as string | null) ?? null,
    languageRequirement: (r.language_requirement as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: (r.status as string) ?? "submitted",
    manualReviewNote: (r.manual_review_note as string | null) ?? null,
    payloadFields: payloadFields(r.payload),
    matchLog: parseMatchLog(r.payload),
    createdAt: r.created_at as string,
  }));

  // ── Supply: workers + honest signal counts (recency order, NO ranking) ──
  const { data: workers, error: wErr } = await asAny(supabase)
    .from("workers")
    .select(
      "id, profile_id, display_name, headline, availability_status, available_from, current_location_country, preferred_countries, experience_years, created_at",
    )
    .order("created_at", { ascending: false });
  if (wErr) return { kind: "error", message: wErr.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerRows = (workers ?? []) as any[];
  const workerIds = workerRows.map((w) => w.id as string);

  const professionsByWorker = new Map<string, string[]>();
  const declaredByWorker = new Map<string, number>();
  const confirmedByWorker = new Map<string, number>();
  const entriesByWorker = new Map<string, number>();
  const confirmationsByWorker = new Map<string, number>();

  if (workerIds.length > 0) {
    const [profs, skills, entries] = await Promise.all([
      asAny(supabase)
        .from("worker_professions")
        .select("worker_id, professions ( slug )")
        .in("worker_id", workerIds),
      asAny(supabase)
        .from("worker_skills")
        .select("worker_id, verified")
        .in("worker_id", workerIds),
      asAny(supabase)
        .from("journal_entries")
        .select("id, worker_id")
        .in("worker_id", workerIds),
    ]);

    for (const p of (profs.data ?? []) as {
      worker_id: string;
      professions: { slug: string } | null;
    }[]) {
      const slug = p.professions?.slug;
      if (!slug) continue;
      const list = professionsByWorker.get(p.worker_id) ?? [];
      list.push(slug);
      professionsByWorker.set(p.worker_id, list);
    }
    for (const s of (skills.data ?? []) as {
      worker_id: string;
      verified: boolean;
    }[]) {
      declaredByWorker.set(
        s.worker_id,
        (declaredByWorker.get(s.worker_id) ?? 0) + 1,
      );
      if (s.verified) {
        confirmedByWorker.set(
          s.worker_id,
          (confirmedByWorker.get(s.worker_id) ?? 0) + 1,
        );
      }
    }

    const entryRows = (entries.data ?? []) as { id: string; worker_id: string }[];
    const workerByEntry = new Map<string, string>();
    for (const e of entryRows) {
      entriesByWorker.set(
        e.worker_id,
        (entriesByWorker.get(e.worker_id) ?? 0) + 1,
      );
      workerByEntry.set(e.id, e.worker_id);
    }
    if (entryRows.length > 0) {
      const { data: confs } = await asAny(supabase)
        .from("journal_entry_confirmations")
        .select("entry_id")
        .in(
          "entry_id",
          entryRows.map((e) => e.id),
        );
      for (const c of (confs ?? []) as { entry_id: string }[]) {
        const wid = workerByEntry.get(c.entry_id);
        if (!wid) continue;
        confirmationsByWorker.set(
          wid,
          (confirmationsByWorker.get(wid) ?? 0) + 1,
        );
      }
    }
  }

  const supply: SupplyWorkerRow[] = workerRows.map((w) => ({
    id: w.id as string,
    profileId: (w.profile_id as string | null) ?? null,
    displayName: (w.display_name as string | null) ?? null,
    headline: (w.headline as string | null) ?? null,
    availabilityStatus: (w.availability_status as string | null) ?? null,
    availableFrom: (w.available_from as string | null) ?? null,
    locationCountry: (w.current_location_country as string | null) ?? null,
    preferredCountries: (w.preferred_countries as string[] | null) ?? [],
    experienceYears: (w.experience_years as number | null) ?? null,
    professionSlugs: professionsByWorker.get(w.id as string) ?? [],
    skillsDeclared: declaredByWorker.get(w.id as string) ?? 0,
    skillsConfirmed: confirmedByWorker.get(w.id as string) ?? 0,
    journalEntries: entriesByWorker.get(w.id as string) ?? 0,
    managerConfirmations: confirmationsByWorker.get(w.id as string) ?? 0,
  }));

  return { kind: "ok", demand, supply };
}

/**
 * Record a HUMAN match decision on a request. Append-only into
 * payload.match_log + feedback note + status move — existing columns, existing
 * admin RLS, no migration. The RLS UPDATE policy (0028) is the authority
 * check: a non-admin updating someone else's request matches 0 rows.
 */
export async function recordHumanMatch(input: {
  requestId: string;
  workerId: string;
  note: string | null;
  status: WorkbenchStatus;
}): Promise<RecordMatchResult> {
  if (!(WORKBENCH_STATUSES as readonly string[]).includes(input.status)) {
    return { kind: "invalid" };
  }
  if (!input.requestId || !input.workerId) return { kind: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-admin" };

  // Resolve the worker honestly (name for the log; must exist).
  const { data: worker, error: wErr } = await asAny(supabase)
    .from("workers")
    .select("id, display_name")
    .eq("id", input.workerId)
    .maybeSingle();
  if (wErr) return { kind: "error", message: wErr.message };
  if (!worker) return { kind: "not-found" };

  const { data: existing, error: rErr } = await asAny(supabase)
    .from("customer_requests")
    .select("id, payload")
    .eq("id", input.requestId)
    .maybeSingle();
  if (rErr) {
    if (
      rErr.code === RELATION_NOT_FOUND_CODE ||
      rErr.code === UNDEFINED_COLUMN_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: rErr.message };
  }
  if (!existing) return { kind: "not-found" };

  const payload =
    existing.payload && typeof existing.payload === "object"
      ? { ...(existing.payload as Record<string, unknown>) }
      : {};
  const log = parseMatchLog(payload);
  const entry: MatchLogEntry = {
    worker_id: input.workerId,
    worker_name: (worker.display_name as string | null) ?? null,
    note: input.note?.trim() || null,
    status_set: input.status,
    decided_by: user.id,
    decided_at: new Date().toISOString(),
    decided_via: "human",
  };
  const nextPayload = { ...payload, match_log: [...log, entry] };

  const { data: updated, error: uErr } = await asAny(supabase)
    .from("customer_requests")
    .update({
      status: input.status,
      manual_review_note: input.note?.trim() || null,
      payload: nextPayload,
    })
    .eq("id", input.requestId)
    .select("id");
  if (uErr) return { kind: "error", message: uErr.message };
  // RLS silently filters rows the caller may not update — 0 rows means the
  // caller is not the owner/admin for this request.
  if (!updated || updated.length === 0) return { kind: "not-admin" };
  return { kind: "ok" };
}
