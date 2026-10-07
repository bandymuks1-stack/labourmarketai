import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { orgDisplayName } from "@/lib/company/org-display";

import type { EvidenceRecordView } from "./import-core";
import {
  buildHistoryContext,
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
  readonly projects: ReadonlyMap<string, string>;
  readonly organizations: ReadonlyMap<string, string>;
}

export const EMPTY_HISTORY_LOOKUPS: HistoryLookups = {
  workObjects: new Map(),
  projects: new Map(),
  organizations: new Map(),
};

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
  const [workObjects, projects, organizations] = await Promise.all([
    names(supabase, "work_objects", "id, name", ids.workObjectIds, (r) =>
      typeof r.name === "string" && r.name.trim() ? r.name.trim() : null,
    ),
    names(supabase, "projects", "id, title", ids.projectIds, (r) =>
      typeof r.title === "string" && r.title.trim() ? r.title.trim() : null,
    ),
    names(supabase, "organizations", "id, display_name, legal_name", ids.organizationIds, (r) =>
      orgDisplayName(r.display_name as string | null, r.legal_name as string | null),
    ),
  ]);
  return { workObjects, projects, organizations };
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
  return buildHistoryContext({
    ...raw,
    workObjectName: raw.workObjectId ? (lookups.workObjects.get(raw.workObjectId) ?? null) : null,
    projectName: raw.projectId ? (lookups.projects.get(raw.projectId) ?? null) : null,
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
