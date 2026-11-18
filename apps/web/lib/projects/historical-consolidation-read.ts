import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readSupersededRecordIds } from "@/lib/organization-evidence/superseded-ids";

import {
  proposeConsolidation,
  type ConsolidationGroup,
  type ConsolidationInputProject,
} from "./historical-consolidation";

/**
 * The live consolidation proposal for ONE organization's imported history,
 * read through the caller's own RLS session (only a manager of those
 * projects reads them). Nothing is written here.
 */
export interface ConsolidationProposalView {
  /** Active imported project rows read. */
  readonly rows: number;
  readonly groups: readonly (ConsolidationGroup & {
    readonly canonicalTitle: string | null;
    readonly records: number;
    readonly hours: number;
  })[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (c: SupabaseClient): any => c;

async function pages<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const res = await run(from, from + 999);
    if (res.error) return null;
    const got = res.data ?? [];
    out.push(...got);
    if (got.length < 1000) return out;
  }
  return out;
}

export async function loadConsolidationProposal(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ConsolidationProposalView | null> {
  const projects = await pages<{ id: string; title: string | null; created_at: string }>((from, to) =>
    db(supabase)
      .from("projects")
      .select("id, title, created_at")
      .eq("organization_id", organizationId)
      .eq("record_state", "active")
      .not("historical_key", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (!projects) return null;
  if (projects.length === 0) return { rows: 0, groups: [] };

  const ids = projects.map((p) => p.id);
  const objects: { id: string; project_id: string; name: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const res = await db(supabase).from("work_objects").select("id, project_id, name").in("project_id", ids.slice(i, i + 200));
    if (res.error) return null;
    objects.push(...((res.data ?? []) as typeof objects));
  }
  const projectOfObject = new Map(objects.map((o) => [o.id, o.project_id]));
  const objectIds = [...projectOfObject.keys()];
  type Rec = { id: string; work_object_id: string; activity_date: string | null; period_start: string | null; period_end: string | null; hours: number | string | null };
  // EFFECTIVE records only: a superseded original never counts beside its correction.
  const superseded = await readSupersededRecordIds(supabase, organizationId);
  if (!superseded) return null;
  const recs: Rec[] = [];
  for (let i = 0; i < objectIds.length; i += 200) {
    const chunk = objectIds.slice(i, i + 200);
    const got = await pages<Rec>((from, to) =>
      db(supabase)
        .from("organization_evidence_records")
        .select("id, work_object_id, activity_date, period_start, period_end, hours")
        .in("work_object_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (!got) return null;
    recs.push(...got.filter((r) => !superseded.has(r.id)));
  }

  const stat = new Map<string, { records: number; hours: number; dates: string[] }>();
  for (const r of recs) {
    const pid = projectOfObject.get(r.work_object_id);
    if (!pid) continue;
    const s = stat.get(pid) ?? { records: 0, hours: 0, dates: [] };
    s.records += 1;
    s.hours += Number(r.hours ?? 0) || 0;
    for (const d of [r.activity_date, r.period_start, r.period_end]) if (d) s.dates.push(d);
    stat.set(pid, s);
  }
  const input: ConsolidationInputProject[] = projects.map((p) => {
    const s = stat.get(p.id);
    const dates = (s?.dates ?? []).sort();
    return {
      id: p.id,
      title: p.title,
      createdAt: p.created_at,
      objectNames: objects.filter((o) => o.project_id === p.id).map((o) => o.name ?? "").filter(Boolean),
      records: s?.records ?? 0,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    };
  });
  const titleOf = new Map(projects.map((p) => [p.id, p.title]));
  return {
    rows: projects.length,
    groups: proposeConsolidation(input).map((g) => {
      const members = [g.canonicalId, ...g.fragmentIds];
      return {
        ...g,
        canonicalTitle: titleOf.get(g.canonicalId) ?? null,
        records: members.reduce((sum, id) => sum + (stat.get(id)?.records ?? 0), 0),
        hours: Math.round(members.reduce((sum, id) => sum + (stat.get(id)?.hours ?? 0), 0) * 100) / 100,
      };
    }),
  };
}
