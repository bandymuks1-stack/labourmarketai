import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  INBOUND_REFERRAL_SOURCE_SLUG,
  referenceOfContentTag,
} from "@/lib/auth/worker-activation";
import { createClient } from "@/lib/supabase/server";

/**
 * "This reference registered" — the observation behind OBSERVED_SIGNUP.
 *
 * Called from the first authenticated screen a campaign worker lands on (the
 * `referral` param rides inside the safe `?next=` through e-mail
 * confirmation, OAuth and onboarding, so this works for every signup path and
 * on any device). One RPC, `record_external_referral_signup_v1`
 * (20261006100000): an idempotent audit row for (account, source, reference).
 *
 * IT IS AN OBSERVATION, NOT AN ACCEPTANCE. It does not accept the invitation,
 * does not read or expose `declared_context`, grants no consent and creates no
 * relationship. Unauthenticated, malformed or unavailable → a quiet,
 * truthful outcome; it NEVER throws into the page that calls it.
 *
 * HONEST DEGRADATION: before the migration is applied the RPC is absent →
 * `needs-migration` (the registration still carries `utm_content` in
 * `auth.users.raw_user_meta_data` and the funnel's `pilot_events`).
 */
export type ReferralSignupOutcome =
  | "recorded"
  | "already_recorded"
  | "limit_reached"
  | "invalid"
  | "not-authed"
  | "needs-migration"
  | "error";

const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** `contentTag` is the validated `ns-inbound-<12 hex>` carried by `referral`. */
export async function recordInboundReferralSignup(
  contentTag: string | null | undefined,
): Promise<ReferralSignupOutcome> {
  const reference = referenceOfContentTag(contentTag);
  if (!reference) return "invalid";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "not-authed";
    const { data, error } = await asAny(supabase).rpc(
      "record_external_referral_signup_v1",
      { p_source_slug: INBOUND_REFERRAL_SOURCE_SLUG, p_reference: reference },
    );
    if (error) {
      return error.code && ABSENT.has(error.code) ? "needs-migration" : "error";
    }
    switch (data?.outcome) {
      case "recorded":
        return "recorded";
      case "already_recorded":
        return "already_recorded";
      case "limit_reached":
        return "limit_reached";
      case "not_authenticated":
        return "not-authed";
      case "invalid_source":
      case "invalid_reference":
        return "invalid";
      default:
        return "error";
    }
  } catch {
    return "error";
  }
}
