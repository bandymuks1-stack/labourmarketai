/**
 * W7-S5 copy proof — LOCAL ONLY.
 *
 * A voice change is cheap to assert in a JSON guard and easy to get wrong on
 * screen: first-person labels are LONGER than the record-voice ones they
 * replace ("Has own tools" → "I have my own tools"), and these labels sit in a
 * tri-state radio grid. So this proof reads the RENDERED preference form in
 * every shipped locale and checks the strings a worker actually sees, plus the
 * layout consequence of making them longer.
 *
 * Per locale × viewport it records: the rendered label text, whether any label
 * OVERFLOWS its container or the page, and console/hydration health.
 *
 * Refuses any non-loopback base URL.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3471";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_CAPTURE: ${BASE}`);
  process.exit(1);
}
const PHASE = process.env.UX_PHASE ?? "after";
const EMAIL = process.env.UX_EMAIL ?? "dev.worker@local.test";
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-s5");
mkdirSync(OUT, { recursive: true });

const LOCALES = ["lt", "en", "ru"];
const results = [];
const browser = await chromium.launch();

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "lt-LT",
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const hydration = [];
  page.on("console", (m) => {
    const txt = m.text();
    if (/hydrat|did not match|Text content does not match/i.test(txt))
      hydration.push(txt.slice(0, 240));
    else if (m.type() === "error" && !/upgrade-insecure-requests/.test(txt))
      consoleErrors.push(txt.slice(0, 240));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 240)));

  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|onboarding/, { timeout: 120_000 });

  for (const locale of LOCALES) {
    consoleErrors.length = 0;
    hydration.length = 0;
    await page.goto(`${BASE}/${locale}/dashboard/profile`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(6000);
    await page
      .locator("#cv-availability")
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.waitForTimeout(1200);

    const m = await page.evaluate(() => {
      const form = document.querySelector("#cv-availability");
      if (!form) return { formPresent: false };
      // Every visible text node inside the preferences form, so the proof
      // reads what the worker reads rather than trusting the JSON.
      const labels = [...form.querySelectorAll("legend, label, span")]
        .map((e) => (e.textContent ?? "").trim())
        .filter((t) => t.length > 3 && t.length < 90);
      const overflowing = [...form.querySelectorAll("*")]
        .filter((e) => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)
        .map((e) => (e.textContent ?? "").trim().slice(0, 60))
        .filter(Boolean);
      return {
        formPresent: true,
        labelSample: labels.slice(0, 40),
        overflowingInsideForm: [...new Set(overflowing)].slice(0, 10),
        pageHorizontalOverflow:
          document.documentElement.scrollWidth > innerWidth,
        formHeight: Math.round(form.getBoundingClientRect().height),
      };
    });

    await page
      .locator("#cv-availability")
      .screenshot({
        path: join(OUT, `${PHASE}-prefs-${locale}-${vp.name}.png`),
        caret: "initial",
      })
      .catch(() => {});

    results.push({
      phase: PHASE,
      locale,
      viewport: vp.name,
      consoleErrors: [...consoleErrors],
      hydrationWarnings: [...hydration],
      ...m,
    });
    console.log(
      `[${PHASE}/${locale}@${vp.name}] form=${m.formPresent} h=${m.formHeight ?? "-"} overflowInForm=${(m.overflowingInsideForm ?? []).length} pageOverflow=${m.pageHorizontalOverflow} console=${consoleErrors.length} hydration=${hydration.length}`,
    );
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, `${PHASE}.json`), JSON.stringify(results, null, 2));
console.log(`wrote ${join(OUT, `${PHASE}.json`)}`);
