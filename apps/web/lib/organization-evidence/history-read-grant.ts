import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "./evidence-org-context";
import { untypedClient } from "./evidence-store";

/**
 * READ-ONLY HISTORY CONTEXT (20261124053000_history_read_grant_v1, RED).
 *
 * The history and person pages normally read the organization the caller
 * GOVERNS (`resolveEvidenceOrganization`). An owner-granted, time-boxed read
 * grant (`organization_history_read_grants_v1`, at most 4 h, owner SQL only)
 * lets one named person READ one organization's historical record, for
 * example a synthetic QA account taking Living CV screenshots.
 *
 * This resolver is used by the two READ loaders only. It never widens
 * `resolveEvidenceOrganization`, which every write door (import, correction,
 * duplicate review, photo import) keeps calling, so a grant-only caller is
 * still refused there. The database enforces the same split: the grant adds
 * SELECT-only policies and no write policy.
 */
export type HistoryReadContext =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly organizationName: string;
      /** true = reading through a time-boxed grant; no write door applies. */
      readonly readOnly: boolean;
    }
  | { readonly ok: false; readonly reason: "unavailable" | "hidden" };

type GrantRow = { organization_id: string; organization_name: string | null; expires_at: string };

/** Pure choice among the caller's live grants (pinned by tests). */
export function chooseGrant(
  grants: readonly GrantRow[],
  requestedOrganizationId: string | null,
): GrantRow | null {
  const requested = requestedOrganizationId?.trim().toLowerCase() || null;
  if (requested) {
    const hit = grants.filter(
      (g) =>
        g.organization_id.toLowerCase() === requested ||
        (g.organization_name ?? "").trim().toLowerCase() === requested,
    );
    return hit.length === 1 ? hit[0] : null;
  }
  return grants.length === 1 ? grants[0] : null;
}

export async function resolveHistoryReadOrganization(
  caller: DomainCaller,
  requestedOrganizationId: string | null,
): Promise<HistoryReadContext> {
  const governed = await resolveEvidenceOrganization(caller, requestedOrganizationId);
  if (governed.ok) {
    return {
      ok: true,
      organizationId: governed.organizationId,
      organizationName: governed.organizationName,
      readOnly: false,
    };
  }
  if (governed.reason === "error" || governed.reason === "needs-migration") {
    return { ok: false, reason: "unavailable" };
  }

  const { data, error } = await untypedClient(caller.supabase).rpc("my_history_read_grants_v1");
  if (error) {
    // Not deployed here (function missing): no grant exists, nothing changes.
    if (error.code === "42883" || error.code === "PGRST202") return { ok: false, reason: "hidden" };
    return { ok: false, reason: "unavailable" };
  }
  const grant = chooseGrant((data ?? []) as GrantRow[], requestedOrganizationId);
  if (!grant) return { ok: false, reason: "hidden" };
  return {
    ok: true,
    organizationId: grant.organization_id,
    organizationName: grant.organization_name?.trim() || grant.organization_id,
    readOnly: true,
  };
}
