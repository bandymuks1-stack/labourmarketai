"use server";

import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  grantProductScopes,
  readOwnProductGrants,
  revokeProductGrant,
} from "@/lib/auth/oauth-product-grants";
import { CONSENT_COPY_VERSION, normalizeProductScopes } from "@/lib/mcp/scopes";
import { createClient } from "@/lib/supabase/server";

/**
 * OAUTH CONSENT DECISION — the server half of the authorization UI the
 * Supabase OAuth 2.1 server delegates to the product (Authorization Path →
 * `/oauth/consent`).
 *
 * Since B3 the person also chooses WHICH LabourMarket.ai permissions the
 * client gets. The order is the security property:
 *
 *   approve (pending)    1. resolve the client of THIS authorization for THIS
 *                           person (read_oauth_product_grant_v1)
 *                        2. record the choice (grant_oauth_product_scopes_v1)
 *                        3. only then approveAuthorization → redirect with code
 *                        A failure at 1 or 2 approves nothing.
 *   approve (returning)  GoTrue already approved (auto-skip). Record the
 *                        choice, then ask GoTrue for the redirect again. If it
 *                        will not give it a second time, the choice is saved
 *                        and the person reconnects (it then passes straight
 *                        through). Unverified until B5a; both paths are safe.
 *   deny (pending)       denyAuthorization → `access_denied` to the client.
 *                        Nothing is recorded.
 *   deny (returning)     "Disconnect this app": the choice is withdrawn and
 *                        the GoTrue grant revoked (sessions, refresh tokens).
 *                        The already-minted code is never handed over.
 *
 * Everything runs on the caller's cookie session, so nobody decides for
 * anybody else: GoTrue binds the authorization to the signed-in user, and the
 * database functions refuse any OAuth-client token outright.
 *
 * DELIBERATELY HUMAN-ONLY (`aiControlled: false`): this is where a person
 * grants an external agent standing access; an assistant must never drive it.
 */

const decisionInput = z.object({
  authorizationId: z.string().min(8).max(256),
  decision: z.enum(["approve", "deny"]),
  mode: z.enum(["pending", "returning"]),
  locale: z.string().regex(/^[a-z]{2}$/).catch("lt"),
});

export async function decideOauthConsent(formData: FormData): Promise<void> {
  const parsed = decisionInput.safeParse({
    authorizationId: formData.get("authorization_id"),
    decision: formData.get("decision"),
    mode: formData.get("mode") ?? "pending",
    locale: formData.get("locale") ?? "lt",
  });
  if (!parsed.success) {
    redirect("/oauth/consent?error=invalid");
  }
  const { authorizationId, decision, mode, locale } = parsed.data;
  const here = `/${locale}/oauth/consent`;
  const back = `${here}?authorization_id=${encodeURIComponent(authorizationId)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // The session died between render and click — back through login,
    // carrying the request so the person lands on this same screen.
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(back)}`);
  }

  // Which client is this, for this person? Never trusted from the form.
  const read = await readOwnProductGrants(supabase, { authorizationId });
  const row = read.ok ? read.rows[0] : undefined;

  if (decision === "deny") {
    if (mode === "pending") {
      const result = await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (result.error || !result.data?.redirect_url) redirect(`${here}?error=unresolved`);
      redirect(result.data.redirect_url);
    }
    // returning: disconnect. Withdraw the choice first (the door then refuses
    // the client at once), then end the GoTrue grant.
    if (!row) redirect(`${here}?error=unresolved`);
    await revokeProductGrant(supabase, row.clientId);
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: row.clientId });
    if (error) {
      console.error("[oauth-consent] revokeGrant failed", { code: error.code, status: error.status, name: error.name });
      redirect(`${here}?error=unresolved`);
    }
    redirect(`${here}?outcome=disconnected`);
  }

  // approve
  const scopes = normalizeProductScopes(formData.getAll("scope"));
  if (scopes.length === 0) {
    redirect(`${back}&error=none_selected`);
  }
  if (!row) {
    // Foreign, expired or already spent. No oracle about which.
    redirect(`${here}?error=unresolved`);
  }

  const saved = await grantProductScopes(supabase, {
    clientId: row.clientId,
    scopes,
    copyVersion: CONSENT_COPY_VERSION,
    authorizationId,
  });
  if (!saved.ok) {
    console.error("[oauth-consent] grant not recorded", { code: saved.code });
    // Nothing approved: a client is never connected without a recorded choice.
    redirect(`${here}?error=save_failed`);
  }

  if (mode === "pending") {
    const result = await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (result.error || !result.data?.redirect_url) {
      // The recorded choice stays; with no GoTrue consent it grants nothing.
      redirect(`${here}?error=unresolved`);
    }
    // The registered client's redirect URI with the authorization code.
    // GoTrue only ever returns URIs registered for the client.
    redirect(result.data.redirect_url);
  }

  // returning: GoTrue approved before the chooser. Ask for the redirect again.
  const again = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (!again.error && again.data && !("authorization_id" in again.data)) {
    redirect((again.data as { redirect_url: string }).redirect_url);
  }
  redirect(`${here}?outcome=saved_reconnect`);
}
