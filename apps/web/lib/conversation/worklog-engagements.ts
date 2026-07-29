"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/company/active-organization";

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

const WORKER_RELATIONSHIPS = [
  "employee",
  "freelancer",
  "consultant",
  "owner",
  "collaborator",
];

export type WorkLogEngagement = {
  id: string;
  label: string;
  isPrimary: boolean;
};

export type WorkLogEngagementsResult =
  | { kind: "ok"; engagements: WorkLogEngagement[] }
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
      "id, relationship_slug, title, is_primary, organization_id, organizations(display_name, legal_name, organization_type)",
    )
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", WORKER_RELATIONSHIPS)
    .order("is_primary", { ascending: false });

  // A context with no org and no title used to fall back to the RAW
  // relationship slug — the owner saw a literal "employee" in a Lithuanian
  // dropdown (owner audit §6.2). The registry slugs are a closed set, so
  // they localize here, at the one place the label is composed.
  const t = await getTranslations("conversation.worklog");
  const relationshipLabel = (slug: string): string =>
    t.has(`relationship.${slug}`) ? t(`relationship.${slug}`) : t("relationship.other");

  const engagements: (WorkLogEngagement & { organizationId: string | null })[] = (
    ecRows ?? []
  ).map((e) => {
    const org = e.organizations as {
      display_name: string | null;
      legal_name: string | null;
      organization_type: string | null;
    } | null;
    const orgName = org?.display_name ?? org?.legal_name ?? null;
    const label = orgName ?? e.title ?? relationshipLabel(e.relationship_slug);
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

  return {
    kind: "ok",
    engagements: ordered.map(({ id, label, isPrimary }) => ({ id, label, isPrimary })),
  };
}
