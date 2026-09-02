"use server";

import "server-only";
import { orgDisplayName } from "@/lib/company/org-display";

import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import {
  resolveEngagementContext,
  type ContextResolution,
} from "@/lib/journal/engagement-context-selection";
import { PROFESSIONAL_HISTORY_RELATIONSHIPS } from "@/lib/player-card/work-history-model";

/**
 * Read the worker's WRITABLE engagement contexts for the conversation work-log
 * flow. A journal entry must pin to an engagement context (doctrine §5.5, and
 * `create_journal_entry_full` requires it), so before offering to save we load
 * the worker's active work-side contexts.
 *
 * This is a READ of the canonical `engagement_contexts` table under the
 * caller's own RLS — it mirrors the journal page's own query (same filter,
 * same ordering). It writes nothing and creates no parallel structure; the save
 * still goes through the canonical `createJournalEntry`.
 */

// The canonical list, imported rather than re-declared: this file used to keep
// its own copy, which is exactly how the CV, the profile card and this selector
// drifted apart before. A placement context (student/volunteer) is writable
// too — a student on placement logs real work, and refusing them a context
// meant the journal could not record it at all.

export type WorkLogEngagement = {
  id: string;
  label: string;
  isPrimary: boolean;
};

export type WorkLogEngagementsResult =
  | {
      kind: "ok";
      engagements: WorkLogEngagement[];
      /** How the default was decided. `rule: "C"` means several engagements
       *  are legitimately possible and `selectedId` is null — the flow must
       *  ASK rather than preselect. */
      resolution: ContextResolution;
    }
  | { kind: "no-worker" }
  | { kind: "no-context" }
  | { kind: "not-authed" };

export async function listWorkLogEngagements(): Promise<WorkLogEngagementsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { kind: "no-worker" };

  const { data: ecRows } = await supabase
    .from("engagement_contexts")
    .select(
      "id, relationship_slug, title, is_primary, organization_id, status, started_at, ended_at, organizations(display_name, legal_name, organization_type)",
    )
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", [...PROFESSIONAL_HISTORY_RELATIONSHIPS])
    .order("is_primary", { ascending: false });

  // A context with no org and no title used to fall back to the RAW
  // relationship slug — the owner saw a literal "employee" in a Lithuanian
  // dropdown (owner audit §6.2). The registry slugs are a closed set, so
  // they localize here, at the one place the label is composed.
  const t = await getTranslations("conversation.worklog");
  const relationshipLabel = (slug: string): string =>
    t.has(`relationship.${slug}`) ? t(`relationship.${slug}`) : t("relationship.other");

  /**
   * The CANONICAL relationship vocabulary — the one list the CV, the profile
   * and the invitation screens already print, and the only one that carries
   * every registry slug including `student` and `volunteer`.
   *
   * It is asked FIRST everywhere a relationship is named in this flow, with
   * `conversation.worklog.relationship.*` kept only as this flow's own older
   * fallback wording. That order matters and used to be the other way around
   * for the base label:
   *
   *   a learner whose placement has no organization display name and no title
   *   fell through to `relationship.student`, which does not exist in that
   *   catalogue, and therefore printed "Kita" / "Other" — for exactly the
   *   education case the selector exists to name. The row was reachable and
   *   loggable; it just refused to say what it was.
   *
   * Resolving through the canonical catalogue fixes `student` and `volunteer`
   * in all five active locales at once and adds no sixth copy of the
   * relationship names, which is the whole reason this catalogue exists.
   * The fallback chain is unchanged and still ends at `relationship.other`, so
   * a genuinely unknown slug can still never reach a reader raw.
   */
  const tRelationships = await getTranslations("relationshipTypes");
  const canonicalRelationship = (slug: string): string =>
    tRelationships.has(slug) ? tRelationships(slug) : relationshipLabel(slug);

  const withBase = (ecRows ?? []).map((e) => {
    const org = e.organizations as {
      display_name: string | null;
      legal_name: string | null;
      organization_type: string | null;
    } | null;
    const orgName = orgDisplayName(org?.display_name, org?.legal_name);
    return {
      row: e,
      base: orgName ?? e.title ?? canonicalRelationship(e.relationship_slug),
    };
  });

  /**
   * ONE PERSON, TWO RELATIONSHIPS WITH THE SAME ORGANIZATION.
   *
   * The label used to be the organization name alone, which was unambiguous
   * only while a person could hold exactly one engagement per organization.
   * They can now hold several — a learner on placement at the company that
   * also employs them is the ordinary education case — and the selector then
   * offered "Dev Construction" TWICE, with no way to tell which was the job
   * and which was the placement. Choosing wrong files the work against the
   * wrong relationship, and the journal is evidence: it must not be a guess.
   *
   * So a base label that occurs more than once is qualified by its
   * relationship, and one that is already unique is left exactly as it was —
   * no existing label changes wording.
   */
  const baseCounts = new Map<string, number>();
  for (const { base } of withBase) {
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }

  const engagements: (WorkLogEngagement & { organizationId: string | null })[] =
    withBase.map(({ row: e, base }) => {
      const ambiguous = (baseCounts.get(base) ?? 0) > 1;
      const label = ambiguous
        ? `${base} — ${canonicalRelationship(e.relationship_slug)}`
        : base;
      return {
        id: e.id,
        label,
        isPrimary: Boolean(e.is_primary),
        organizationId:
          ((e as { organization_id?: string | null }).organization_id as
            | string
            | null) ?? null,
      };
    });

  if (engagements.length === 0) return { kind: "no-context" };

  // Context Intelligence (rebuild phase 3): the ACTIVE WORKSPACE resolves the
  // default context — the engagement belonging to the active workspace's org
  // sorts FIRST (then is_primary, preserved by the stable sort), so the flow
  // preselects the context the user is already working in and only ASKS when
  // real ambiguity remains. Request-cached read; honest no-op when the
  // workspace is personal or matches nothing.
  const workspace = await getWorkspaceContext("person");
  const activeOrgId = workspace.activeWorkspaceId;
  const ordered = [...engagements].sort(
    (a, b) =>
      Number(b.organizationId === activeOrgId) -
      Number(a.organizationId === activeOrgId),
  );

  // The DEFAULT is the resolution, not the first row. Ordering above only
  // decides how the list reads; which context the work belongs to is decided
  // by the hierarchy — and on real ambiguity it decides NOTHING, so the flow
  // asks. This is the second of the two work-log entry points; the journal
  // composer is the other, and both must resolve identically or the same
  // hours land in different places depending on where they were typed.
  const resolution = resolveEngagementContext({
    candidates: (ecRows ?? []).map((e) => {
      const r = e as {
        id: string;
        relationship_slug: string;
        organization_id?: string | null;
        status?: string | null;
        started_at?: string | null;
        ended_at?: string | null;
        is_primary?: boolean | null;
      };
      return {
        id: r.id,
        relationshipSlug: r.relationship_slug,
        organizationId: r.organization_id ?? null,
        status: r.status ?? "active",
        startedAt: r.started_at ?? null,
        endedAt: r.ended_at ?? null,
        isPrimary: r.is_primary === true,
      };
    }),
  });

  return {
    kind: "ok",
    engagements: ordered.map(({ id, label, isPrimary }) => ({ id, label, isPrimary })),
    resolution,
  };
}
