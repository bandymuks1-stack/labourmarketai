import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { OrganizationEmployeeReview } from "@/lib/journal/organization-approvals-model";

const OWN_ENTRIES_LIMIT = 200;
/** The relationships the review RPC accepts as a reviewer in the entry's organization. */
const REVIEWER_RELATIONSHIPS = new Set(["manager", "owner", "external_manager"]);

/**
 * The facts beside the review queue on the organization's first screen, read under the
 * caller's own RLS, starting from one read of the organization's active engagements. A
 * failed read is null, never zero. Approvals themselves stay on the one queue
 * (`fetchQuickReviewQueue`) and the one write chain.
 */
export async function readOrganizationApprovalFacts(organizationId: string): Promise<{
  employees: OrganizationEmployeeReview | null;
  ownUnconfirmed: number | null;
  otherReviewer: boolean | null;
}> {
  const unknown = { employees: null, ownUnconfirmed: null, otherReviewer: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unknown;

  const { data, error } = await supabase
    .from("engagement_contexts")
    .select("id, profile_id, relationship_slug, journal_review_enabled")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (error) return unknown;
  const rows = data ?? [];
  const own = rows.filter((r) => r.profile_id === user.id);
  const others = rows.filter((r) => r.profile_id !== user.id);
  // `employee`: the one relationship the enable door switches on.
  const employees = others.filter((r) => r.relationship_slug === "employee");
  // Only a reader who manages the organization can see its other managers. For anyone
  // else, seeing none says nothing.
  const readerManages = own.some((r) => REVIEWER_RELATIONSHIPS.has(r.relationship_slug));
  const otherReviewer = readerManages ? others.some((r) => REVIEWER_RELATIONSHIPS.has(r.relationship_slug)) : null;

  return {
    employees: {
      total: employees.length,
      reviewOff: employees.filter((r) => r.journal_review_enabled !== true).length,
    },
    ownUnconfirmed: await countOwnUnconfirmed(
      supabase,
      own.map((r) => r.id),
      user.id,
    ),
    otherReviewer,
  };
}

async function countOwnUnconfirmed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contextIds: string[],
  userId: string,
): Promise<number | null> {
  if (contextIds.length === 0) return 0;
  const { data: entries, error: entryError } = await supabase
    .from("journal_entries")
    .select("id")
    .in("engagement_context_id", contextIds)
    .is("superseded_by", null)
    .is("deleted_at", null)
    .limit(OWN_ENTRIES_LIMIT);
  if (entryError) return null;
  const entryIds = (entries ?? []).map((e) => e.id);
  if (entryIds.length === 0) return 0;
  // A person's own approval never confirms their work (EVID-2), so only others' rows count.
  const { data: confirmations, error: confirmationError } = await supabase
    .from("journal_entry_confirmations")
    .select("entry_id")
    .in("entry_id", entryIds)
    .neq("confirmer_id", userId);
  if (confirmationError) return null;
  const confirmed = new Set((confirmations ?? []).map((c) => c.entry_id));
  return entryIds.filter((id) => !confirmed.has(id)).length;
}
