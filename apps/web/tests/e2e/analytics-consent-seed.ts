import type { BrowserContext } from "@playwright/test";

/**
 * Production walks open fresh browser contexts, and every fresh browser sees
 * the analytics consent banner (lib/consent/analytics-consent.ts) fixed to the
 * bottom of the page, where it would sit on top of bottom CTAs. A walk is a
 * returning browser that already answered: REFUSED by default, which is also
 * the honest state for synthetic traffic (no measurement, no campaign).
 *
 * The init script runs before any page script on every page of the context
 * and writes the choice only when none exists, so a walk that tests
 * attribution can grant consent itself (in its own init script or by pressing
 * the banner) and keep it.
 */

export const WALK_CONSENT_KEY = "lm.consent.analytics.v1";

export function walkConsentInitScript(key: string): void {
  try {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(
        key,
        JSON.stringify({ choice: "refused", decidedOn: new Date().toISOString().slice(0, 10) }),
      );
    }
  } catch {
    /* storage blocked: the banner shows, as for a real visitor */
  }
}

export async function seedWalkAnalyticsConsent(context: BrowserContext): Promise<void> {
  await context.addInitScript(walkConsentInitScript, WALK_CONSENT_KEY);
}
