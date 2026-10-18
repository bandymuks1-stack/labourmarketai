import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { invitationImpliesWorkerContext } from "@/lib/invitations/model";

/**
 * THE SIGNUP PAGE'S READ OF AN ADDRESSED INVITATION (frictionless addressed
 * invite, owner decision 2026-10-06).
 *
 * A person who clicked an addressed invitation link must not retype the e-mail
 * the invitation already names. This is the ONE place that address is read for
 * the signup form: `get_invitation_signup_context_v1`, executable by
 * service_role only (same pattern and ACL as the public preview), through the
 * admin client. It answers only for a still-usable addressed invitation.
 *
 * It grants nothing. Acceptance still requires the session's e-mail to equal
 * the invited address (20261003151100); this module only saves typing the
 * address that the binding will then compare against. A missing function
 * (migration not applied) or any failure means "no prefill": the form behaves
 * exactly as before.
 *
 * The token is the only input and is never logged.
 */
export type InvitationSignupContext =
  | {
      readonly kind: "addressed";
      readonly email: string;
      readonly impliesWorker: boolean;
    }
  | { readonly kind: "none" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient<any, any, any>): any => c;

export async function readInvitationSignupContext(
  token: string | null,
): Promise<InvitationSignupContext> {
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) return { kind: "none" };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { kind: "none" };
  }
  const { data, error } = await asAny(admin).rpc("get_invitation_signup_context_v1", {
    p_token: token,
  });
  if (error || !data || data.outcome !== "addressed") return { kind: "none" };
  const email = typeof data.invited_email === "string" ? data.invited_email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { kind: "none" };
  return {
    kind: "addressed",
    email,
    impliesWorker: invitationImpliesWorkerContext({
      invitationType: typeof data.invitation_type === "string" ? data.invitation_type : null,
      externalSourceSlug:
        typeof data.external_source_slug === "string" ? data.external_source_slug : null,
    }),
  };
}
