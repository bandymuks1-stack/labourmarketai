import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { HOURS_EXCEED_DAY_METHOD } from "./parse-tabular";
import {
  deriveEvidenceStanding,
  type RecordLifecycleEvent,
  type ReportedEvidenceState,
} from "./evidence-state";

/**
 * THE MISSING EDGE: organization evidence records → the ONE work model.
 *
 * `organization_evidence_records` had no reader outside the import module
 * (trace 2026-09-16): a committed import reached the history door and the
 * subject's evidence view, and nothing else — not Work in Numbers, not the
 * Living CV, not the team roll-up. Those all compose `loadWorkIntelligence`,
 * which reads the organization's hour ledger through `readOrganizationRecords`.
 * This read hands the SAME model the person's imported history, in the
 * same row shape, so a person who claims their roster row sees their past
 * work everywhere the product shows work — with no second upload and no
 * second write (owner command §41, §58).
 *
 * ── WHAT COUNTS ─────────────────────────────────────────────────────────
 *   · only records whose roster person is LINKED to this worker (the RLS
 *     subject branch requires `link_state = 'linked'` too; a name is never
 *     an identity);
 *   · only live records — a withdrawn import stays readable in the history
 *     door but counts nowhere;
 *   · only dated, plausible hours. A row the import flagged as more than a
 *     day holds (and a human kept AS STATED) is evidence, not a day's
 *     hours: it is shown on the evidence surfaces and summed by no ledger.
 *     Period rows without a single date are likewise not a day.
 *
 * Bounded: one read of the worker's roster links, one read of records.
 * Honest degradation matches the allocation read: a missing table is an
 * EMPTY ledger, a failed read is `null` (UNKNOWN), and the caller's RLS
 * decides what is visible.
 */

const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
/** The same ceiling `work_hour_allocations` reads under. */
const READ_LIMIT = 5000;
const MAX_LINKED_PEOPLE = 50;

export interface WorkerEvidenceRecordRow {
  readonly id: string;
  readonly organizationId: string;
  readonly workDate: string;
  readonly hours: number;
}

export type WorkerEvidenceRead =
  | { readonly kind: "ok"; readonly rows: readonly WorkerEvidenceRecordRow[] }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

// The evidence tables postdate the generated Database types — the same
// escape hatch every gated store uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

export async function readEvidenceRecordsForWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerEvidenceRead> {
  const people = await db(supabase)
    .from("organization_people")
    .select("id")
    .eq("linked_worker_id", workerId)
    .eq("link_state", "linked")
    .limit(MAX_LINKED_PEOPLE);
  if (people.error) {
    if (MISSING_OBJECT_CODES.has(people.error.code ?? "")) return { kind: "needs-migration" };
    console.error("[evidence] roster-link read failed:", people.error.code);
    return { kind: "error" };
  }
  const personIds = ((people.data ?? []) as { id: string }[]).map((p) => p.id);
  if (personIds.length === 0) return { kind: "ok", rows: [] };

  const res = await db(supabase)
    .from("organization_evidence_records")
    .select(
      "id, organization_id, organization_person_id, activity_date, hours, evidence_state, derived, organization_evidence_events!organization_evidence_events_record_fk(event_type, actor_role, actor_profile_id, created_at)",
    )
    .in("organization_person_id", personIds)
    .not("activity_date", "is", null)
    .order("activity_date", { ascending: false })
    .limit(READ_LIMIT);
  if (res.error) {
    if (MISSING_OBJECT_CODES.has(res.error.code ?? "")) return { kind: "needs-migration" };
    console.error("[evidence] worker records read failed:", res.error.code);
    return { kind: "error" };
  }

  const rows: WorkerEvidenceRecordRow[] = [];
  for (const r of (res.data ?? []) as Record<string, unknown>[]) {
    const hours = r.hours === null || r.hours === undefined ? null : Number(r.hours);
    if (hours === null || !Number.isFinite(hours) || hours <= 0) continue;
    const derived = (r.derived as Record<string, unknown> | null) ?? {};
    if ((derived.hoursPlausibility as { method?: string } | undefined)?.method === HOURS_EXCEED_DAY_METHOD) continue;
    const events = ((r.organization_evidence_events as Record<string, unknown>[] | null) ?? []).map(
      (e): RecordLifecycleEvent => ({
        eventType: e.event_type as RecordLifecycleEvent["eventType"],
        actorRole: (e.actor_role as string | null) ?? null,
        actorProfileId: (e.actor_profile_id as string | null) ?? null,
        createdAt: (e.created_at as string | null) ?? null,
      }),
    );
    const standing = deriveEvidenceStanding(r.evidence_state as ReportedEvidenceState, events);
    if (standing.withdrawn) continue;
    rows.push({
      id: r.id as string,
      organizationId: r.organization_id as string,
      workDate: r.activity_date as string,
      hours,
    });
  }
  return { kind: "ok", rows };
}
