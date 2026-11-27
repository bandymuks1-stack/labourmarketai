import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { orgDisplayName } from "@/lib/company/org-display";
import { readHistoricalOrgNames } from "@/lib/company/historical-org-names";

import type { EvidenceRecordView } from "./import-core";
import {
  buildHistoryContext,
  recordProjectId,
  type HistoryContext,
  type HistoryContextInput,
} from "./professional-history-context";

/**
 * NAME LOOKUPS for the professional-history context — the part of the
 * context the evidence row holds only as an id (project, work package,
 * organization). Three bounded, chunked, name-only reads under the CALLER's
 * RLS; nothing is copied anywhere and nothing is cached.
 *
 * Honest degradation (SEP-7): a read that fails, or an id the caller's RLS
 * does not let them see, leaves that name ABSENT — the context then simply
 * does not show it. A failed lookup is never an error for the history read
 * (the hours are still the hours) and never a guessed name.
 */

const CHUNK = 150;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

export interface HistoryLookups {
  readonly workObjects: ReadonlyMap<string, string>;
  /** Work object id → the project it belongs to (`work_objects.project_id`),
   *  for records whose own `project_id` is empty: the project link through
   *  the work object (`recordProjectId`). An object without a project, or one
   *  the caller's RLS hides, is absent. */
  readonly workObjectProjects: ReadonlyMap<string, string>;
  readonly projects: ReadonlyMap<string, string>;
  readonly organizations: ReadonlyMap<string, string>;
}

export const EMPTY_HISTORY_LOOKUPS: HistoryLookups = {
  workObjects: new Map(),
  workObjectProjects: new Map(),
  projects: new Map(),
  organizations: new Map(),
};

/** Work objects' names and project links — one chunked read, the caller's RLS. */
async function workObjectFacts(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<{ names: Map<string, string>; projects: Map<string, string> }> {
  const names = new Map<string, string>();
  const projects = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += CHUNK) {
    const res = await db(supabase)
      .from("work_objects")
      .select("id, name, project_id")
      .in("id", unique.slice(i, i + CHUNK));
    if (res.error || !Array.isArray(res.data)) continue;
    for (const r of res.data as Record<string, unknown>[]) {
      const id = r.id as string;
      if (typeof r.name === "string" && r.name.trim()) names.set(id, r.name.trim());
      if (typeof r.project_id === "string" && r.project_id) projects.set(id, r.project_id);
    }
  }
  return { names, projects };
}

async function names(
  supabase: SupabaseClient,
  table: string,
  select: string,
  ids: readonly string[],
  label: (r: Record<string, unknown>) => string | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += CHUNK) {
    const res = await db(supabase)
      .from(table)
      .select(select)
      .in("id", unique.slice(i, i + CHUNK));
    if (res.error || !Array.isArray(res.data)) continue;
    for (const r of res.data as Record<string, unknown>[]) {
      const l = label(r);
      if (l) out.set(r.id as string, l);
    }
  }
  return out;
}

export async function readHistoryLookups(
  supabase: SupabaseClient,
  ids: {
    readonly workObjectIds: readonly string[];
    readonly projectIds: readonly string[];
    readonly organizationIds: readonly string[];
  },
): Promise<HistoryLookups> {
  // Work objects first: a record without its own project link names the
  // project through its work object, so those projects are named too.
  const [objects, organizations] = await Promise.all([
    workObjectFacts(supabase, ids.workObjectIds),
    names(supabase, "organizations", "id, display_name, legal_name", ids.organizationIds, (r) =>
      orgDisplayName(r.display_name as string | null, r.legal_name as string | null),
    ),
  ]);
  const projects = await names(
    supabase,
    "projects",
    "id, title",
    [...ids.projectIds, ...objects.projects.values()],
    (r) => (typeof r.title === "string" && r.title.trim() ? r.title.trim() : null),
  );
  // An organization the caller's RLS hides (a person who CLAIMED their
  // roster row, with no engagement there) still names itself on that
  // person's own records — names only, through the worked-organization read.
  const unnamed = ids.organizationIds.filter((id) => !organizations.has(id));
  if (unnamed.length > 0) {
    const extra = await readHistoricalOrgNames(supabase, unnamed);
    for (const [id, n] of extra) {
      const name = orgDisplayName(n.display_name, n.legal_name);
      if (name) organizations.set(id, name);
    }
  }
  return { workObjects: objects.names, workObjectProjects: objects.projects, projects, organizations };
}

/** The ids a batch of context inputs needs resolved. */
export function lookupIdsOf(
  inputs: readonly Pick<
    HistoryContextInput,
    "workObjectId" | "projectId" | "parties" | "supplierOrganizationId"
  >[],
): { workObjectIds: string[]; projectIds: string[]; organizationIds: string[] } {
  const w = new Set<string>();
  const p = new Set<string>();
  const o = new Set<string>();
  for (const i of inputs) {
    if (i.workObjectId) w.add(i.workObjectId);
    if (i.projectId) p.add(i.projectId);
    if (i.supplierOrganizationId) o.add(i.supplierOrganizationId);
    for (const party of i.parties) if (party.organizationId) o.add(party.organizationId);
  }
  return { workObjectIds: [...w], projectIds: [...p], organizationIds: [...o] };
}

/** Raw context input (no resolved names yet) → the context, with names from
 *  `lookups`. The one composition both reads use. */
export function contextWithLookups(
  raw: Omit<HistoryContextInput, "workObjectName" | "projectName" | "organizationNames">,
  lookups: HistoryLookups,
): HistoryContext {
  // The record's own project, else its work object's (read-time, never written).
  const projectId = recordProjectId(raw, lookups.workObjectProjects);
  return buildHistoryContext({
    ...raw,
    projectId,
    workObjectName: raw.workObjectId ? (lookups.workObjects.get(raw.workObjectId) ?? null) : null,
    projectName: projectId ? (lookups.projects.get(projectId) ?? null) : null,
    organizationNames: lookups.organizations,
  });
}

/**
 * The context of records the SUBJECT-SIDE / person-page read already holds as
 * `EvidenceRecordView`s: composed from the fields that view carries plus the
 * same name lookups the work-model read uses. One reading, two doors - the
 * profile section and the person page can never describe a record
 * differently from the work model.
 */
export async function readRecordHistoryContexts(
  supabase: SupabaseClient,
  records: readonly EvidenceRecordView[],
): Promise<ReadonlyMap<string, HistoryContext>> {
  const raws = records.map((r) => ({
    id: r.id,
    raw: {
      activityDate: r.activityDate,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      importedAt: r.importedAt || null,
      contextLabel: r.contextLabel,
      activityKind: r.activityKind,
      workObjectId: r.workObjectId,
      projectId: r.projectId,
      parties: r.parties,
      relationshipKind: r.relationshipKind,
      supplierRole: r.supplierRole,
      supplierOrganizationId: r.supplierOrganizationId,
      sourceKind: r.sourceKind,
      rowOrigin: r.rowOrigin,
      reportedState: r.reportedState || null,
      attestation: r.attestation ? { role: r.attestation.role, self: r.attestation.self } : null,
      independentlyVerified: r.independentlyVerified,
      contested: r.state === "DISPUTED",
    },
  }));
  const lookups =
    raws.length === 0
      ? EMPTY_HISTORY_LOOKUPS
      : await readHistoryLookups(supabase, lookupIdsOf(raws.map((x) => x.raw)));
  return new Map(raws.map((x) => [x.id, contextWithLookups(x.raw, lookups)]));
}
