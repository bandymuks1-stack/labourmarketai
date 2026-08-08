/**
 * W7-S2 — accessibility + touch-ergonomics measurement for
 * `worker-availability-prefs-form`. LOCAL ONLY.
 *
 * Accessible names come from Chromium's OWN accessibility tree
 * (`page.accessibility.snapshot`), not from a source regex — that is the same
 * computation a screen reader performs. No new dependency: Playwright is
 * already the project's browser tooling and axe is not installed.
 *
 * The counts distinguish PERCEIVABLE controls from `input[type=hidden]`. A
 * hidden input carries form state, is not focusable and is not exposed to
 * assistive technology, so counting it as "unlabelled" overstates the debt.
 * Both figures are reported.
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

const FORM = '[data-testid="worker-availability-prefs"]';
const results = [];
const browser = await chromium.launch();

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "lt-LT",
  });
  const page = await ctx.newPage();
  const errors = [];
  const hydration = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match/i.test(t)) hydration.push(t.slice(0, 220));
    else if (m.type() === "error" && !/upgrade-insecure-requests/.test(t)) errors.push(t.slice(0, 220));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 220)));

  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', "dev.worker@local.test");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 120_000 });
  await page.goto(`${BASE}/lt/dashboard/profile`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForTimeout(8000);

  // ── DOM-level inventory, scoped to the component ────────────────────────
  const dom = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const named = (e) =>
      Boolean(
        e.getAttribute("aria-label") ||
          e.getAttribute("aria-labelledby") ||
          (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) ||
          e.closest("label"),
      );
    const fields = [...root.querySelectorAll("input, textarea, select")];
    const perceivable = fields.filter((e) => e.type !== "hidden");
    const interactive = [...root.querySelectorAll("button, a, input, textarea, select, [role=radio], [role=button]")]
      .filter((e) => e.type !== "hidden");
    const box = (e) => e.getBoundingClientRect();
    return {
      totalFields: fields.length,
      hiddenFields: fields.length - perceivable.length,
      perceivableFields: perceivable.length,
      unlabelledPerceivable: perceivable.filter((e) => !named(e)).length,
      unlabelledIncludingHidden: fields.filter((e) => !named(e)).length,
      interactiveTotal: interactive.length,
      sub44: interactive.filter((e) => {
        const b = box(e);
        return b.height > 0 && (b.height < 44 || b.width < 44);
      }).length,
      sub44Detail: interactive
        .map((e) => {
          const b = box(e);
          return {
            id: e.getAttribute("data-testid") ?? `${e.tagName}:${(e.textContent || "").trim().slice(0, 14)}`,
            w: Math.round(b.width),
            h: Math.round(b.height),
          };
        })
        .filter((o) => o.h > 0 && (o.h < 44 || o.w < 44)),
      // roving-tabindex check: an ARIA radiogroup must expose exactly ONE
      // tabbable radio, and arrow keys must move the selection.
      radiogroups: [...root.querySelectorAll('[role="radiogroup"]')].map((g) => ({
        name: g.getAttribute("aria-label") ?? g.getAttribute("aria-labelledby") ?? null,
        radios: g.querySelectorAll('[role="radio"]').length,
        tabbableRadios: [...g.querySelectorAll('[role="radio"]')].filter(
          (r) => (r.getAttribute("tabindex") ?? "0") !== "-1",
        ).length,
      })),
      groups: [...root.querySelectorAll('[role="group"]')].map((g) => ({
        name: g.getAttribute("aria-label") ?? g.getAttribute("aria-labelledby") ?? null,
        children: g.querySelectorAll("button, input").length,
      })),
      // colour-independence: does the selected control carry a non-colour mark?
      selectedMarkers: [...root.querySelectorAll('[aria-checked="true"], [aria-pressed="true"]')].map(
        (e) => ({
          id: e.getAttribute("data-testid"),
          text: (e.textContent || "").trim().slice(0, 24),
          hasNonColourMark: Boolean(e.querySelector("svg, [data-selected-mark]")),
        }),
      ),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, FORM);

  /**
   * Playwright's ARIA snapshot — its own accessible-name computation, the same
   * engine `getByRole(role, { name })` uses. `page.accessibility` was removed
   * in Playwright 1.60, and axe is not a project dependency, so this is the
   * established tooling available here.
   *
   * Lines look like `- radio "Taip" [checked]` / `- textbox` (no name).
   */
  const aria = await page.locator(FORM).ariaSnapshot();
  const CONTROL_ROLES = [
    "radio",
    "checkbox",
    "button",
    "textbox",
    "combobox",
    "spinbutton",
    "switch",
    "listbox",
    "option",
    "radiogroup",
    "group",
  ];
  const controls = [];
  for (const raw of aria.split("\n")) {
    let line = raw.trim().replace(/^-\s*/, "");
    // When an accessible name contains a colon, Playwright YAML-quotes the
    // whole key: `'button "Kategorijos: B"': B`. Unwrap that first, or the
    // control is silently missed and the count under-reports.
    const quoted = line.match(/^'(.*?)'\s*:?/);
    if (quoted) line = quoted[1];
    const m = line.match(/^([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?/);
    if (!m) continue;
    if (!CONTROL_ROLES.includes(m[1])) continue;
    controls.push({ role: m[1], name: m[2] ?? "" });
  }
  const NAMEABLE = new Set(CONTROL_ROLES.filter((r) => r !== "group"));
  const unnamed = controls.filter((n) => NAMEABLE.has(n.role) && !n.name.trim());

  const row = {
    phase: PHASE,
    viewport: vp.name,
    ...dom,
    a11yTree: {
      controls: controls.length,
      unnamedControls: unnamed.length,
      unnamedDetail: unnamed.map((n) => n.role),
      ariaSnapshot: aria,
      radios: controls.filter((n) => n.role === "radio").length,
      checkboxes: controls.filter((n) => n.role === "checkbox").length,
      byRole: Object.fromEntries(
        [...new Set(controls.map((c) => c.role))].map((r) => [r, controls.filter((c) => c.role === r).length]),
      ),
    },
    consoleErrors: errors,
    hydrationWarnings: hydration,
  };
  results.push(row);

  await page.locator(FORM).screenshot({ path: join(OUT, `${PHASE}-prefs-form-${vp.name}.png`), caret: "initial" });

  console.log(
    `[${PHASE}@${vp.name}] fields=${dom.totalFields} (hidden=${dom.hiddenFields} perceivable=${dom.perceivableFields}) unlabelled: perceivable=${dom.unlabelledPerceivable} inclHidden=${dom.unlabelledIncludingHidden} | a11y-tree controls=${row.a11yTree.controls} unnamed=${row.a11yTree.unnamedControls} | interactive=${dom.interactiveTotal} sub44=${dom.sub44} | radiogroups=${dom.radiogroups.length} tabbable=${JSON.stringify(dom.radiogroups.map((g) => g.tabbableRadios))} | overflow=${dom.overflow} console=${errors.length} hydration=${hydration.length}`,
  );
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, `${PHASE}-a11y.json`), JSON.stringify(results, null, 2));
console.log(`wrote ${join(OUT, `${PHASE}-a11y.json`)}`);
