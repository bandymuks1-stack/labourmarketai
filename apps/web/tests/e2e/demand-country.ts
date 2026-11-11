import type { Page } from "@playwright/test";

/** The country names a walk may see for Lithuania in the six active locales. */
const LITHUANIA = /Lithuania|Lietuva|Литва|Litauen|Litwa|Litouwen/;

/**
 * The company-need wizard asks for the country before the review step — a need
 * without one is invisible to every country filter. When the description named
 * a place, the wizard has already suggested the country; otherwise this picks
 * one so the walk reaches the review step. A suggested country is never changed.
 */
export async function chooseDemandCountryIfEmpty(page: Page, name: RegExp = LITHUANIA): Promise<void> {
  const select = page.locator('[data-testid="demand-country-select"]:visible').first();
  if (!(await select.isVisible().catch(() => false))) return;
  // The trigger holds the label span and a decorative "▾" span; only the
  // label says whether a country is chosen.
  const label = ((await select.locator("span").first().textContent()) ?? "").trim();
  if (label !== "—") return;
  await select.click();
  await page.getByRole("option", { name }).first().click();
}
