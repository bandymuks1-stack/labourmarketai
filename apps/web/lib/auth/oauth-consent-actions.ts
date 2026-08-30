"use server";

import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * OAUTH CONSENT DECISION — the server half of the authorization UI the
 * Supabase OAuth 2.1 server delegates to the product (Authorization Path →
 * `/oauth/consent`).
 *
 * Approving stores the USER'S OWN consent and mints an authorization code for
 * the requesting client; denying returns the standard `access_denied`. Both
 * run on the caller's cookie session — the same `createClient()` as every
 * server action — so nobody can decide for anybody else: GoTrue binds the
 * `authorization_id` to the signed-in user, and an id belonging to another
 * user's pending request simply does not resolve.
 *
 * DELIBERATELY HUMAN-ONLY. This decision is the one step of the OAuth chain
 * that must never be automatable by an assistant — it is where a person
 * grants an external agent standing access to their account. That is why the
 * surface declaration records `aiControlled: false` as a security property,
 * not a debt.
 */

const decisionInput = z.object({
  authorizationId: z.string().min(8).max(256),
  decision: z.enum(["approve", "deny"]),
});

export async function decideOauthConsent(formData: FormData): Promise<void> {
  const parsed = decisionInput.safeParse({
    authorizationId: formData.get("authorization_id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) {
    redirect("/oauth/consent?error=invalid");
  }
  const { authorizationId, decision } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // The session died between render and click — back through login,
    // carrying the request so the person lands on this same screen.
    redirect(
      `/auth/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`,
    );
  }

  const result =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (result.error || !result.data?.redirect_url) {
    // The id was stale, foreign, or already spent. No oracle about which.
    redirect("/oauth/consent?error=unresolved");
  }

  // The registered client's redirect URI, carrying either the authorization
  // code (approve) or `error=access_denied` (deny). GoTrue only ever returns
  // URIs that were registered for the client — the exact-match rule.
  redirect(result.data.redirect_url);
}
