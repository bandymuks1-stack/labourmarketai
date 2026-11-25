/**
 * POST ONE SYNTHETIC NEED THROUGH THE DEMAND INTAKE — shared by the production
 * walks that need a need of their own (orders-bookings, notifications-inapp).
 *
 * A walk never relies on a standing need: after every walk the workflow's
 * sweep (`prod-qa-close-synthetic-needs.ts`) closes every open QA-SYNTHETIC
 * need, so a need posted by an earlier walk is gone by the next one. The role
 * must name a trade: a need nothing can be recognised in is "not structured" on
 * scouting and renders no candidates.
 */
import { expect, type Locator, type Page } from "./prod-walk";
import { chooseDemandCountryIfEmpty } from "./demand-country";

/** The scouting need links of the active workspace, by visible title. */
export function needLinks(page: Page, text: string): Locator {
  return page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: text });
}

export function requestIdOf(href: string | null): string {
  return /request=([0-9a-f-]{36})/.exec(href ?? "")?.[1] ?? "";
}

/** Submit one need as the active workspace. `limit` = the free plan's open-need limit refused it. */
export async function submitSyntheticNeed(page: Page, role: string, description: string): Promise<"done" | "limit"> {
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await page.getByTestId("demand-role").fill(role);
  await page.getByTestId("demand-description").fill(description);
  await page.getByTestId("demand-next").click();
  const size = page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await chooseDemandCountryIfEmpty(page);
  await page.getByTestId("demand-next").click();
  await page.getByTestId("demand-create").click();
  const done = page.getByTestId("demand-done");
  const limit = page.getByTestId("demand-open-need-limit");
  await expect(done.or(limit)).toBeVisible({ timeout: 30_000 });
  return (await limit.isVisible()) ? "limit" : "done";
}
