/**
 * W7 A-2 browser evidence — LOCAL stack only.
 *
 * Logs in as dev.worker@local.test, opens /dashboard/profile, opens the
 * education + achievements forms and the capabilities disclosure, measures
 * the touched controls' bounding boxes (must be >= 43.5px tall), and
 * captures 1440 + 375 full-page screenshots.
 *
 * Run: pnpm exec tsx scripts/w7-a2-evidence.ts  (server on :3002)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:3002";
const OUT = join(__dirname, "..", "..", "..", "docs", "audits", "evidence", "w7-a2");

const MEASURE: Array<{ sel: string; name: string; optional?: boolean }> = [
  { sel: '[data-testid="profile-avatar-label"]', name: "avatar upload label" },
  { sel: '[data-testid="profile-avatar-remove"]', name: "avatar remove", optional: true },
  { sel: '[data-testid="worker-achievements-title"]', name: "achievement title input" },
  { sel: '[data-testid="profile-mano-cv-records-link"]', name: "cv records link", optional: true },
  { sel: '[data-testid="capability-profile-manual-add-button"]', name: "manual add skill", optional: true },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/auth/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "dev.worker@local.test");
  await page.fill('input[type="password"]', "password");
  await Promise.all([
    page.waitForURL(/dashboard|onboarding/, { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/en/dashboard/profile`, { waitUntil: "networkidle" });

  // Open the disclosures/forms the fixed controls live behind.
  const capSummary = page.locator("details#capabilities > summary");
  if (await capSummary.count()) await capSummary.click();
  for (const testid of ["worker-education-add-open", "worker-achievements-add-open"]) {
    const btn = page.locator(`[data-testid="${testid}"]`);
    if (await btn.count()) await btn.first().click();
  }
  await page.waitForTimeout(400);

  const failures: string[] = [];
  let measured = 0;
  for (const m of MEASURE) {
    const loc = page.locator(m.sel).first();
    if ((await loc.count()) === 0) {
      if (!m.optional) failures.push(`${m.name}: NOT FOUND (${m.sel})`);
      continue;
    }
    const box = await loc.boundingBox();
    if (!box) {
      if (!m.optional) failures.push(`${m.name}: no box`);
      continue;
    }
    measured++;
    console.log(`${m.name}: ${Math.round(box.width)}x${Math.round(box.height)}`);
    if (box.height < 43.5) failures.push(`${m.name}: ${box.height}px tall`);
  }
  // Sweep: every enabled button/link/input inside the worker sections must
  // be >= 43.5px tall (textarea + inline-text exceptions skipped).
  const sweep = await page.evaluate(() => {
    const bad: string[] = [];
    const roots = document.querySelectorAll(
      "#cv-education, #cv-achievements, #cv-languages, #capabilities",
    );
    for (const root of roots) {
      for (const el of root.querySelectorAll("button, a, input:not([type=hidden])")) {
        const h = el as HTMLElement;
        if (h.closest("[hidden]") || h.hasAttribute("disabled")) continue;
        const r = h.getBoundingClientRect();
        if (r.height === 0) continue; // not rendered
        if (h.tagName === "INPUT" && (h as HTMLInputElement).type === "checkbox") continue; // label carries the target
        if (r.height < 43.5) {
          bad.push(
            `${h.tagName}.${(h.className || "").toString().slice(0, 60)} ${Math.round(r.height)}px "${(h.textContent || "").trim().slice(0, 30)}"`,
          );
        }
      }
    }
    return bad;
  });
  for (const b of sweep) failures.push(`sweep: ${b}`);

  await page.screenshot({ path: join(OUT, "profile-worker-a2-1440.png"), fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "profile-worker-a2-375.png"), fullPage: true, caret: "initial" });
  await browser.close();

  console.log(`measured=${measured} sweepFailures=${sweep.length}`);
  if (failures.length) {
    console.error("FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("evidence written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
