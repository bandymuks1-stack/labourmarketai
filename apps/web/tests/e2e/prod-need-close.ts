import { expect, type Page } from "./prod-walk";

/**
 * CLOSING A SYNTHETIC NEED THE WAY ITS OWNER DOES — shared by the production
 * walks that post a need for the synthetic buyer (company-chain,
 * brigade-formation). A walk that leaves its need open blocks the next one:
 * the buyer's plan allows one open need.
 *
 * The caller has already made the buyer the active workspace. Nothing here
 * touches the database: only the product's own close controls are pressed.
 */
export function requestIdOf(href: string | null): string {
  return /request=([0-9a-f-]{36})/.exec(href ?? "")?.[1] ?? "";
}

/** Close one need through its own lifecycle controls; throws when it is refused. */
export async function closeOwnNeed(page: Page, id: string): Promise<"closed" | "already-closed"> {
  const main = page.getByRole("main");
  await page.goto(`/lt/dashboard/company/scouting?request=${id}`);
  const controls = main.getByTestId("demand-lifecycle-controls").first();
  const unstructured = main.getByTestId("scouting-not-structured").first();
  await expect(controls.or(unstructured).first()).toBeVisible({ timeout: 30_000 });
  if (await controls.isVisible()) {
    if ((await controls.getAttribute("data-demand-status")) === "closed") return "already-closed";
    await controls.getByTestId("demand-close").click();
    await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
    return "closed";
  }
  // A need that names no trade: the scouting page draws its lifecycle controls
  // only for a structured need, so it is closed where the product offers that
  // for every submitted need — the chat workspace's candidates result
  // (`?result=candidates&demand=`, `company.close-demand`).
  await page.goto(`/lt/dashboard?result=candidates&demand=${id}`);
  const close = main.getByTestId("candidates-close-demand").filter({ visible: true }).first();
  const reopen = main.getByTestId("candidates-reopen-demand").filter({ visible: true }).first();
  await expect(close.or(reopen).first(), "the need's own close/reopen action").toBeVisible({ timeout: 60_000 });
  if (await reopen.isVisible()) return "already-closed";
  await close.click();
  const error = main.getByTestId("candidates-close-demand-error").first();
  await expect(reopen.or(error).first()).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`close refused: ${(await error.innerText()).slice(0, 120)}`);
  return "closed";
}

/** The id of the buyer's need whose title carries `marker`, or "" when the scouting list shows none. */
export async function findOwnNeed(page: Page, marker: string): Promise<string> {
  await page.goto("/lt/dashboard/company/scouting");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const link = page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: marker }).first();
  return (await link.count()) > 0 ? requestIdOf(await link.getAttribute("href")) : "";
}
