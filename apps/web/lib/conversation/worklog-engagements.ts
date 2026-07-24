"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";

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
      "id, relationship_slug, title, is_primary, organizations(display_name, legal_name, organization_type)",
    )
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", WORKER_RELATIONSHIPS)
    .order("is_primary", { ascending: false });

  const engagements: WorkLogEngagement[] = (ecRows ?? []).map((e) => {
    const org = e.organizations as {
      display_name: string | null;
      legal_name: string | null;
      organization_type: string | null;
    } | null;
    const orgName = org?.display_name ?? org?.legal_name ?? null;
    const label = orgName ?? e.title ?? e.relationship_slug;
    return { id: e.id, label, isPrimary: Boolean(e.is_primary) };
  });

  if (engagements.length === 0) return { kind: "no-context" };
  return { kind: "ok", engagements };
}
