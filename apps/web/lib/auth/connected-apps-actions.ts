"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isOauthClientId } from "@/lib/auth/connected-apps";
import { grantProductScopes, revokeProductGrant } from "@/lib/auth/oauth-product-grants";
import { CONSENT_COPY_VERSION, normalizeProductScopes } from "@/lib/mcp/scopes";
import { createClient } from "@/lib/supabase/server";

/**
 * CONNECTED APPS — the two writes on the surface (Train A slice 2; B3).
 *
 * Both run on the caller's cookie session — the same `createClient()` as
 * every server action — so a person can only change THEIR OWN connections:
 * GoTrue scopes `revokeGrant` to the signed-in user, and the B3 database
 * functions act on `auth.uid()` and refuse any OAuth-client token.
 *
 * DISCONNECT (`revokeConnectedApp`), in this order:
 *   1. withdraw the recorded permission choice (revoke_oauth_product_grant_v1;
 *      a connection from before B3 gets a revoked marker). From this moment
 *      the MCP door refuses the client, even if step 2 then fails.
 *   2. GoTrue `revokeGrant`: consent marked revoked, the client's sessions
 *      deleted, its refresh tokens invalidated. Our `/api/mcp` then refuses
 *      the still-valid access token on its next call (every bearer is
 *      verified against the auth server, proven 2026-09-02).
 *   Step 1 failing does not stop step 2: ending the connection is what the
 *   person asked for, and step 2 alone already ends it.
 *
 * CHANGE PERMISSIONS (`changeConnectedAppPermissions`): records a new choice
 * for a client that still holds an active GoTrue consent. It applies on the
 * client's next call — no reconnect, no new token — because the door reads
 * the choice on every request.
 *
 * DELIBERATELY HUMAN-ONLY, like the consent decision: an assistant must not be
 * able to widen, keep or revoke its own standing access on a person's behalf.
 */
export async function revokeConnectedApp(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "lt").slice(0, 5);
  const back = `/${locale}/dashboard/account`;
  const clientId = formData.get("client_id");
  if (!isOauthClientId(clientId)) {
    redirect(`${back}?apps=error#connected-apps`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(back)}`);
  }

  const withdrawn = await revokeProductGrant(supabase, clientId);
  if (!withdrawn.ok && withdrawn.code !== "P0002") {
    // P0002 = nothing recorded and no GoTrue consent row: nothing to withdraw.
    console.error("[connected-apps] product grant not withdrawn", { code: withdrawn.code });
  }

  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) {
    // Bounded identifiers only — never the client id of another user's
    // grant, never tokens. `code`/`status` tell a stale id from an outage.
    console.error("[connected-apps] revokeGrant failed", {
      code: error.code,
      status: error.status,
      name: error.name,
    });
    redirect(`${back}?apps=error#connected-apps`);
  }

  revalidatePath(back);
  redirect(`${back}?apps=revoked#connected-apps`);
}

export async function changeConnectedAppPermissions(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "lt").slice(0, 5);
  const back = `/${locale}/dashboard/account`;
  const clientId = formData.get("client_id");
  if (!isOauthClientId(clientId)) {
    redirect(`${back}?apps=error#connected-apps`);
  }
  const scopes = normalizeProductScopes(formData.getAll("scope"));
  if (scopes.length === 0) {
    // To allow nothing at all, the honest action is Disconnect.
    redirect(`${back}?apps=none_selected#connected-apps`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(back)}`);
  }

  const saved = await grantProductScopes(supabase, { clientId, scopes, copyVersion: CONSENT_COPY_VERSION });
  if (!saved.ok) {
    console.error("[connected-apps] permissions not saved", { code: saved.code });
    redirect(`${back}?apps=error#connected-apps`);
  }

  revalidatePath(back);
  redirect(`${back}?apps=permissions_saved#connected-apps`);
}
