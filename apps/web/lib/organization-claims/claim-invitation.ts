import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * COMPANY TAKEOVER INVITATION — the representative's half of partner registration Slice 1
 * (migration 20261110190000). The database decides everything: the address, the mailbox proof,
 * the single use, the expiry. This module only reads the preview; the form action is in
 * ./claim-invitation-actions.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type ClaimInvitationPreview =
  | { kind: "not_claim" }
  | { kind: "closed"; outcome: string }
  | {
      kind: "open";
      organizationName: string;
      organizationCountry: string | null;
      emailMatches: boolean;
      emailVerified: boolean;
      expiresAt: string;
    };

/** `not_claim` also when the function is not there yet: the page then shows the ordinary invitation. */
export async function readClaimInvitationPreview(token: string): Promise<ClaimInvitationPreview> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("get_claim_invitation_preview_v1", { p_token: token });
  if (error || !data) return { kind: "not_claim" };
  const d = data as {
    outcome: string;
    organization_name?: string;
    organization_country?: string | null;
    email_matches?: boolean;
    email_verified?: boolean;
    expires_at?: string;
  };
  if (d.outcome === "not_found") return { kind: "not_claim" };
  if (d.outcome !== "ok") return { kind: "closed", outcome: d.outcome };
  return {
    kind: "open",
    organizationName: d.organization_name ?? "",
    organizationCountry: d.organization_country ?? null,
    emailMatches: d.email_matches === true,
    emailVerified: d.email_verified === true,
    expiresAt: d.expires_at ?? "",
  };
}
