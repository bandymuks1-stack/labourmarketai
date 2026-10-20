import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { withHistoricalOrgNames } from "@/lib/company/historical-org-names";
import { orgDisplayName } from "@/lib/company/org-display";
import type { ExperienceRelationship } from "@/lib/journal/professional-experience";
import { readMyLedOrganizations } from "@/lib/organization-evidence/my-organizations-read";
import {
  isRecordedEngagement,
  PROFESSIONAL_HISTORY_RELATIONSHIPS,
} from "@/lib/player-card/work-history-model";

/**
 * THE PERSON'S RELATIONSHIPS TO ORGANIZATIONS, for the one professional
 * experience reading (decision 0025). Nothing new is stored and nothing is
 * read twice: the same membership spine the profile, the Living CV and the
 * workspace chip already read.
 *
 *  · `engagement_contexts` — every relationship row of the person, ACTIVE
 *    and ENDED alike (an ended job is still history), under the person's own
 *    RLS: the work relationships (`PROFESSIONAL_HISTORY_RELATIONSHIPS`) and
 *    the governing `manager` relationship, which every work-history surface
 *    leaves out because it is administrative — here it is a role of the
 *    person's history (a director's time is experience, owner rule
 *    2026-10-17 §3), carried WITHOUT hours;
 *  · the organizations the person leads through a governing membership
 *    (`readMyLedOrganizations`: owner / manager, with the organization's
 *    stated business periods, e.g. an earlier trading name of the same
 *    business) — a leader with no engagement row is still a leader.
 *
 * A trigger-provisioned personal context (no organization, no title, no
 * dates) is not a relationship and is dropped by the same rule the profile
 * and the CV use (`isRecordedEngagement`). An ended relationship keeps its
 * organization's name (`withHistoricalOrgNames`).
 *
 * `null` = a read failed (UNKNOWN); the caller then builds the reading from
 * the work model alone and says the roles could not be read.
 */

const LEADERSHIP_RELATIONSHIPS = ["manager"] as const;
const READ_LIMIT = 200;

type ContextRow = {
  id: string;
  relationship_slug: string;
  title: string | null;
  organization_id: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  organizations: { display_name: string | null; legal_name: string | null } | null;
};

type WorkedPeriodRow = {
  id: string;
  organization_id: string;
  period_label: string;
  legal_entity_label: string | null;
  legal_entity_relation: string;
  basis: string;
  period_start: string | null;
  period_end: string | null;
  source_labels: string[] | null;
  supersedes_id: string | null;
};

/** Stated business periods of organizations the caller worked for (names and
 *  periods only; superseded statements dropped). Empty on any failure. */
export async function readWorkedOrganizationPeriods(
  supabase: SupabaseClient,
  orgIds: readonly string[],
): Promise<Map<string, ExperienceRelationship["businessPeriods"]>> {
  const out = new Map<string, ExperienceRelationship["businessPeriods"]>();
  if (orgIds.length === 0) return out;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("my_worked_organization_periods_v1", {
      p_org_ids: orgIds.slice(0, 100),
    });
    if (error || !Array.isArray(data)) return out;
    const rows = data as WorkedPeriodRow[];
    const superseded = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => !!x));
    for (const r of rows) {
      if (superseded.has(r.id)) continue;
      const list = [...(out.get(r.organization_id) ?? [])];
      list.push({
        id: r.id,
        label: r.period_label,
        from: r.period_start,
        to: r.period_end,
        basis: r.basis,
        legalEntityRelation: r.legal_entity_relation,
        legalEntityLabel: r.legal_entity_label,
        sourceLabels: r.source_labels ?? [],
      });
      out.set(r.organization_id, list);
    }
  } catch {
    return out;
  }
  return out;
}

export async function readOwnExperienceRelationships(
  supabase: SupabaseClient,
  userId: string,
): Promise<ExperienceRelationship[] | null> {
  const [contexts, led] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("engagement_contexts")
      .select("id, relationship_slug, title, organization_id, status, started_at, ended_at, organizations(display_name, legal_name)")
      .eq("profile_id", userId)
      .in("relationship_slug", [...PROFESSIONAL_HISTORY_RELATIONSHIPS, ...LEADERSHIP_RELATIONSHIPS])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(READ_LIMIT) as Promise<{ data: ContextRow[] | null; error: { code?: string } | null }>,
    readMyLedOrganizations().catch(() => ({ kind: "unavailable" }) as const),
  ]);
  if (contexts.error) {
    console.error("[experience] engagement read failed:", contexts.error.code);
    return null;
  }
  if (led.kind === "unavailable") return null;

  const periodsByOrg = new Map<string, ExperienceRelationship["businessPeriods"]>();
  for (const o of led.organizations) {
    periodsByOrg.set(
      o.organizationId,
      o.periods.map((p) => ({
        id: p.id,
        label: p.periodLabel,
        from: p.periodStart,
        to: p.periodEnd,
        basis: p.basis,
        legalEntityRelation: p.legalEntityRelation,
        legalEntityLabel: p.legalEntityLabel,
        sourceLabels: p.sourceLabels,
      })),
    );
  }

  // Organizations the person WORKED for but does not lead: their stated
  // earlier periods (e.g. "Vivat Rex") through the worked-organization read
  // (20261020100000) — the same statements, for every person who worked
  // there, not only its managers. Absent function / failed read → none.
  const workedOnly = [
    ...new Set(
      (contexts.data ?? [])
        .map((r) => r.organization_id)
        .filter((id): id is string => !!id && !periodsByOrg.has(id)),
    ),
  ];
  for (const [id, periods] of await readWorkedOrganizationPeriods(supabase, workedOnly)) {
    periodsByOrg.set(id, periods);
  }

  const named = await withHistoricalOrgNames(supabase, contexts.data ?? []);
  const out: ExperienceRelationship[] = [];
  for (const row of named) {
    const organizationName = orgDisplayName(row.organizations?.display_name, row.organizations?.legal_name);
    if (!isRecordedEngagement({ title: row.title, started_at: row.started_at, ended_at: row.ended_at, organizationName })) {
      continue;
    }
    out.push({
      engagementContextId: row.id,
      organizationId: row.organization_id,
      organizationName,
      relationship: row.relationship_slug,
      title: row.title?.trim() || null,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      current: row.status === "active" && !row.ended_at,
      source: "engagement",
      businessPeriods: row.organization_id ? (periodsByOrg.get(row.organization_id) ?? []) : [],
    });
  }
  // A governing membership with no engagement row of the same relationship
  // is a role of its own — the owner who never wrote themselves into their
  // company's roster, the manager appointed by membership only.
  for (const o of led.organizations) {
    const already = out.some(
      (r) => r.organizationId === o.organizationId && r.relationship === o.relationship,
    );
    if (already) continue;
    out.push({
      engagementContextId: null,
      organizationId: o.organizationId,
      organizationName: o.name || null,
      relationship: o.relationship,
      title: null,
      startedAt: null,
      endedAt: null,
      current: true,
      source: "membership",
      businessPeriods: periodsByOrg.get(o.organizationId) ?? [],
    });
  }
  return out;
}
