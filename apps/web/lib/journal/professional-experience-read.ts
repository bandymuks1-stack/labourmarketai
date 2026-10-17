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
        sourceLabels: p.sourceLabels,
      })),
    );
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
