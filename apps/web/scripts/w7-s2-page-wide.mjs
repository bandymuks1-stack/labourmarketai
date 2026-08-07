/**
 * W7-S2 — the WHOLE `/dashboard/profile` surface, so the report can state what
 * remains rather than only what this slice touched. LOCAL ONLY.
 *
 * Reports unlabelled fields both ways (perceivable-only, and including
 * `input[type=hidden]`) because the original audit's "34 unlabelled inputs"
 * counted hidden inputs and therefore overstated the real debt.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3480";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_CAPTURE: ${BASE}`);
  process.exit(1);
}
const PHASE = process.env.UX_PHASE ?? "after";
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-s2-profile-accessibility");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const out = [];
for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', "dev.worker@local.test");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 120_000 });
  await page.goto(`${BASE}/lt/dashboard/profile`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForTimeout(8000);

  const m = await page.evaluate(() => {
    const named = (e) =>
      Boolean(
        e.getAttribute("aria-label") ||
          e.getAttribute("aria-labelledby") ||
          (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) ||
          e.closest("label"),
      );
    const fields = [...document.querySelectorAll("input, textarea, select")];
    const perceivable = fields.filter((e) => e.type !== "hidden");
    const interactive = [
      ...document.querySelectorAll("button, a, input, textarea, select, summary, [role=radio], [role=button]"),
    ].filter((e) => e.type !== "hidden");
    const small = interactive
      .map((e) => {
        const b = e.getBoundingClientRect();
        return {
          id:
            e.getAttribute("data-testid") ??
            `${e.tagName}:${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 22)}`,
          w: Math.round(b.width),
          h: Math.round(b.height),
        };
      })
      .filter((o) => o.h > 0 && (o.h < 44 || o.w < 44));
    const inPrefs = (e) => Boolean(e.closest('[data-testid="worker-availability-prefs"]'));
    return {
      docHeight: document.documentElement.scrollHeight,
      totalFields: fields.length,
      hiddenFields: fields.length - perceivable.length,
      perceivableFields: perceivable.length,
      unlabelledPerceivable: perceivable.filter((e) => !named(e)).length,
      unlabelledPerceivableDetail: perceivable
        .filter((e) => !named(e))
        .map((e) => `${e.tagName}:${e.getAttribute("name") ?? e.getAttribute("data-testid") ?? e.type}`),
      unlabelledIncludingHidden: fields.filter((e) => !named(e)).length,
      interactiveTotal: interactive.length,
      sub44Total: small.length,
      sub44InPrefsForm: interactive.filter((e) => {
        const b = e.getBoundingClientRect();
        return inPrefs(e) && b.height > 0 && (b.height < 44 || b.width < 44);
      }).length,
      sub44Elsewhere: small.length -
        interactive.filter((e) => {
          const b = e.getBoundingClientRect();
          return inPrefs(e) && b.height > 0 && (b.height < 44 || b.width < 44);
        }).length,
      sub44Sample: small.slice(0, 25),
    };
  });
  out.push({ phase: PHASE, viewport: vp.name, ...m });
  console.log(
    `[${PHASE}@${vp.name}] PAGE fields=${m.totalFields} (hidden=${m.hiddenFields}) unlabelled: perceivable=${m.unlabelledPerceivable} inclHidden=${m.unlabelledIncludingHidden} | interactive=${m.interactiveTotal} sub44=${m.sub44Total} (prefs-form=${m.sub44InPrefsForm}, elsewhere=${m.sub44Elsewhere})`,
  );
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, `${PHASE}-page-wide.json`), JSON.stringify(out, null, 2));
