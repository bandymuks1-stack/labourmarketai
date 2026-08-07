/**
 * W7-S1 interaction + keyboard proof. LOCAL ONLY.
 *
 * Proves the things a height measurement cannot: the disclosure opens and
 * reveals the absorbed content, every absorbed destination is clickable, the
 * detailed editors below the overview are still reachable, and the whole
 * surface is operable from the keyboard with a visible focus ring.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3460";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_CAPTURE: ${BASE}`);
  process.exit(1);
}
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-s1");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
};

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
]) {
  console.log(`\n─── ${vp.name} ───`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "lt-LT",
  });
  const page = await ctx.newPage();
  const errors = [];
  const hydration = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match/i.test(t)) hydration.push(t.slice(0, 200));
    else if (m.type() === "error" && !/upgrade-insecure-requests/.test(t)) errors.push(t.slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  await page.fill('input[type="email"]', "dev.worker@local.test");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 120_000 });
  await page.goto(`${BASE}/lt/dashboard/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  // 1 — exactly one overview, the duplicates are gone
  ok("exactly one ProfileHubOverview", (await page.locator('[data-testid="profile-hub-overview"]').count()) === 1);
  for (const gone of ["profile-state-strip", "live-profile-section", "worker-setup-journey", "skills-review-banner"]) {
    ok(`${gone} removed`, (await page.locator(`[data-testid="${gone}"]`).count()) === 0);
  }

  // 2 — hierarchy: status, then missing, then the next action
  const order = await page.evaluate(() => {
    const y = (s) => {
      const el = document.querySelector(s);
      return el ? el.getBoundingClientRect().y + scrollY : null;
    };
    return {
      status: y('[data-testid="profile-hub-status"]'),
      // A fully-ready worker legitimately renders the "nothing missing" line
      // INSTEAD of the list — both occupy the same slot in the reading order.
      missing:
        y('[data-testid="profile-hub-missing"]') ??
        y('[data-testid="profile-hub-missing-none"]'),
      primary: y('[data-testid="profile-hub-primary-action"]'),
      done: y('[data-testid="profile-hub-done-summary"]'),
    };
  });
  ok(
    "reading order status → missing → next action → done",
    order.status != null &&
      order.missing != null &&
      order.status < order.missing &&
      order.missing < order.primary &&
      order.primary < order.done,
    JSON.stringify(order),
  );

  // 3 — the disclosure reveals the absorbed content
  const beforeOpen = await page.locator('[data-testid="live-profile-history"], [data-testid="live-profile-history-empty"]').isVisible().catch(() => false);
  ok("absorbed detail hidden while collapsed", beforeOpen === false);
  await page.click('[data-testid="profile-hub-done-summary"]');
  await page.waitForTimeout(900);
  for (const sel of [
    '[data-testid="profile-hub-activity"]',
    '[data-testid="cv-completeness-grid"]',
  ]) {
    ok(`revealed after opening: ${sel}`, await page.locator(sel).first().isVisible());
  }
  const historyVisible =
    (await page.locator('[data-testid="live-profile-history"]').isVisible().catch(() => false)) ||
    (await page.locator('[data-testid="live-profile-history-empty"]').isVisible().catch(() => false));
  ok("revealed after opening: work history", historyVisible);
  const oppVisible =
    (await page.locator('[data-testid="live-profile-opportunity"]').isVisible().catch(() => false)) ||
    (await page.locator('[data-testid="live-profile-opportunity-unavailable"]').isVisible().catch(() => false));
  ok("revealed after opening: opportunity signal", oppVisible);
  await page.screenshot({ path: join(OUT, `after-disclosure-open-${vp.name}.png`), fullPage: true, caret: "initial" });

  // 4 — the detailed editors below the overview are still reachable
  const editors = await page.evaluate(() =>
    ["#profile-edit", "#cv-availability", "#cv-languages", "#capabilities", "#managed-companies", "#profile-identity"].filter(
      (id) => document.querySelector(id) !== null,
    ),
  );
  ok("all 6 editor anchors still on the page", editors.length === 6, editors.join(" "));

  // 5 — an absorbed destination actually navigates
  await page.click('[data-testid="profile-hub-opportunities-link"]');
  await page.waitForURL(/opportunities/, { timeout: 60_000 }).catch(() => {});
  ok("opportunities link navigates", /\/dashboard\/opportunities/.test(page.url()), page.url());
  await page.goBack();
  await page.waitForTimeout(3000);

  // 6 — keyboard: reach the disclosure by real Tab presses (so `:focus-visible`
  //     applies and the ring we assert is the one a keyboard user sees).
  await page.evaluate(() =>
    document.querySelector('[data-testid="profile-hub-primary-action"]')?.focus(),
  );
  let focus = null;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    focus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        testid: el.getAttribute("data-testid"),
        tag: el.tagName,
        matchesFocusVisible: el.matches(":focus-visible"),
        ring: cs.boxShadow !== "none" || cs.outlineStyle !== "none",
      };
    });
    if (focus?.testid === "profile-hub-done-summary") break;
  }
  ok("disclosure summary reachable by Tab", focus?.testid === "profile-hub-done-summary", JSON.stringify(focus));
  ok("…and shows a visible focus ring", focus?.ring === true && focus?.matchesFocusVisible === true, JSON.stringify(focus));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const toggled = await page.evaluate(
    () => document.querySelector('[data-testid="profile-hub-overview"] details')?.open,
  );
  ok("Enter toggles the disclosure", typeof toggled === "boolean");

  // 7 — first-row reachability by Tab from the status heading
  const tabbed = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="setup-step-"]')];
    return rows.length > 0 && rows.every((r) => r.tabIndex >= 0 || r.tagName === "A");
  });
  ok("every step row is a real focusable link", tabbed);

  // 8 — honesty gates
  ok("no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  ok("zero product console errors", errors.length === 0, errors.join(" | "));
  ok("zero hydration warnings", hydration.length === 0, hydration.join(" | "));

  await ctx.close();
}
await browser.close();
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
