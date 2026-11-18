import { expect, type Page } from "@playwright/test";

import { WALK_CONSENT_KEY } from "./analytics-consent-seed";

/**
 * THE REAL FIRST VISIT, answered the way a person answers it: the consent
 * banner shows on /auth/* BELOW the sign-up form, nothing analytics-related is
 * stored before the choice, and one press on "refuse" stores the refusal and
 * nothing else. Shared by the production fresh-activation walk (which never
 * submits the form: production accounts are owner-created only) and the
 * isolated CI sign-up (which then signs up and onboards).
 *
 * The keys mirror lib/consent/analytics-consent.ts (an e2e file does not
 * import app code); lib/guards/prod-walk-analytics-consent.test.ts pins them
 * equal.
 */
export const ANALYTICS_LOCAL_KEYS = ["lm.attr.first"] as const;
export const ANALYTICS_SESSION_KEYS = ["lm.pilot.session"] as const;
export const ANALYTICS_KEY_PREFIXES = ["lm.funnel."] as const;

/** A first visit carries a campaign, so "nothing stored" is a real test of the gate. */
export const FIRST_VISIT_CAMPAIGN = "utm_source=walk&utm_medium=qa&utm_campaign=first-visit-consent";

type Stored = { consent: string | null; analytics: string[] };

export async function storedAnalytics(page: Page): Promise<Stored> {
  return page.evaluate(
    ({ key, local, session, prefixes }) => {
      const hit = (k: string, exact: readonly string[]) => exact.includes(k) || prefixes.some((p) => k.startsWith(p));
      const keys = (s: Storage, exact: readonly string[]) =>
        Array.from({ length: s.length }, (_, i) => s.key(i) ?? "").filter((k) => hit(k, exact));
      return {
        consent: window.localStorage.getItem(key),
        analytics: [...keys(window.localStorage, local), ...keys(window.sessionStorage, session)],
      };
    },
    { key: WALK_CONSENT_KEY, local: ANALYTICS_LOCAL_KEYS, session: ANALYTICS_SESSION_KEYS, prefixes: ANALYTICS_KEY_PREFIXES },
  );
}

/**
 * On a sign-up page the browser has never seen: the banner is there, below
 * the form; nothing is stored; refuse; only the refusal is stored, the banner
 * is gone and stays gone after a reload. Leaves the page on the sign-up form.
 */
export async function refuseOnFirstVisit(page: Page): Promise<void> {
  const banner = page.getByTestId("analytics-consent-banner");
  await expect(banner, "a first visit shows the consent banner").toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveAttribute("data-placement", "after-form");

  const form = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  const [formBox, bannerBox] = await Promise.all([form.boundingBox(), banner.boundingBox()]);
  expect(formBox && bannerBox, "form and banner are laid out").toBeTruthy();
  expect(bannerBox!.y, "the banner sits below the sign-up form, never over a field").toBeGreaterThanOrEqual(
    formBox!.y + formBox!.height - 1,
  );

  const before = await storedAnalytics(page);
  expect(before.consent, "no consent choice exists before the person chooses").toBeNull();
  expect(before.analytics, "nothing analytics-related is stored before the choice").toEqual([]);

  await page.getByTestId("analytics-consent-refuse").click();
  await expect(banner, "refusing closes the banner").toBeHidden();

  const after = await storedAnalytics(page);
  expect(JSON.parse(after.consent ?? "{}").choice, "the refusal is stored").toBe("refused");
  expect(after.analytics, "refusing stores nothing analytics-related").toEqual([]);

  await page.reload();
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("analytics-consent-banner"), "the choice is remembered").toHaveCount(0);
  expect((await storedAnalytics(page)).analytics, "still nothing after a reload").toEqual([]);
}
