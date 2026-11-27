import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { BASE, isolatedStack, onboard, PASSWORD, setUpCompany, signIn, signUp } from "./isolated-web-a-helpers";

/**
 * THE SIGNED-IN HEADER AND MAIN SCREENS FIT A PHONE, IN EVERY LANGUAGE.
 *
 * Owner phone report 2026-11-20: on /ru the top navigation did not fit the
 * width and an element on the right was cut. The public pages measured clean;
 * the defect was the SIGNED-IN header. Its phone row 2 holds the workspace
 * chip and the area button, and the area button (`flex-none`, one-line label)
 * took the whole row — "Смотреть возможности" at 320 px squeezed the chip to
 * a dot, so the person could not see which workspace they were in.
 *
 * For a worker, a company, a staffing agency and a training institution, each
 * main screen is opened in all seven languages and measured at 320, 360, 375
 * and 390 px:
 *   - the page never scrolls sideways (scrollWidth ≤ clientWidth);
 *   - nothing in the header starts before 0 or ends past the screen, and
 *     neither label of the shared row is cut by its two-line clamp;
 *   - the header keeps two rows (a third row means the area button wrapped
 *     under the chip instead of sharing the row);
 *   - every header control is at least 44 × 44 px, so neither half of the
 *     shared row can be squeezed (the chip used to measure 0–42 px wide);
 *   - nothing on the page ends past the right edge outside a deliberate
 *     horizontal scroller (`html, body { overflow-x: hidden }` would hide it
 *     from the first check).
 *
 * Throwaway local stack only (signup-isolated.yml); synthetic accounts.
 */

test.skip(!isolatedStack(), "isolated local stack only (SIGNUP_ISOLATED=1)");
test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const email = (who: string) => `headerfit.${who}.${RUN}@local.test`;
const LANGS = ["lt", "en", "ru", "pl", "de", "nl", "sv"] as const;
const WIDTHS = [320, 360, 375, 390] as const;
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

type Role = { name: string; address: string; pages: readonly string[] };
const ROLES: readonly Role[] = [
  { name: "worker", address: email("worker"), pages: ["/dashboard", "/dashboard/journal", "/dashboard/opportunities"] },
  { name: "company", address: email("company"), pages: ["/dashboard", "/dashboard/company/needs", "/dashboard/company/people"] },
  { name: "agency", address: email("agency"), pages: ["/dashboard", "/dashboard/company/partners"] },
  { name: "institution", address: email("school"), pages: ["/dashboard/company/education"] },
];

/** One sign-in per person per run; the local auth server limits sign-ins per IP. */
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function onPhone(browser: Browser, address: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const saved = sessions.get(address);
  const ctx = await browser.newContext({
    ...(saved ? { storageState: saved } : {}),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: USER_AGENT,
    timezoneId: "UTC",
  });
  const page = await ctx.newPage();
  if (!saved) {
    await signIn(page, BASE, address);
    sessions.set(address, await ctx.storageState());
  }
  return { ctx, page };
}

type Fit = {
  overflow: number;
  headerHeight: number;
  headerOut: string[];
  headerSmall: string[];
  clipped: string[];
};

/** Everything the four checks need, read in one pass. */
async function measure(page: Page): Promise<Fit> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const label = (el: Element) =>
      `${el.getAttribute("data-testid") || el.tagName.toLowerCase()} "${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30)}"`;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width >= 2 && r.height >= 2 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const header = document.querySelector('[data-testid="app-header"]');
    const headerOut: string[] = [];
    const headerSmall: string[] = [];
    if (header) {
      for (const el of header.querySelectorAll("*")) {
        if (!shown(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.right > vw + 1) headerOut.push(`${label(el)} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      // The workspace chip is a <span> for a person with one workspace; it is
      // the element that used to be squeezed to a dot, so it is measured too.
      for (const el of header.querySelectorAll('a, button, [data-testid="workspace-chip"]')) {
        if (!shown(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) headerSmall.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    // A label clamped to two lines that still does not fit is cut ("Личное
    // пространс…"). Checked on the area button always, and on the chip when it
    // shows a fixed phrase (the personal workspace): an organisation's own name
    // may be any length and keeps its full form in the tooltip and the menu.
    const clampCut = (el: Element | null) => {
      const span = el ? [...el.querySelectorAll("span")].find((s) => getComputedStyle(s).webkitLineClamp === "2") : null;
      return span && span.scrollHeight > span.clientHeight + 1 ? `"${(span.textContent ?? "").trim()}"` : null;
    };
    const trigger = clampCut(document.querySelector('[data-testid="header-nav-sheet-trigger"]'));
    if (trigger) headerOut.push(`area button label cut: ${trigger}`);
    const chipEl = document.querySelector('[data-testid="workspace-chip"]');
    if (chipEl && !chipEl.querySelector("[data-relationship]")) {
      const chip = clampCut(chipEl);
      if (chip) headerOut.push(`workspace label cut: ${chip}`);
    }
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
      return false;
    };
    const clipped: Element[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      // Next's streaming holder is `hidden`; nothing inside it is on screen.
      if (el.closest("[hidden]") || el.closest('[aria-hidden="true"]')) continue;
      if (inScroller(el)) continue;
      if (clipped.some((c) => c.contains(el))) continue;
      clipped.push(el);
      if (clipped.length >= 6) break;
    }
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
      headerOut: headerOut.slice(0, 6),
      headerSmall: headerSmall.slice(0, 6),
      clipped: clipped.map((el) => `${label(el)} right=${Math.round(el.getBoundingClientRect().right)}`),
    };
  });
}

test("setup at a desktop: a worker, a company, a staffing agency and a training institution", async ({ browser }) => {
  test.setTimeout(300_000);
  const make = async (address: string, run: (page: Page) => Promise<void>) => {
    const ctx = await browser.newContext({ timezoneId: "UTC" });
    const page = await ctx.newPage();
    await run(page);
    sessions.set(address, await ctx.storageState());
    await ctx.close();
  };
  await make(email("worker"), async (page) => {
    await signUp(page, BASE, email("worker"));
    await onboard(page, "work", `Synthetic Header Worker ${RUN}`);
    await page.waitForURL(/\/en\/(dashboard|onboarding)/, { timeout: 60_000 });
  });
  // Long names on purpose: the chip is where they used to be squeezed away.
  await make(email("company"), async (page) => {
    await signUp(page, BASE, email("company"));
    await onboard(page, "hire", `Synthetic Header Owner ${RUN}`);
    await setUpCompany(page, `QA-SYNTHETIC Long Organisation Name Builders ${RUN}`);
  });
  await make(email("agency"), async (page) => {
    await signUp(page, BASE, email("agency"));
    await onboard(page, "agency", `Synthetic Header Agent ${RUN}`);
    await setUpCompany(page, `QA-SYNTHETIC Staffing Partners International ${RUN}`);
  });
  await make(email("school"), async (page) => {
    const door = "/dashboard/start/company?capability=training_provider";
    await page.goto(`${BASE}/en/auth/signup?next=${encodeURIComponent(door)}`);
    await page.locator('input[type="email"]').fill(email("school"));
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('input[name="confirm_password"]').fill(PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
    const intent = page.getByTestId("onboarding-intent-education");
    if ((await intent.getAttribute("aria-pressed")) !== "true") await intent.click();
    await page.getByTestId("onboarding-intents-continue").click();
    await page.getByTestId("onboarding-display-name").fill(`Synthetic Header Lecturer ${RUN}`);
    await page.getByTestId("onboarding-country").click();
    await page.getByRole("option", { name: /Lithuania/ }).first().click();
    await page.getByTestId("onboarding-submit").click();
    await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
    await page.getByTestId("company-setup-legal-name").fill(`QA-SYNTHETIC Vocational Training Academy ${RUN}`);
    await page.getByTestId("company-setup-country").selectOption("LT");
    await page.getByTestId("company-setup-save-draft").click();
    await expect(page.getByTestId("company-setup-next")).toBeVisible({ timeout: 30_000 });
  });
});

for (const role of ROLES) {
  for (const lang of LANGS) {
    test(`${role.name} · ${lang}: header and main screens fit 320–390 px`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { ctx, page } = await onPhone(browser, role.address);
      const problems: string[] = [];
      for (const path of role.pages) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${BASE}/${lang}${path}`);
        await expect(page.getByTestId("app-header")).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        // One-tap journal (owner 2026-11-22): a worker's phone header carries
        // the journal itself; an organization workspace keeps its own doors.
        const shortcut = page.getByTestId("header-journal-shortcut");
        if (role.name === "worker") await expect(shortcut, `${lang}${path}: the journal is one tap away`).toBeVisible();
        else if (role.name === "company" || role.name === "agency") await expect(shortcut).toHaveCount(0);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 760 });
          // One frame for the layout to settle after the resize.
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const fit = await measure(page);
          const at = `${lang}${path} at ${width}px`;
          if (fit.overflow > 1) problems.push(`${at}: the page scrolls ${fit.overflow}px sideways`);
          // Two rows of 44px controls: a third row means the area button
          // wrapped under the chip instead of sharing the row.
          if (fit.headerHeight > 130) problems.push(`${at}: the header is ${fit.headerHeight}px tall (a third row)`);
          for (const h of fit.headerOut) problems.push(`${at}: header element off screen: ${h}`);
          for (const h of fit.headerSmall) problems.push(`${at}: header control under 44px: ${h}`);
          for (const c of fit.clipped) problems.push(`${at}: clipped past the right edge: ${c}`);
        }
      }
      await ctx.close();
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
