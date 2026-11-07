import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { OrganizationEmployeeReview } from "@/lib/journal/organization-approvals-model";

const OWN_ENTRIES_LIMIT = 200;

/**
 * The two facts beside the review queue on the organization's first screen, read under
 * the caller's own RLS. A failed read is null, never zero. Approvals themselves stay on
 * the one queue (`fetchQuickReviewQueue`) and the one write chain.
 */
export async function readOrganizationApprovalFacts(organizationId: string): Promise<{
  employees: OrganizationEmployeeReview | null;
  ownUnconfirmed: number | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { employees: null, ownUnconfirmed: null };

  const [employees, ownUnconfirmed] = await Promise.all([
    (async (): Promise<OrganizationEmployeeReview | null> => {
      // `employee`: the one relationship the enable door switches on.
      const { data, error } = await supabase
        .from("engagement_contexts")
        .select("journal_review_enabled")
        .eq("organization_id", organizationId)
        .eq("relationship_slug", "employee")
        .eq("status", "active")
        .neq("profile_id", user.id);
      if (error) return null;
      const rows = data ?? [];
      return { total: rows.length, reviewOff: rows.filter((r) => r.journal_review_enabled !== true).length };
    })(),
    (async (): Promise<number | null> => {
      const { data: contexts, error: contextError } = await supabase
        .from("engagement_contexts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("profile_id", user.id)
        .eq("status", "active");
      if (contextError) return null;
      const contextIds = (contexts ?? []).map((c) => c.id);
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
      const { data: confirmations, error: confirmationError } = await supabase
        .from("journal_entry_confirmations")
        .select("entry_id")
        .in("entry_id", entryIds)
        .neq("confirmer_id", user.id);
      if (confirmationError) return null;
      const confirmed = new Set((confirmations ?? []).map((c) => c.entry_id));
      return entryIds.filter((id) => !confirmed.has(id)).length;
    })(),
  ]);
  return { employees, ownUnconfirmed };
}
