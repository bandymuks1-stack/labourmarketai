"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { whenAnalyticsConsentGranted } from "@/lib/consent/analytics-consent";
import { getFirstTouchAttribution } from "@/lib/telemetry/attribution";
import {
  firstTouchFromUserMetadata,
  USER_METADATA_FIRST_TOUCH_KEYS,
} from "@/lib/telemetry/first-touch-user-metadata";

/**
 * Copies the first-touch campaign onto a NEW account's own record, for the
 * sign-ups that cannot carry it themselves (owner decision 2026-11-03).
 *
 * The e-mail form passes first-touch in `signUp({ options: { data } })`.
 * Google / LinkedIn / Facebook cannot: `signInWithOAuth` takes no user data,
 * so about nine in ten new accounts reached the funnel with no campaign, and
 * every server-emitted step after sign-up (lib/telemetry/server-funnel.ts reads
 * the campaign back from the account) was unattributed.
 *
 * Mounted on /onboarding, the first page every new account reaches. It writes
 * through the person's OWN session (`auth.updateUser`, the same call the
 * account settings use). The OAuth callback and identity binding are not
 * touched. Five conditions, all required:
 *   - analytics consent is granted (lib/consent/analytics-consent.ts);
 *   - a first-touch block exists on this device;
 *   - the account was created within the last day (a sign-up, not an old
 *     account passing through onboarding again);
 *   - the account carries no first-touch key yet (the e-mail path wrote one,
 *     or an earlier visit did): never overwrite;
 *   - only the six allowlisted keys are written (no `utm_term`).
 * Best-effort and silent: a failure changes nothing for the person.
 */

const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Pure: the bounded block to write, or null when nothing should be written. */
export function firstTouchToCopy(
  user: { created_at?: string | null; user_metadata?: unknown } | null,
  firstTouch: Record<string, unknown>,
  now: number = Date.now(),
): Record<string, string> | null {
  if (!user) return null;
  const created = user.created_at ? Date.parse(user.created_at) : Number.NaN;
  if (Number.isNaN(created) || now - created > NEW_ACCOUNT_WINDOW_MS) return null;
  if (Object.keys(firstTouchFromUserMetadata(user.user_metadata)).length > 0) return null;
  const bounded = firstTouchFromUserMetadata(firstTouch);
  const out: Record<string, string> = {};
  for (const key of USER_METADATA_FIRST_TOUCH_KEYS) {
    const v = bounded[key];
    if (typeof v === "string") out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function FirstTouchAccountCopy() {
  const ran = useRef(false);
  useEffect(() => {
    return whenAnalyticsConsentGranted(() => {
      if (ran.current) return;
      ran.current = true;
      const firstTouch = getFirstTouchAttribution();
      if (Object.keys(firstTouch).length === 0) return;
      const supabase = createClient();
      void (async () => {
        try {
          const { data } = await supabase.auth.getUser();
          const block = firstTouchToCopy(data.user, firstTouch);
          if (!block) return;
          await supabase.auth.updateUser({ data: block });
        } catch {
          /* best-effort: attribution never blocks onboarding */
        }
      })();
    });
  }, []);
  return null;
}
