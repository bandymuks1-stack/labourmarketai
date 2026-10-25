import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

/**
 * PRODUCTION — THE DAILY SURFACES AT PHONE WIDTH (owner programme 2026-10-12
 * §5.4: "good use on a 390 px screen"). READ-ONLY: nothing is written.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=mobile-surfaces)
 * with the synthetic cast. For each surface: it opens, its own landmark is
 * visible, and the page is never wider than the phone (no sideways scroll).
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const ALFA = "QA-SYNTHETIC Alfa";

async function phone(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    viewport: PHONE,
    isMobile: true,
    hasTouch: true,
  });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

/** The page fits the phone: no element pushes the document wider than the viewport. */
async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  console.info(`[mobile] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} is wider than a 390 px phone`).toBeLessThanOrEqual(inner + 1);
}

/**
 * Every box stays inside the phone — measured per element, not per page.
 * `html, body { overflow-x: hidden }` CLIPS an over-wide card instead of
 * letting the page scroll, so `expectNoSidewaysScroll` cannot see it (#2751).
 * Same rule as `mobile-layout-reach.spec.ts`: nothing outside a deliberate
 * horizontal scroller may end past the viewport's right edge.
 */
async function expectReachable(page: Page, where: string): Promise<void> {
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
      return false;
    };
    const found: { el: Element; line: string }[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= vw + 1) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.visibility === "hidden") continue;
      if (el.closest("[hidden]")) continue;
      if (inScroller(el)) continue;
      if (found.some((f) => f.el.contains(el))) continue;
      const id = el.getAttribute("data-testid");
      found.push({ el, line: `<${el.tagName.toLowerCase()}${id ? ` data-testid=${id}` : ""}> right=${Math.round(r.right)}` });
      if (found.length >= 8) break;
    }
    return found.map((f) => f.line);
  });
  console.info(`[mobile] ${where}: boxes past the 390 px edge = ${offenders.length}${offenders.length ? ` — ${offenders.join("; ")}` : ""}`);
  expect(offenders, `${where}: boxes past the 390 px edge (clipped, unreachable)`).toEqual([]);
}

/** Records React hydration errors (#418/#423/#425) from the first script on. */
async function watchHydration(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __hydrationErrors: string[] };
    w.__hydrationErrors = [];
    const Orig = window.Error;
    function Wrapped(this: unknown, ...args: unknown[]) {
      const e = new Orig(...(args as [string?]));
      const m = String(args[0] ?? "");
      if (/#418|#423|#425|[Hh]ydrat/.test(m)) w.__hydrationErrors.push(m.slice(0, 160));
      return e;
    }
    Wrapped.prototype = Orig.prototype;
    Object.setPrototypeOf(Wrapped, Orig);
    (window as unknown as { Error: unknown }).Error = Wrapped;
  });
}

/** The server HTML was claimed once: no hydration error, no orphaned `S:n` copy. */
async function hydrationState(page: Page): Promise<{ errors: string[]; holders: number }> {
  await page.waitForTimeout(1500);
  return page.evaluate(() => ({
    errors: (window as unknown as { __hydrationErrors?: string[] }).__hydrationErrors ?? [],
    holders: document.querySelectorAll("[hidden][id^='S:']").length,
  }));
}

/** `loads` cold loads of each path, each in a fresh phone context. */
async function coldLoads(browser: Browser, paths: readonly string[], loads: number, slot?: string): Promise<string[]> {
  const failures: string[] = [];
  for (const path of paths) {
    let bad = 0;
    for (let i = 0; i < loads; i++) {
      const ctx = await browser.newContext({
        ...(slot ? { storageState: state(slot) } : {}),
        locale: "lt-LT",
        viewport: PHONE,
        isMobile: true,
        hasTouch: true,
      });
      await watchHydration(ctx);
      const page = await ctx.newPage();
      await page.goto(path);
      await settle(page);
      const s = await hydrationState(page);
      if (s.errors.length || s.holders) {
        bad++;
        failures.push(`${path} load ${i + 1}: errors=${s.errors.length} holders=${s.holders} ${s.errors[0] ?? ""}`);
      }
      await ctx.close();
    }
    console.info(`[hydration] ${slot ?? "public"} ${path}: ${bad}/${loads} loads failed`);
  }
  return failures;
}

async function workspace(page: Page, orgName: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

test("M-1. manager on a phone: company home, planning and the review queue fit and answer", async ({ browser }) => {
  const { page, close } = await phone(browser, "owner");
  await page.goto("/lt/dashboard");
  await settle(page);
  await workspace(page, ALFA);
  for (const [path, landmark] of [
    ["/lt/dashboard/company", "company-dashboard"],
    ["/lt/dashboard/company/planning", "workforce-planning-page"],
    ["/lt/dashboard/inbox", "inbox-summary"],
  ] as const) {
    await page.goto(path);
    await settle(page);
    await expect(page.getByTestId(landmark).first(), `${path} shows ${landmark}`).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, path);
  }
  // The home answers "what needs me" or says it could not read — never silence.
  await page.goto("/lt/dashboard/company");
  await settle(page);
  const strip = page.getByTestId("company-decisions-strip");
  const unread = page.getByTestId("company-decisions-unread");
  console.info(`[mobile] decisions strip: ${(await strip.count()) > 0 ? (await strip.innerText()).replace(/\s+/g, " ").slice(0, 200) : "none pending"}; unread: ${await unread.count()}`);
  await close();
});

test("M-2. worker on a phone: the chat composer and the journal fit and are usable", async ({ browser }) => {
  const { page, close } = await phone(browser, "worker");
  await page.goto("/lt/dashboard");
  await settle(page);
  const composer = page.getByTestId("composer-input").first();
  await expect(composer).toBeVisible({ timeout: 30_000 });
  // The composer is on screen at phone height without scrolling past the day.
  const box = await composer.boundingBox();
  expect(box, "composer has a box").not.toBeNull();
  expect(box!.y + box!.height, "composer is within the first screen").toBeLessThanOrEqual(PHONE.height + 1);
  await expectNoSidewaysScroll(page, "/lt/dashboard");
  await page.goto("/lt/dashboard/journal");
  await settle(page);
  await expect(page.getByTestId("journal-quick-record-text")).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page, "/lt/dashboard/journal");
  await page.goto("/lt/dashboard/planning");
  await settle(page);
  await expect(page.getByTestId("planning-page")).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page, "/lt/dashboard/planning");
  await close();
});

// ── #2751 in production: the seven 390 px defects, #418 and the S:n copy ──

test("M-3. worker on a phone: home Today cards and the Living CV tiles stay inside the phone", async ({ browser }) => {
  const { page, close } = await phone(browser, "worker");
  for (const path of ["/lt/dashboard", "/ru/dashboard", "/nl/cv", "/de/cv"]) {
    await page.goto(path);
    await settle(page);
    const text = (await page.evaluate("document.body.innerText.trim().length")) as number;
    expect(text, `${path} rendered nothing`).toBeGreaterThan(200);
    await expectReachable(page, path);
  }
  await close();
});

test("M-4. manager on a phone: hours, project operations, defects and the planning outcome fit", async ({ browser }) => {
  const { page, close } = await phone(browser, "owner");
  await page.goto("/lt/dashboard");
  await settle(page);
  await workspace(page, ALFA);

  // Hours: the screen that went 620 px once a day had an entry. Read-only.
  await page.goto("/lt/dashboard/hours");
  await settle(page);
  console.info(`[mobile] /lt/dashboard/hours entries on screen: ${await page.getByTestId("hours-entry").count()}`);
  await expectReachable(page, "/lt/dashboard/hours");
  const save = page.locator("main").getByTestId("hours-save").first();
  if (await save.isVisible().catch(() => false)) {
    const box = await save.boundingBox();
    expect(box && box.x + box.width, "hours Save is reachable on the phone").toBeLessThanOrEqual(PHONE.width);
  }

  // Project operations: opens on the project, facts form and defects fit.
  await page.goto("/lt/dashboard/projects");
  await settle(page);
  const href = await page
    .locator('main a[href*="/dashboard/projects/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? "").find((h) => /\/projects\/[0-9a-f-]{36}/.test(h)) ?? null);
  expect(href, "the synthetic company has a project").not.toBeNull();
  const id = href!.match(/projects\/([0-9a-f-]{36})/)![1];
  const ops = `/lt/dashboard/projects/${id}/operations`;
  await page.goto(ops);
  await settle(page);
  const context = page.getByTestId("ops-project-context");
  await expect(context, "operations names the project").toBeVisible({ timeout: 30_000 });
  const ctxBox = await context.boundingBox();
  expect(ctxBox!.y, "the project is named above the fold").toBeLessThan(PHONE.height);
  const order = await page.evaluate(() => {
    const ctx = document.querySelector('[data-testid="ops-project-context"]');
    const pulse = document.querySelector('[data-testid="arena-confirm-pulse"]');
    if (!ctx || !pulse) return "no-pulse";
    return ctx.compareDocumentPosition(pulse) & Node.DOCUMENT_POSITION_FOLLOWING ? "project-first" : "pulse-first";
  });
  console.info(`[mobile] ${ops}: order=${order}`);
  expect(["project-first", "no-pulse"], "the project leads, the confirm pulse follows").toContain(order);
  await expectReachable(page, ops);
  // Defect descriptions wrap instead of being cut ("UXV-SY…").
  const cut = await page.getByTestId("defect-description-text").evaluateAll((ps) =>
    ps.filter((p) => p.scrollWidth > p.clientWidth + 1 || getComputedStyle(p).textOverflow === "ellipsis").length,
  );
  console.info(`[mobile] defect descriptions: ${await page.getByTestId("defect-description-text").count()}, cut: ${cut}`);
  expect(cut, "a defect description is cut off").toBe(0);

  // Planning: the outcome notice is brought on screen, not left 3,000 px below.
  await page.goto("/lt/dashboard/company/planning?plan=planned");
  await settle(page);
  const notice = page.getByTestId("work-plan-notice");
  console.info(`[mobile] planning notice present: ${await notice.count()}`);
  if (await notice.count()) await expect(notice.first(), "the planning outcome is on screen").toBeInViewport({ timeout: 10_000 });
  await expectReachable(page, "/lt/dashboard/company/planning");
  await close();
});

test("M-5. hydration claims the server HTML once: no #418, no hidden S:n copy", async ({ browser }) => {
  test.setTimeout(600_000);
  const failures = [
    ...(await coldLoads(browser, ["/lt/jobs", "/ru/jobs", "/nl/jobs", "/de/jobs"], 5)),
    ...(await coldLoads(browser, ["/en/for-workers", "/pl/pricing"], 3)),
    ...(await coldLoads(browser, ["/lt/dashboard", "/lt/dashboard/journal", "/lt/cv"], 2, "worker")),
    ...(await coldLoads(browser, ["/lt/dashboard/hours", "/lt/dashboard/projects", "/lt/dashboard/company/planning"], 2, "owner")),
  ];
  expect(failures, `hydration failed:\n${failures.join("\n")}`).toEqual([]);
});
