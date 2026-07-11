// Authenticated 390px journey proof — LOCAL seeded stack ONLY.
//
// Drives the worker + company marketplace journeys (marketplace precision
// programme, Capability H) against the repo's documented local fixtures
// (docs/TESTING.md: dev.worker@local.test / dev.company@local.test, both
// password "password", synthetic, local-only) and captures screenshots.
//
// HARD GUARD: refuses any target that is not localhost:3100 — the cloud
// project stays real-data-only and is never a test target (same rule as
// scripts/e2e-local.ts).
//
// Prereqs (see docs/TESTING.md): npx supabase start && npx supabase db reset
// && pnpm db:fixtures:local && pnpm -C apps/web e2e:install, app running on
// :3100 with the local env (as e2e-local boots it).
//
// Run from apps/web:  node scripts/marketplace-auth-proof.mjs
// Output: ../../runtime/marketplace-proof/*.png + a JSON summary on stdout.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PROOF_BASE_URL ?? "http://localhost:3100";
if (!/^http:\/\/(localhost|127\.0\.0\.1):3100$/.test(BASE)) {
  throw new Error("marketplace-auth-proof runs ONLY against the local seeded stack");
}
const OUT = join(process.cwd(), "..", "..", "runtime", "marketplace-proof");
mkdirSync(OUT, { recursive: true });

const WORKER = { email: "dev.worker@local.test", password: "password" };
const COMPANY = { email: "dev.company@local.test", password: "password" };
const MOBILE = { width: 390, height: 844 };

const results = [];
const browser = await chromium.launch();

async function shot(page, name) {
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  results.push({ name, url: page.url(), hOverflowPx: overflow });
}

async function login(viewport, creds) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 90000, waitUntil: "domcontentloaded" });
  return page;
}

// ── Worker journey ───────────────────────────────────────────────────────────
{
  const page = await login(MOBILE, WORKER);
  await shot(page, "worker-01-dashboard");
  await page.goto(`${BASE}/lt/dashboard/profile`, { waitUntil: "domcontentloaded" });
  await shot(page, "worker-02-profile");
  const prefs = page.getByTestId("worker-availability-prefs-form").first();
  if (await prefs.count()) {
    await prefs.scrollIntoViewIfNeeded();
    await shot(page, "worker-03-structured-preferences");
  }
  await page.goto(`${BASE}/lt/dashboard/journal`, { waitUntil: "domcontentloaded" });
  await shot(page, "worker-04-journal");
  await page.goto(`${BASE}/lt/dashboard/opportunities`, { waitUntil: "domcontentloaded" });
  await shot(page, "worker-05-opportunities");
  const details = page.locator("button[aria-expanded]").first();
  if (await details.count()) {
    await details.click().catch(() => {});
    await shot(page, "worker-06-opportunity-details");
  }
  await page.goto(`${BASE}/lt/dashboard/bookings`, { waitUntil: "domcontentloaded" });
  await shot(page, "worker-07-bookings");
  await page.goto(`${BASE}/lt/dashboard/communication`, { waitUntil: "domcontentloaded" });
  await shot(page, "worker-08-communication");
  await page.goto(`${BASE}/lt/dashboard/planning`, { waitUntil: "domcontentloaded" });
  await shot(page, "worker-09-planning");
  await page.context().close();
}

// ── Company journey ──────────────────────────────────────────────────────────
{
  const page = await login(MOBILE, COMPANY);
  await shot(page, "company-01-dashboard");
  if (await page.getByTestId("demand-description").count()) {
    await page.getByTestId("demand-role").fill("Mūrininkai fasado darbams");
    await page
      .getByTestId("demand-description")
      .fill("Reikalingi 4 mūrininkai fasado mūro darbams, 3 mėnesių projektas.");
    await shot(page, "company-02-demand-step1");
    await page.getByTestId("demand-next").click();
    await page.waitForTimeout(600);
    const comp = page.getByTestId("sdv2-section-compensation");
    if (await comp.count()) {
      await comp.scrollIntoViewIfNeeded();
      await comp.click();
      // Max-only on purpose: the review step must flag the missing minimum /
      // basis / guaranteed hours / deductions (publish-honesty proof).
      await page.getByTestId("sdv2-comp-max").fill("20");
      await shot(page, "company-03-advanced-compensation");
    }
    await page.getByTestId("demand-next").click();
    await page.waitForTimeout(600);
    if (await page.getByTestId("demand-review").count()) {
      await shot(page, "company-04-review");
      const flags = page.getByTestId("demand-honesty-flags");
      if (await flags.count()) {
        await flags.scrollIntoViewIfNeeded();
        await shot(page, "company-05-honesty-flags");
      }
      const preview = page.getByTestId("demand-worker-preview");
      if (await preview.count()) {
        await preview.scrollIntoViewIfNeeded();
        await shot(page, "company-06-worker-preview");
      }
    }
  } else {
    results.push({ name: "company-demand-wizard", error: "demand form not reachable" });
  }
  await page.goto(`${BASE}/lt/dashboard/company/scouting`, { waitUntil: "domcontentloaded" });
  await shot(page, "company-07-scouting");
  await page.goto(`${BASE}/lt/dashboard/bookings`, { waitUntil: "domcontentloaded" });
  await shot(page, "company-08-bookings");
  await page.goto(`${BASE}/lt/dashboard/planning`, { waitUntil: "domcontentloaded" });
  await shot(page, "company-09-planning");
  await page.goto(`${BASE}/lt/dashboard/projects`, { waitUntil: "domcontentloaded" });
  await shot(page, "company-10-projects");
  await page.context().close();
}

// ── Desktop parity samples ───────────────────────────────────────────────────
{
  const page = await login({ width: 1440, height: 900 }, WORKER);
  await page.goto(`${BASE}/lt/dashboard/opportunities`, { waitUntil: "domcontentloaded" });
  await shot(page, "desktop-worker-opportunities");
  await page.context().close();
  const cpage = await login({ width: 1440, height: 900 }, COMPANY);
  await shot(cpage, "desktop-company-dashboard");
  await cpage.context().close();
}

await browser.close();
console.log(JSON.stringify({ outDir: OUT, results }, null, 2));
const overflowing = results.filter((r) => (r.hOverflowPx ?? 0) > 0);
if (overflowing.length > 0) {
  console.error("HORIZONTAL OVERFLOW DETECTED:", overflowing.map((r) => r.name).join(", "));
  process.exit(1);
}
