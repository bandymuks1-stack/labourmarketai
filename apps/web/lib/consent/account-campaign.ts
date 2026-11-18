import { createClient } from "@/lib/supabase/client";
import { setAnalyticsConsent } from "@/lib/consent/analytics-consent";
import {
  firstTouchFromUserMetadata,
  USER_METADATA_FIRST_TOUCH_KEYS,
} from "@/lib/telemetry/first-touch-user-metadata";

/**
 * A REFUSAL also covers the account (owner review 2026-11-03): a signed-in
 * person who refuses or withdraws analytics must carry no campaign on their
 * own account record. The server stamps the account's campaign on events
 * (lib/telemetry/actions.ts, server-funnel via analytics-attribution.ts)
 * only from that record, so clearing it stops the stamping everywhere, on
 * every device. Written through the person's own session, as the sign-up
 * copy does (components/app/first-touch-account-copy.tsx).
 */

/** Pure: the metadata patch that removes every campaign key, or null when
 *  the account carries none (nothing to write). */
export function campaignClearPatch(userMetadata: unknown): Record<string, null> | null {
  if (Object.keys(firstTouchFromUserMetadata(userMetadata)).length === 0) return null;
  const patch: Record<string, null> = {};
  for (const key of USER_METADATA_FIRST_TOUCH_KEYS) patch[key] = null;
  return patch;
}

/** Remove the campaign from the signed-in person's own account. Silent and
 *  best-effort; an anonymous visitor has no account to clear. */
export async function clearAccountCampaign(): Promise<void> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const patch = campaignClearPatch(data.user.user_metadata);
    if (!patch) return;
    await supabase.auth.updateUser({ data: patch });
  } catch {
    /* best-effort: the device items are already gone */
  }
}

/** The ONE refusal path for every consent surface: device items removed at
 *  once, then the account's campaign. */
export function refuseAnalytics(): void {
  setAnalyticsConsent("refused");
  void clearAccountCampaign();
}
