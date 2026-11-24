"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isOauthClientId } from "@/lib/auth/connected-apps";
import { createClient } from "@/lib/supabase/server";

/**
 * CONNECTED APPS — disconnect an external client (Train A slice 2).
 *
 * The one write on the Connected Apps surface. Runs on the caller's cookie
 * session — the same `createClient()` as every server action — so a person
 * can only revoke THEIR OWN grants: GoTrue scopes `revokeGrant` to the
 * signed-in user, and a client id the user never approved simply fails.
 *
 * Effects (GoTrue, documented): consent marked revoked, the client's sessions
 * deleted, its refresh tokens invalidated. Our `/api/mcp` then refuses the
 * still-valid access token on its next call because every bearer is verified
 * against the auth server (proven 2026-09-02). The normal web logout does NOT
 * do this (#1412, scope=local) — disconnecting is explicit, visible, here.
 *
 * DELIBERATELY HUMAN-ONLY, like the consent decision: an assistant must not be
 * able to revoke (or keep) its own standing access on a person's behalf.
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
