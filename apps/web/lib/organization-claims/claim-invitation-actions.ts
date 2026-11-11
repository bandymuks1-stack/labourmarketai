"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requestEmailVerificationAction } from "@/lib/auth/email-verification-actions";
import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const ROLE_MAX = 80;

/** Form action on the invite page. Lands back on it with the database's outcome as `?claim=`. */
export async function acceptClaimInvitationFormAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "lt").slice(0, 5);
  const token = String(formData.get("token") ?? "");
  const role = String(formData.get("role") ?? "").trim().slice(0, ROLE_MAX);
  const authority = formData.get("authority") === "on";
  const back = `/${locale}/invite/${encodeURIComponent(token)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=${encodeURIComponent(back)}`);

  const { data, error } = await asAny(supabase).rpc("accept_claim_invitation_v1", {
    p_token: token,
    p_role: role,
    p_authority_confirmed: authority,
  });
  const outcome = error ? "error" : ((data as { outcome?: string } | null)?.outcome ?? "error");
  redirect(`${back}?claim=${encodeURIComponent(outcome)}`);
}

/** Sends the existing mailbox-proof link; the proof brings the representative back to this invitation. */
export async function requestClaimEmailProofFormAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "lt").slice(0, 5);
  const token = String(formData.get("token") ?? "");
  const back = `/${locale}/invite/${encodeURIComponent(token)}`;
  const r = await requestEmailVerificationAction({ locale, next: back });
  if (r.status === "not-authed") redirect(`/${locale}/auth/login?next=${encodeURIComponent(back)}`);
  const outcome =
    r.status === "ok" && r.outcome === "sent"
      ? "verify_sent"
      : r.status === "ok" && r.outcome === "rate_limited"
        ? "verify_rate_limited"
        : r.status === "ok" && r.outcome === "already_verified"
          ? ""
          : "error";
  redirect(outcome ? `${back}?claim=${outcome}` : back);
}
