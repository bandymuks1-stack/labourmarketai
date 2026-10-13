import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { readAllPages } from "./evidence-pagination";
import { untypedClient } from "./evidence-store";
import { isPeriodRecord } from "./company-work-history";
import type { EvidenceRecordView } from "./import-core";
import { readEvidenceForWorkObject } from "./work-object-evidence-read";
import { readProjectCanonicalMap } from "@/lib/projects/projects";

/**
 * THE DOCUMENTED WORK PERIOD OF A PROJECT — derived on read, never stored.
 *
 * Historical projects were promoted from imported sites without contract
 * dates (`projects.start_date / end_date` are NULL by design: nobody recorded
 * one), so every list showed a finished project with no time at all although
 * its records carry exact days. This folds the project's OWN records (through
 * its work objects, under the caller's RLS session) into:
 *
 *   firstDate / lastDate  the earliest and latest RECORDED day (a period
 *                         record contributes its start and end) — the
 *                         documented span of work, NOT a contract start/end;
 *   recordedDays          distinct calendar days that carry a day record —
 *                         days between first and last are never invented;
 *   personDays            day records (one person, one day);
 *   dayHours              hours stated on day records;
 *   periodHours           hours on period aggregates, kept APART and never
 *                         added to dayHours (the never-sum rule);
 *   people                distinct people in the record — documented
 *                         participation, NOT a current assignment.
 *
 * Withdrawn and superseded records are left out (a superseded original is
 * replaced by its correction; counting both would double the hours). The
 * records themselves are never written.
 */
export interface ProjectDocumentedPeriod {
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly recordedDays: number;
  readonly personDays: number;
  readonly dayHours: number;
  readonly periodHours: number;
  readonly periodRecords: number;
  readonly people: number;
}

type FoldRecord = Pick<
  EvidenceRecordView,
  "workObjectId" | "projectId" | "personId" | "activityDate" | "periodStart" | "periodEnd" | "hours" | "withdrawn" | "superseded"
>;

/** Pure fold: records → per-project documented period. */
export function foldProjectDocumentedPeriods(
  records: readonly FoldRecord[],
  projectOfObject: ReadonlyMap<string, string>,
): Map<string, ProjectDocumentedPeriod> {
  const acc = new Map<
    string,
    { dates: string[]; days: Set<string>; personDays: number; dayHours: number; periodHours: number; periodRecords: number; people: Set<string> }
  >();
  for (const r of records) {
    if (r.withdrawn || r.superseded) continue;
    const projectId = r.projectId ?? (r.workObjectId ? projectOfObject.get(r.workObjectId) : undefined);
    if (!projectId) continue;
    let a = acc.get(projectId);
    if (!a) {
      a = { dates: [], days: new Set(), personDays: 0, dayHours: 0, periodHours: 0, periodRecords: 0, people: new Set() };
      acc.set(projectId, a);
    }
    a.people.add(r.personId);
    if (isPeriodRecord(r as EvidenceRecordView)) {
      a.periodRecords += 1;
      a.periodHours += r.hours ?? 0;
      a.dates.push(r.periodStart!, r.periodEnd!);
    } else if (r.activityDate) {
      a.personDays += 1;
      a.dayHours += r.hours ?? 0;
      a.days.add(r.activityDate);
      a.dates.push(r.activityDate);
    }
  }
  const out = new Map<string, ProjectDocumentedPeriod>();
  for (const [projectId, a] of acc) {
    const sorted = a.dates.sort();
    out.set(projectId, {
      firstDate: sorted[0] ?? null,
      lastDate: sorted[sorted.length - 1] ?? null,
      recordedDays: a.days.size,
      personDays: a.personDays,
      dayHours: Math.round(a.dayHours * 100) / 100,
      periodHours: Math.round(a.periodHours * 100) / 100,
      periodRecords: a.periodRecords,
      people: a.people.size,
    });
  }
  return out;
}

export type ProjectDocumentedPeriodsRead =
  | { readonly kind: "ok"; readonly periods: ReadonlyMap<string, ProjectDocumentedPeriod>; readonly truncated: boolean }
  | { readonly kind: "unavailable" };

/**
 * The documented periods of `projectIds` (≤ one list page). A project absent
 * from `periods` has no records — said as "no recorded work", never as dates.
 * A failed read is `unavailable`, never an empty map.
 */
export async function readProjectDocumentedPeriods(
  caller: DomainCaller,
  projectIds: readonly string[],
): Promise<ProjectDocumentedPeriodsRead> {
  if (projectIds.length === 0) return { kind: "ok", periods: new Map(), truncated: false };
  // Fragments marked into a listed project count toward IT (consolidation
  // keeps every fragment row and record; the period is the project's whole).
  const { fragmentsOf } = await readProjectCanonicalMap(caller.supabase, projectIds);
  const canonicalOfFragment = new Map<string, string>();
  for (const [canonical, fragments] of fragmentsOf) for (const f of fragments) canonicalOfFragment.set(f, canonical);
  const readIds = [...new Set([...projectIds, ...canonicalOfFragment.keys()])];
  const objs = await readAllPages<{ id: string; project_id: string }>(async (from, to) => {
    const res = await untypedClient(caller.supabase)
      .from("work_objects")
      .select("id, project_id")
      .in("project_id", readIds)
      .order("id", { ascending: true })
      .range(from, to);
    return { data: (res.data ?? null) as { id: string; project_id: string }[] | null, error: res.error };
  });
  if (!objs) return { kind: "unavailable" };
  const projectOfObject = new Map(
    objs.rows.map((o) => [o.id, canonicalOfFragment.get(o.project_id) ?? o.project_id]),
  );
  if (projectOfObject.size === 0) return { kind: "ok", periods: new Map(), truncated: objs.truncated };
  const recs = await readEvidenceForWorkObject(caller, [...projectOfObject.keys()]);
  if (recs.kind === "unprovisioned") return { kind: "ok", periods: new Map(), truncated: false };
  if (recs.kind !== "ok") return { kind: "unavailable" };
  return {
    kind: "ok",
    periods: foldProjectDocumentedPeriods(recs.records, projectOfObject),
    truncated: recs.truncated || objs.truncated,
  };
}
