import { expect, test, type Page } from "@playwright/test";

import { activeLocales } from "../../lib/i18n/config";

import { BASE, isolatedStack, onboard, setUpCompany, signUp } from "./isolated-web-a-helpers";

/**
 * THE SIGNED-IN HEADER FITS A DESKTOP — no two header controls overlap.
 *
 * prod-qa-walk mobile-surfaces M-6 (run 44977749659) read one overlap at
 * 1280 px on /lt/dashboard/projects: the workspace chip ran into the first core
 * nav link. Reproduced on this stack on every projection page with the back
 * button at 1280 (lt, en, de, ru) and at 1366 in Russian. It walks every
 * active language. The predicate is
 * M-6's own: every visible <a>/<button> pair in the header, neither inside
 * the other, may not intersect by more than a pixel. The workspace chip may
 * truncate the name to make room, but keeps at least 48 px of it.
 *
 * Synthetic company owner, local stack only.
 */
test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.setTimeout(900_000);

const RUN = Date.now().toString(36);
const OWNER = `header-fit.owner.${RUN}@local.test`;

async function overlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    const els = header ? [...header.querySelectorAll("a,button")].filter((e) => e.getBoundingClientRect().width > 0) : [];
    const name = (e: Element) => e.getAttribute("data-testid") || e.tagName.toLowerCase();
    const out: string[] = [];
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const a = els[i].getBoundingClientRect();
        const b = els[j].getBoundingClientRect();
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
          out.push(`${name(els[i])} ${Math.round(a.left)}–${Math.round(a.right)} × ${name(els[j])} ${Math.round(b.left)}–${Math.round(b.right)}`);
      }
    return out;
  });
}

test("H-1. a company owner's header: no overlapping controls and a readable workspace name at 1280, 1366 and 1440 in every active language", async ({ browser }) => {
  const setup = await browser.newContext();
  const first = await setup.newPage();
  await signUp(first, BASE, OWNER);
  await onboard(first, "hire", `Synthetic Header Owner ${RUN}`);
  // A long organization name, so the chip has to truncate.
  await setUpCompany(first, `QA-SYNTHETIC Alfa Header Fit ${RUN}`);
  const state = await setup.storageState();
  await setup.close();

  const found: string[] = [];
  for (const width of [1280, 1366, 1440]) {
    for (const locale of activeLocales) {
      const ctx = await browser.newContext({ storageState: state, viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      for (const path of ["/dashboard", "/dashboard/projects", "/dashboard/company", "/dashboard/company/people", "/dashboard/journal"]) {
        await page.goto(`${BASE}/${locale}${path}`);
        await expect(page.getByTestId("app-header")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("workspace-chip")).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState("networkidle").catch(() => {});
        for (const o of await overlaps(page)) found.push(`/${locale}${path} @${width}: ${o}`);
        // The chip shrinks before anything overlaps, but never to a dot: the
        // person always reads which workspace they are in.
        const name = await page
          .getByTestId("workspace-chip")
          .locator('span[class*="lg:truncate"]')
          .first()
          .evaluate((e) => Math.round(e.getBoundingClientRect().width));
        if (name < 48) found.push(`/${locale}${path} @${width}: the workspace name is ${name}px wide`);
      }
      await ctx.close();
    }
  }
  expect(found, "no two header controls overlap").toEqual([]);
});
