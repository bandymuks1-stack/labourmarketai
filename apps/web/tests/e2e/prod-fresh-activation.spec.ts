import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

/**
 * PRODUCTION — A BRAND-NEW WORKER AND A BRAND-NEW COMPANY, FROM ONBOARDING TO
 * THE FIRST USEFUL ACTION (owner decision 2026-10-26, "AKTYVAVIMO KLIŪČIŲ
 * ŠALINIMAS"). Every other synthetic identity is long onboarded, so none of
 * them can walk the path a real new person walks.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=fresh-activation),
 * signed in to the two fresh accounts the OWNER created
 * (`prod-qa-fresh-provision.yml`); the walk never creates an account.
 *
 *   worker  (390 px phone): onboarding keeps its place across reload, a
 *           language switch and Back; the country list scrolls without
 *           breaking the wizard; nothing personal is kept in the browser;
 *           then the first journal entry, saved once, and the Living CV.
 *   company (1280 px, then the phone): onboarding, the company, "describe a
 *           need", the saved need visible where the company lands — then the
 *           need is closed again (cleanup).
 *
 * Isolation: every name and text carries the documented fixture marker
 * (`lib/qa/synthetic-fixture.ts`), so the shared readers keep it out of real
 * people's boards, scouting and market views; posting a need notifies nobody.
 *
 * The accounts are single-use for onboarding: once onboarded, a re-run logs
 * `[fresh] onboarding already done` and proves only the later steps.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" && ["freshworker", "freshcompany"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created fresh accounts");
test.describe.configure({ mode: "serial", timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const DRAFT_KEY = "lm.onboarding.draft.v1";
const WORKER_NAME = "QA-SYNTHETIC Naujas darbuotojas";
const COMPANY_PERSON = "QA-SYNTHETIC Naujos įmonės atstovas";
const COMPANY_NAME = "QA-SYNTHETIC Delta (testinis subjektas)";
const ENTRY = `[QA-SYNTHETIC] Šiandien sumūrijau 6 m² sienos, 7 val. (${RUN})`;
const NEED_ROLE = `QA-SYNTHETIC mūrininkas ${RUN}`;
const NEED_TEXT = "[QA-SYNTHETIC] Testinis poreikis: 2 mūrininkai objektui Vilniuje, nuo kito mėnesio.";

const inMain = (page: Page): Locator => page.getByRole("main");

async function open(browser: Browser, slot: string, viewport: { width: number; height: number }, mobile: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    viewport,
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

async function onStep2(page: Page): Promise<boolean> {
  return page.getByTestId("onboarding-display-name").isVisible().catch(() => false);
}

async function readDraft(page: Page): Promise<string | null> {
  return page.evaluate((k) => window.sessionStorage.getItem(k), DRAFT_KEY);
}

async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  console.info(`[fresh] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} is wider than the viewport`).toBeLessThanOrEqual(inner + 1);
}

/** Pick a country through the searchable list (the language on screen is LT). */
async function pickCountry(page: Page, query: string, name: RegExp): Promise<void> {
  await page.getByTestId("onboarding-country").click();
  await page.getByTestId("onboarding-country-search").fill(query);
  await page.getByRole("option", { name }).first().click();
}

/** Arrive at the wizard from the place a new person arrives (everyone lands on /en). */
async function arriveAtOnboarding(page: Page): Promise<boolean> {
  await page.goto("/en/dashboard");
  await settle(page);
  const fresh = /\/onboarding/.test(new URL(page.url()).pathname);
  console.info(`[fresh] landed on ${new URL(page.url()).pathname} — ${fresh ? "onboarding" : "onboarding already done"}`);
  return fresh;
}

test("fresh worker: onboarding keeps its place, then the first journal entry reaches the Living CV", async ({ browser }) => {
  const { ctx, page } = await open(browser, "freshworker", PHONE, true);
  try {
    if (await arriveAtOnboarding(page)) {
      const t0 = Date.now();
      await page.getByTestId("onboarding-intent-work").click();
      await page.getByTestId("onboarding-intents-continue").click();
      await expect(page.getByTestId("onboarding-display-name")).toBeVisible();
      // Step 2 opens at its own top: the name field is on screen.
      await expect(page.getByTestId("onboarding-display-name")).toBeInViewport();
      await page.getByTestId("onboarding-display-name").fill(WORKER_NAME);

      // Nothing personal in the browser: the draft carries step, intents, country — never the name.
      const draft = await readDraft(page);
      console.info(`[fresh] draft keys=${draft ? Object.keys(JSON.parse(draft)).sort().join(",") : "(none)"}`);
      expect(draft, "the wizard keeps a draft").not.toBeNull();
      expect(draft ?? "").not.toContain("QA-SYNTHETIC");
      expect(Object.keys(JSON.parse(draft ?? "{}")).sort()).toEqual(["country", "intents", "step"]);

      // Reload — the place is kept.
      await page.reload();
      await settle(page);
      expect(await onStep2(page), "reload sent the person back to step 1").toBe(true);

      // Language switch — the place is kept.
      await page.goto("/lt/onboarding");
      await settle(page);
      expect(await onStep2(page), "the language switch sent the person back to step 1").toBe(true);

      // Back — the place is kept.
      await page.goBack();
      await settle(page);
      expect(await onStep2(page), "Back sent the person back to step 1").toBe(true);
      await page.goto("/lt/onboarding");
      await settle(page);

      // The country list scrolls to its end without the page reloading (pull to refresh).
      await page.evaluate(() => ((window as unknown as { __lmFresh?: number }).__lmFresh = 1));
      await page.getByTestId("onboarding-country").click();
      const list = page.getByRole("listbox").first();
      await expect(list).toBeVisible();
      expect(await list.evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("contain");
      const box = await list.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 1200);
        for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, -2400);
      }
      const survived = await page.evaluate(() => (window as unknown as { __lmFresh?: number }).__lmFresh === 1);
      console.info(`[fresh] country list scrolled; page survived=${survived}`);
      expect(survived, "scrolling the country list reloaded the page").toBe(true);
      await page.keyboard.press("Escape");
      expect(await onStep2(page)).toBe(true);

      await page.getByTestId("onboarding-display-name").fill(WORKER_NAME);
      await pickCountry(page, "Liet", /^Lietuva$/);
      const profession = page.getByTestId("onboarding-profession-input");
      if (await profession.isVisible().catch(() => false)) {
        await profession.fill("Mūrinink");
        const suggestion = page.getByTestId("onboarding-profession-suggestions").getByRole("button").first();
        if (await suggestion.isVisible().catch(() => false)) await suggestion.click();
        else await page.getByTestId("onboarding-profession-add").click();
      }
      await expectNoSidewaysScroll(page, "onboarding step 2 (390)");
      await page.getByTestId("onboarding-submit").click();
      await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
      await settle(page);
      console.info(`[fresh] worker onboarding done in ${Math.round((Date.now() - t0) / 1000)} s → ${new URL(page.url()).pathname}`);
      expect(await readDraft(page), "the draft is forgotten after onboarding").toBeNull();
    }

    // Home: what does a brand-new worker get asked first?
    await page.goto("/lt/dashboard");
    await settle(page);
    await expectNoSidewaysScroll(page, "worker home (390)");
    // The one gold action leads to the first journal entry — not the profession again.
    const primary = inMain(page).getByTestId("today-next-cta").first();
    const primaryHref = (await primary.getAttribute("href").catch(() => null)) ?? "(none)";
    const secondaryDim = (await inMain(page).getByTestId("today-next-secondary").first().getAttribute("data-dim").catch(() => null)) ?? "(none)";
    console.info(`[fresh] worker home gold action href=${primaryHref} secondary=${secondaryDim}`);
    expect(primaryHref, "a new worker's gold action is not the first journal entry").toMatch(/\/dashboard\/journal$/);

    // The first journal entry — saved with ONE "Save".
    await page.goto("/lt/dashboard/journal");
    await settle(page);
    await inMain(page).getByTestId("journal-quick-record-text").fill(ENTRY);
    await inMain(page).getByTestId("journal-quick-record-understand").click();
    await expect(inMain(page).getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
    let presses = 0;
    const labels: string[] = [];
    const done = inMain(page).getByTestId("worklog-done");
    const failed = inMain(page).getByTestId("worklog-error").or(inMain(page).getByTestId("worklog-blocked"));
    for (const id of ["worklog-save", "worklog-confirm"]) {
      if (await done.isVisible().catch(() => false)) break;
      const button = inMain(page).getByTestId(id);
      if (await button.isVisible().catch(() => false)) {
        labels.push((await button.innerText()).trim());
        await button.click();
        presses += 1;
        await expect(done.or(failed).or(inMain(page).getByTestId("worklog-confirm"))).toBeVisible({ timeout: 30_000 });
      }
    }
    await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
    expect(await failed.isVisible(), "the journal entry was refused").toBe(false);
    // "Save" is said once — on the press that writes (the first press opens the review).
    const saveWords = labels.filter((l) => /išsaugoti/i.test(l)).length;
    console.info(`[fresh] journal entry saved with ${presses} press(es); presses labelled "Išsaugoti"=${saveWords}`);
    expect(saveWords, "the first entry asks for 'Išsaugoti' more than once").toBe(1);

    // After the first entry: a way to the Living CV, and a reason to come back.
    const cvLink = done.getByTestId("worklog-living-cv-link");
    const hasCvLink = await cvLink.isVisible().catch(() => false);
    const comeBack = await done.getByTestId("worklog-come-back").isVisible().catch(() => false);
    console.info(`[fresh] save confirmation: Living CV link=${hasCvLink} come-back line=${comeBack}`);
    expect(hasCvLink, "the save confirmation names the Living CV").toBe(true);
    expect(comeBack, "the save confirmation gives no next step").toBe(true);
    await cvLink.click();
    await page.waitForURL(/\/cv/, { timeout: 30_000 });
    await settle(page);
    const cvText = await page.locator("body").innerText();
    const cvReflects = /QA-SYNTHETIC|mūrinink|7\s*val/i.test(cvText);
    console.info(`[fresh] Living CV reflects the first entry: ${cvReflects}`);
    expect(cvReflects, "the Living CV shows nothing of the first entry").toBe(true);
    await expectNoSidewaysScroll(page, "Living CV (390)");
  } finally {
    await ctx.close();
  }
});

test("fresh company: onboarding, the company, a described need, visible where the company lands — then closed", async ({ browser }) => {
  const { ctx, page } = await open(browser, "freshcompany", DESKTOP, false);
  let needUrl = "";
  try {
    if (await arriveAtOnboarding(page)) {
      const t0 = Date.now();
      await page.getByTestId("onboarding-intent-hire").click();
      await page.getByTestId("onboarding-intents-continue").click();
      await expect(page.getByTestId("onboarding-display-name")).toBeVisible();
      await page.getByTestId("onboarding-display-name").fill(COMPANY_PERSON);
      await pickCountry(page, "Lith", /^Lithuania$/);
      await page.getByTestId("onboarding-submit").click();
      await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
      await settle(page);
      console.info(`[fresh] company onboarding done in ${Math.round((Date.now() - t0) / 1000)} s → ${new URL(page.url()).pathname}`);
    }

    // The company itself (a new account may land on the setup form or need to reach it).
    let clicks = 0;
    if (!(await page.getByTestId("company-setup-form").isVisible().catch(() => false))) {
      await page.goto("/lt/dashboard/start/company");
      await settle(page);
    }
    const form = page.getByTestId("company-setup-form");
    if (await form.isVisible().catch(() => false)) {
      const legal = page.getByTestId("company-setup-legal-name");
      if (!(await legal.inputValue()).trim()) {
        await legal.fill(COMPANY_NAME);
        await page.getByTestId("company-setup-country").selectOption("LT");
      }
      await page.getByTestId("company-setup-save-draft").click();
      await expect(page.getByTestId("company-setup-next")).toBeVisible({ timeout: 30_000 });
    } else {
      console.info("[fresh] company already set up");
    }

    // "Describe a need" is the first door after the company is saved.
    const door = page.getByTestId("company-setup-describe-need");
    const doorShown = await door.isVisible().catch(() => false);
    console.info(`[fresh] setup offers "describe a need": ${doorShown}`);
    if (doorShown) {
      await door.click();
      clicks += 1;
    } else {
      await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
    }
    await settle(page);
    await inMain(page).getByTestId("demand-role").fill(NEED_ROLE);
    await inMain(page).getByTestId("demand-description").fill(NEED_TEXT);
    await inMain(page).getByTestId("demand-next").click();
    clicks += 1;
    const size = inMain(page).getByTestId("demand-team-size");
    if (await size.isVisible().catch(() => false)) await size.fill("2");
    await inMain(page).getByTestId("demand-next").click();
    clicks += 1;
    await inMain(page).getByTestId("demand-create").click();
    clicks += 1;
    const saved = inMain(page).getByTestId("demand-done");
    const limit = inMain(page).getByTestId("demand-open-need-limit");
    await expect(saved.or(limit)).toBeVisible({ timeout: 30_000 });
    expect(await limit.isVisible(), "a brand-new company was refused its first need").toBe(false);
    console.info(`[fresh] need saved; clicks from saved company to saved need=${clicks}`);
    expect(doorShown, "setup does not offer 'describe a need'").toBe(true);

    // The saved need is visible where the company lands — desktop, then the phone.
    await page.goto("/lt/dashboard/company");
    await settle(page);
    const onHome = inMain(page).getByText(NEED_ROLE).first();
    const visibleOnHome = await onHome.isVisible().catch(() => false);
    console.info(`[fresh] saved need visible on the company home (1280): ${visibleOnHome}`);
    const link = inMain(page).locator('a[href*="/dashboard/company/scouting?request="]', { hasText: NEED_ROLE }).first();
    needUrl = (await link.getAttribute("href").catch(() => null)) ?? "";
    expect(visibleOnHome, "the saved need is not visible on the company home").toBe(true);

    const phone = await open(browser, "freshcompany", PHONE, true);
    try {
      await phone.page.goto("/lt/dashboard/company");
      await settle(phone.page);
      const onPhone = await inMain(phone.page).getByText(NEED_ROLE).first().isVisible().catch(() => false);
      console.info(`[fresh] saved need visible on the company home (390): ${onPhone}`);
      await expectNoSidewaysScroll(phone.page, "company home (390)");
      expect(onPhone, "the saved need is not visible on the phone").toBe(true);
    } finally {
      await phone.ctx.close();
    }
  } finally {
    // Cleanup: close this run's need through the product's own control.
    try {
      if (!needUrl) {
        await page.goto("/lt/dashboard/company/scouting");
        await settle(page);
        const a = page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: NEED_ROLE }).first();
        needUrl = (await a.getAttribute("href").catch(() => null)) ?? "";
      }
      const id = /request=([0-9a-f-]{36})/.exec(needUrl)?.[1] ?? "";
      if (id) {
        await page.goto(`/lt/dashboard/company/scouting?request=${id}`);
        await settle(page);
        const controls = inMain(page).getByTestId("demand-lifecycle-controls").first();
        let closed = false;
        if (await controls.isVisible().catch(() => false)) {
          if ((await controls.getAttribute("data-demand-status")) !== "closed") {
            await controls.getByTestId("demand-close").click();
          }
          await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
          closed = true;
        } else {
          // A need that names no trade is closed from the candidates result.
          await page.goto(`/lt/dashboard?result=candidates&demand=${id}`);
          await settle(page);
          const close = inMain(page).getByTestId("candidates-close-demand").filter({ visible: true }).first();
          if (await close.isVisible().catch(() => false)) {
            await close.click();
            await expect(inMain(page).getByTestId("candidates-reopen-demand").filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
            closed = true;
          }
        }
        console.info(`[fresh] cleanup: this run's need closed=${closed}`);
      } else {
        console.info("[fresh] cleanup: no need of this run found");
      }
    } finally {
      await ctx.close();
    }
  }
});
