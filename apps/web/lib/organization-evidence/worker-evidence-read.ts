import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { HOURS_EXCEED_DAY_METHOD } from "./parse-tabular";
import { periodProvenance, type PeriodProvenance } from "./period-provenance";
import { countsAsDailyHours, type TimeSemantics } from "./time-semantics";
import {
  contextWithLookups,
  EMPTY_HISTORY_LOOKUPS,
  lookupIdsOf,
  readHistoryLookups,
} from "./history-context-read";
import type { HistoryContext, HistoryContextInput } from "./professional-history-context";
import {
  deriveEvidenceStanding,
  anyStandingDispute,
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
 *   · DAY rows: dated, plausible hours. A row the import flagged as more
 *     than a day holds (and a human kept AS STATED) is evidence, not a
 *     day's hours: it is shown on the evidence surfaces and summed by no
 *     ledger.
 *   · PERIOD rows (2026-09-20): a record with a start and an end and no
 *     single day ("800 h, 2025-06 → 2025-11") is REAL work with no source
 *     days. It used to be dropped here entirely, so the person's own Work
 *     History never showed it. It now travels as a `periodRows` figure of
 *     its own — shown BESIDE the day ledger (IA §2), never summed into
 *     daily hours and never painted onto a day.
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
  /** What the record can honestly say about the work behind the hours
   *  (project, client, capacity, source, proof facts). Every field is absent
   *  when the record does not carry it - see professional-history-context. */
  readonly context: HistoryContext;
}

/** One period record: the organization's total over a span, no source days.
 *  `periodStart`/`periodEnd` are ISO days; `hours` is the figure as stated.
 *  `provenance` says how the SPAN came to be (owner rule 2026-09-23): a
 *  span a person chose at import is carried as such across the work-model
 *  edge, so no surface downstream presents it as a source-stated period. */
export interface WorkerEvidencePeriodRow {
  readonly id: string;
  readonly organizationId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly hours: number;
  readonly provenance: PeriodProvenance;
  readonly context: HistoryContext;
}

export type WorkerEvidenceRead =
  | {
      readonly kind: "ok";
      /** Day rows — the ones a day ledger may sum. */
      readonly rows: readonly WorkerEvidenceRecordRow[];
      /** Period rows — beside the day ledger, added to nothing. */
      readonly periodRows: readonly WorkerEvidencePeriodRow[];
    }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

// The evidence tables postdate the generated Database types — the same
// escape hatch every gated store uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function readEvidenceRecordsForWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerEvidenceRead> {
  const people = await db(supabase)
    .from("organization_people")
    .select("id")
    .eq("linked_worker_id", workerId)
    .eq("link_state", "linked")
    // Only a link the PERSON confirmed makes history theirs (integrity doors v1).
    .eq("link_method", "worker_confirmed")
    .limit(MAX_LINKED_PEOPLE);
  if (people.error) {
    if (MISSING_OBJECT_CODES.has(people.error.code ?? "")) return { kind: "needs-migration" };
    console.error("[evidence] roster-link read failed:", people.error.code);
    return { kind: "error" };
  }
  const personIds = ((people.data ?? []) as { id: string }[]).map((p) => p.id);
  if (personIds.length === 0) return { kind: "ok", rows: [], periodRows: [] };

  // Dated AND period records in ONE bounded read: a period row has no
  // activity_date, so the old "activity_date is not null" filter was
  // exactly what made imported history invisible on the person's timeline.
  const res = await db(supabase)
    .from("organization_evidence_records")
    .select(
      "id, organization_id, organization_person_id, activity_date, period_start, period_end, hours, evidence_state, derived, activity_kind, context_label, work_object_id, project_id, supplied_by_organization_id, supplier_role, source_kind, row_origin, imported_at, organization_people(relationship_kind, linked_profile_id), organization_evidence_events!organization_evidence_events_record_fk(event_type, actor_role, actor_profile_id, created_at), organization_evidence_parties!organization_evidence_parties_record_fk(party_role, party_organization_id, party_label)",
    )
    .in("organization_person_id", personIds)
    .order("activity_date", { ascending: false, nullsFirst: false })
    .limit(READ_LIMIT);
  if (res.error) {
    if (MISSING_OBJECT_CODES.has(res.error.code ?? "")) return { kind: "needs-migration" };
    console.error("[evidence] worker records read failed:", res.error.code);
    return { kind: "error" };
  }

  type Raw = Omit<HistoryContextInput, "workObjectName" | "projectName" | "organizationNames">;
  const rows: (Omit<WorkerEvidenceRecordRow, "context"> & { raw: Raw })[] = [];
  const periodRows: (Omit<WorkerEvidencePeriodRow, "context"> & { raw: Raw })[] = [];
  const seen = new Set<string>();
  for (const r of (res.data ?? []) as Record<string, unknown>[]) {
    const hours = r.hours === null || r.hours === undefined ? null : Number(r.hours);
    if (hours === null || !Number.isFinite(hours) || hours <= 0) continue;
    const events = ((r.organization_evidence_events as Record<string, unknown>[] | null) ?? []).map(
      (e): RecordLifecycleEvent => ({
        eventType: e.event_type as RecordLifecycleEvent["eventType"],
        actorRole: (e.actor_role as string | null) ?? null,
        actorProfileId: (e.actor_profile_id as string | null) ?? null,
        createdAt: (e.created_at as string | null) ?? null,
      }),
    );
    // The subject's linked profile lets the derivation tell a self-attestation
    // from an independent one (the same input `listEvidenceRecords` passes).
    const person = r.organization_people as {
      relationship_kind?: string | null;
      linked_profile_id?: string | null;
    } | null;
    const standing = deriveEvidenceStanding(
      r.evidence_state as ReportedEvidenceState,
      events,
      person?.linked_profile_id ?? null,
    );
    if (standing.withdrawn) continue;
    // One record is one row, however many embedded rows (parties, events) it
    // came back with: never counted twice.
    if (seen.has(r.id as string)) continue;
    seen.add(r.id as string);

    const periodStart = (r.period_start as string | null) ?? null;
    const periodEnd = (r.period_end as string | null) ?? null;
    const derived = (r.derived as Record<string, unknown> | null) ?? {};
    const raw: Raw = {
      activityDate: (r.activity_date as string | null) ?? null,
      periodStart,
      periodEnd,
      importedAt: (r.imported_at as string | null) ?? null,
      contextLabel: (r.context_label as string | null) ?? null,
      activityKind: (r.activity_kind as string | null) ?? null,
      workObjectId: (r.work_object_id as string | null) ?? null,
      projectId: (r.project_id as string | null) ?? null,
      parties: ((r.organization_evidence_parties as Record<string, unknown>[] | null) ?? []).map(
        (p) => ({
          role: p.party_role as string,
          organizationId: (p.party_organization_id as string | null) ?? null,
          label: (p.party_label as string | null) ?? null,
        }),
      ),
      relationshipKind: person?.relationship_kind ?? null,
      supplierRole: (r.supplier_role as string | null) ?? null,
      supplierOrganizationId: (r.supplied_by_organization_id as string | null) ?? null,
      sourceKind: (r.source_kind as string | null) ?? null,
      rowOrigin: (r.row_origin as string | null) ?? null,
      reportedState: (r.evidence_state as string | null) ?? null,
      attestation: standing.attestation
        ? { role: standing.attestation.role, self: standing.attestation.self }
        : null,
      independentlyVerified: standing.independentlyVerified,
      contested: anyStandingDispute(events),
    };
    if (periodStart && periodEnd && ISO_DAY.test(periodStart) && ISO_DAY.test(periodEnd)) {
      // A period aggregate: one figure over a span. Never a day.
      periodRows.push({
        id: r.id as string,
        organizationId: r.organization_id as string,
        periodStart,
        periodEnd,
        hours,
        // From the already-selected `derived.timeSemantics` — the ONE rule.
        provenance: periodProvenance({ activityDate: null, periodStart, factFields: [], derived }),
        raw,
      });
      continue;
    }

    const workDate = (r.activity_date as string | null) ?? null;
    if (!workDate) continue;
    // A period aggregate or an unknown figure is evidence, not a day's
    // duration; a legacy "exceeds a day" flag without a classification is
    // treated the same way. Only DAILY hours reach the day ledger.
    const ts = (derived.timeSemantics as TimeSemantics | undefined) ?? null;
    if (!countsAsDailyHours(ts)) continue;
    if (!ts && (derived.hoursPlausibility as { method?: string } | undefined)?.method === HOURS_EXCEED_DAY_METHOD) continue;
    rows.push({
      id: r.id as string,
      organizationId: r.organization_id as string,
      workDate,
      hours,
      raw,
    });
  }

  // Names for the ids the rows carry - bounded name-only reads under the
  // caller's RLS. A failed or invisible lookup leaves the name absent; it
  // never fails the history read and never changes a row, an hour or a count.
  const lookups =
    rows.length + periodRows.length === 0
      ? EMPTY_HISTORY_LOOKUPS
      : await readHistoryLookups(
          supabase,
          lookupIdsOf([...rows, ...periodRows].map((x) => x.raw)),
        );
  return {
    kind: "ok",
    rows: rows.map(({ raw, ...row }) => ({ ...row, context: contextWithLookups(raw, lookups) })),
    periodRows: periodRows.map(({ raw, ...row }) => ({
      ...row,
      context: contextWithLookups(raw, lookups),
    })),
  };
}
