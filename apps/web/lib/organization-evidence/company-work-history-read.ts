import "server-only";

import { createClient } from "@/lib/supabase/server";
import { withSessionWorkspacePointer, listWorkspaceMemberships } from "@/lib/company/active-organization";
import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "./evidence-org-context";
import { untypedClient } from "./evidence-store";
import { listEvidenceRecords, listRecordIdsAttributedTo } from "./import-core";
import { listAllEvidenceRecords, readAllPages } from "./evidence-pagination";
import {
  buildBusinessHistory,
  livePeriods,
  type BusinessHistory,
  type HistoryPeriodStatement,
} from "./business-history";
import {
  buildCompanyWorkHistory,
  type CompanyWorkHistory,
  type PlaceObjectFacts,
} from "./company-work-history";

/**
 * Loads the ACTIVE organization's imported work history through the caller's
 * own RLS session (never service role) — the same records the history door
 * lists per session, here folded by place. Fail-closed and honest:
 *
 *   ready        the history, possibly empty (`history.totalRecords === 0`)
 *   elsewhere    the active organization has none, but ANOTHER organization the
 *                caller belongs to does — said by name, so a person acting in
 *                the wrong workspace is told where the work is, not that it
 *                never existed
 *   unavailable  a failed read — NEVER rendered as "no history"
 *   hidden       personal workspace / no authority: nothing to show
 */
export type CompanyWorkHistoryLoad =
  | {
      readonly kind: "ready";
      readonly organizationId: string;
      readonly organizationName: string;
      /** The business history read in periods (owner model 2026-09-30); null
       *  when the period or source-label read failed (UNKNOWN, never empty). */
      readonly business: BusinessHistory | null;
      readonly history: CompanyWorkHistory;
      readonly elsewhere: readonly { readonly id: string; readonly name: string; readonly count: number }[];
      /** Roster person id → linked worker id (only `linked` rows). */
      readonly linkedWorkers: Readonly<Record<string, string>>;
      /** Records stored in ANOTHER organization's books that name this one as the performing company. */
      readonly attributedCount: number;
      /** A safety ceiling was reached while reading: the totals cover only
       *  what was read and the surface MUST say so (never a silent cap). */
      readonly truncated: boolean;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "hidden" };

const db = untypedClient;
/** Ids per `.in()` — a URL-length bound, not a coverage cap. */
const ID_CHUNK = 100;

export async function loadCompanyWorkHistory(
  locale: string,
  /** An organization the caller names (`?org=`), checked against the caller's
   *  OWN memberships by `resolveEvidenceOrganization`; absent → the active one. */
  requestedOrganizationId: string | null = null,
): Promise<CompanyWorkHistoryLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "hidden" };
  const caller: DomainCaller = await withSessionWorkspacePointer({
    supabase,
    userId: user.id,
    locale,
  });

  const org = await resolveEvidenceOrganization(caller, requestedOrganizationId);
  if (!org.ok) {
    return org.reason === "error" || org.reason === "needs-migration"
      ? { kind: "unavailable" }
      : { kind: "hidden" };
  }

  // Every read is PAGED to the end (the server answers at most 1000 rows):
  // production holds 2,944 records for one organization, and a bare
  // `.limit(1000)` made every total on this page silently wrong.
  const [recs, objs, people] = await Promise.all([
    listAllEvidenceRecords(caller, { organizationId: org.organizationId }),
    readAllPages<{
      id: string;
      name: string;
      address_line: string | null;
      city: string | null;
      project_id: string | null;
      status: string | null;
    }>((from, to) =>
      db(supabase)
        .from("work_objects")
        .select("id, name, address_line, city, project_id, status")
        .eq("organization_id", org.organizationId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllPages<{
      id: string;
      linked_worker_id: string | null;
      link_state: string | null;
      link_method: string | null;
    }>(
      (from, to) =>
        db(supabase)
          .from("organization_people")
          .select("id, linked_worker_id, link_state, link_method")
          .eq("organization_id", org.organizationId)
          .order("id", { ascending: true })
          .range(from, to),
    ),
  ]);
  if (recs.kind !== "ok" || !objs || !people) return { kind: "unavailable" };

  const objects: PlaceObjectFacts[] = objs.rows.map((o) => ({
    id: o.id,
    name: o.name,
    addressLine: o.address_line,
    city: o.city,
    projectId: o.project_id,
    archived: o.status === "archived",
  }));
  const linkedWorkers: Record<string, string> = {};
  for (const p of people.rows) {
    // Identity only by the PERSON's own confirmation (integrity doors v1).
    if (p.link_state === "linked" && p.link_method === "worker_confirmed" && p.linked_worker_id)
      linkedWorkers[p.id] = p.linked_worker_id;
  }

  // Work stored in another organization's books but attributed HERE (a party
  // row naming this organization). The records SELECT policy already admits
  // them; they are read, never copied.
  let attributed: readonly (typeof recs.records)[number][] = [];
  const attributedIds = await listRecordIdsAttributedTo(caller, org.organizationId);
  if (attributedIds.kind === "ok") {
    const own = new Set(recs.records.map((r) => r.id));
    const wanted = attributedIds.recordIds.filter((id) => !own.has(id));
    const found: (typeof recs.records)[number][] = [];
    for (let i = 0; i < wanted.length; i += ID_CHUNK) {
      const extra = await listEvidenceRecords(caller, {
        recordIds: wanted.slice(i, i + ID_CHUNK),
        limit: ID_CHUNK,
      });
      if (extra.kind === "ok") found.push(...extra.records.filter((r) => r.organizationId !== org.organizationId));
    }
    attributed = found;
  }
  const history = buildCompanyWorkHistory([...recs.records, ...attributed], objects);

  const business = await readBusinessHistory(supabase, org.organizationId, recs.records, objects);

  // Where is the work if not here? Only when this organization holds none.
  const elsewhere: { id: string; name: string; count: number }[] = [];
  if (history.totalRecords === 0) {
    try {
      const memberships = await listWorkspaceMemberships(caller);
      for (const w of memberships) {
        if (w.kind !== "organization" || w.id === org.organizationId) continue;
        const c = await listAllEvidenceRecords(caller, { organizationId: w.id });
        if (c.kind === "ok" && c.records.length > 0) {
          elsewhere.push({ id: w.id, name: w.name?.trim() || w.id, count: c.records.length });
        }
      }
    } catch {
      /* the hint is best-effort; the empty state stays honest without it */
    }
  }

  return {
    kind: "ready",
    organizationId: org.organizationId,
    organizationName: org.organizationName,
    business,
    history,
    elsewhere,
    linkedWorkers,
    attributedCount: attributed.length,
    truncated: recs.truncated,
  };
}

type PeriodRow = {
  id: string;
  period_label: string;
  legal_entity_label: string | null;
  source_labels: string[] | null;
  period_start: string | null;
  period_end: string | null;
  continuity: HistoryPeriodStatement["continuity"];
  legal_entity_relation: HistoryPeriodStatement["legalEntityRelation"];
  basis: HistoryPeriodStatement["basis"];
  basis_reference: string | null;
  statement: string | null;
  supersedes_id: string | null;
  created_at: string;
};

/**
 * The organization's period statements + each record's verbatim source label,
 * composed with the records already read (business-history.ts). Two bounded
 * RLS reads; either failing makes the whole reading UNKNOWN (null) - a history
 * read without its periods would place every record as "not placed".
 */
async function readBusinessHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  records: readonly {
    id: string;
    personId: string;
    workObjectId: string | null;
    projectId: string | null;
    activityDate: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    hours: number | null;
    withdrawn: boolean;
    superseded: boolean;
  }[],
  objects: readonly PlaceObjectFacts[],
): Promise<BusinessHistory | null> {
  const [periods, labels] = await Promise.all([
    db(supabase)
      .from("organization_history_periods")
      .select(
        "id, period_label, legal_entity_label, source_labels, period_start, period_end, continuity, legal_entity_relation, basis, basis_reference, statement, supersedes_id, created_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(200),
    readAllPages<{ id: string; source_sheet: string | null }>((from, to) =>
      db(supabase)
        .from("organization_evidence_records")
        .select("id, source_sheet:source_fact->>source_sheet")
        .eq("organization_id", organizationId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (periods.error || !labels) return null;
  const statements = livePeriods(
    ((periods.data ?? []) as PeriodRow[]).map((p) => ({
      id: p.id,
      periodLabel: p.period_label,
      legalEntityLabel: p.legal_entity_label,
      sourceLabels: p.source_labels ?? [],
      periodStart: p.period_start,
      periodEnd: p.period_end,
      continuity: p.continuity,
      legalEntityRelation: p.legal_entity_relation,
      basis: p.basis,
      basisReference: p.basis_reference,
      statement: p.statement,
      createdAt: p.created_at,
      supersedesId: p.supersedes_id,
    })),
  );
  const labelOf = new Map(labels.rows.map((r) => [r.id, r.source_sheet?.trim() || null]));
  const projectOfObject = new Map(objects.map((o) => [o.id, o.projectId]));
  return buildBusinessHistory(
    records
      // Effective records only: a withdrawn import or a superseded original counts nowhere.
      .filter((r) => !r.withdrawn && !r.superseded)
      .map((r) => ({
        id: r.id,
        personId: r.personId,
        workObjectId: r.workObjectId,
        projectId: r.projectId ?? (r.workObjectId ? (projectOfObject.get(r.workObjectId) ?? null) : null),
        activityDate: r.activityDate,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        hours: r.hours,
        sourceLabel: labelOf.get(r.id) ?? null,
      })),
    statements,
  );
}
