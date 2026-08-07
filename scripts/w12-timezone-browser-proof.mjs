/**
 * W12 — browser proof that the canonical formatter is immune to the VIEWER's
 * timezone.
 *
 * Why this exists as a script rather than a unit test: the defect lives in the
 * browser. `Intl` in Node and `Intl` in Chromium are different implementations
 * reading different timezone databases, and the client bundle is the half of
 * the app the Node suite cannot reach. This runs the ACTUAL
 * `apps/web/lib/time/display.ts` source inside real Chromium, under a real
 * `timezoneId` override, at both target viewports.
 *
 * It needs no dev server, no database and no credentials, so it is runnable on
 * any checkout.
 *
 *   node scripts/w12-timezone-browser-proof.mjs
 *
 * Evidence (JSON + screenshots) lands in docs/audits/evidence/w12-timezone/.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "audits", "evidence", "w12-timezone");
const MODULE = path.join(ROOT, "apps", "web", "lib", "time", "display.ts");

// Playwright is a dependency of apps/web, not of the workspace root, so it is
// resolved from there rather than by a bare specifier.
const requireFromWeb = createRequire(path.join(ROOT, "apps", "web", "package.json"));
const { chromium } = requireFromWeb("@playwright/test");

// esbuild is a transitive dep (via tsx/vitest) and is not resolvable from
// apps/web, so resolve it out of the pnpm store explicitly.
function loadEsbuild() {
  const require = createRequire(import.meta.url);
  try {
    return require("esbuild");
  } catch {
    const hits = globSync("node_modules/.pnpm/esbuild@*/node_modules/esbuild", { cwd: ROOT });
    if (hits.length === 0) throw new Error("esbuild not found in the pnpm store");
    return require(path.join(ROOT, hits[0]));
  }
}

/** The row the whole slice is about: 23:30 UTC on the 7th. */
const LATE = "2026-08-07T23:30:00Z";
/** 00:30 UTC on the 7th — slips BACKWARD in a negative-offset zone. */
const EARLY = "2026-08-07T00:30:00Z";
/** A bare business date, the shape the planning projection passes around. */
const DATE_ONLY = "2026-08-07";

const ZONES = ["UTC", "Europe/Vilnius", "America/New_York"];
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "375x812", width: 375, height: 812 },
];
const LOCALES = ["lt", "en", "ru", "nl", "de"];

const esbuild = loadEsbuild();
const bundle = esbuild.buildSync({
  entryPoints: [MODULE],
  bundle: true,
  format: "iife",
  globalName: "W12",
  write: false,
  target: "es2020",
});
const js = bundle.outputFiles[0].text;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const timezoneId of ZONES) {
  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({
      timezoneId,
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.setContent("<!doctype html><meta charset=utf-8><body></body>");
    await page.addScriptTag({ content: js });

    const measured = await page.evaluate(
      ({ LATE, EARLY, DATE_ONLY, LOCALES }) => {
        const M = window.W12;
        const rows = {};
        for (const loc of LOCALES) {
          rows[loc] = {
            late: M.formatUtcDate(LATE, loc),
            lateDay: M.formatUtcDate(LATE, loc, { day: "numeric" }),
            early: M.formatUtcDate(EARLY, loc),
            dateOnly: M.formatUtcDate(DATE_ONLY, loc),
            dateTime: M.formatUtcDateTime(LATE, loc, {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
            dayKey: M.utcDayKey(LATE),
          };
        }
        return {
          // What the browser THINKS its zone is — proves the override is live.
          resolvedZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          offsetMinutes: new Date(LATE).getTimezoneOffset(),
          // The CONTROL: the old, ambient-zone call. This is expected to DIFFER
          // between zones. If it stops differing, the override is not working
          // and every "identical" claim below is vacuous.
          ambientDay: new Date(LATE).toLocaleDateString("en", { day: "numeric" }),
          rows,
        };
      },
      { LATE, EARLY, DATE_ONLY, LOCALES },
    );

    // Render the measurement so the screenshot shows real values, not a caption.
    await page.evaluate(
      ({ measured, timezoneId, viewport }) => {
        const esc = (s) => String(s);
        document.body.style.cssText =
          "font:14px/1.5 system-ui,sans-serif;background:#0b0e14;color:#e6e6e6;padding:16px;margin:0";
        const rows = Object.entries(measured.rows)
          .map(
            ([loc, r]) =>
              `<tr><td style="padding:3px 10px 3px 0"><b>${esc(loc)}</b></td>
               <td style="padding:3px 10px 3px 0">${esc(r.late)}</td>
               <td style="padding:3px 10px 3px 0">${esc(r.dateTime)}</td>
               <td style="padding:3px 10px 3px 0">${esc(r.dateOnly)}</td></tr>`,
          )
          .join("");
        document.body.innerHTML = `
          <h1 style="font-size:16px;margin:0 0 10px">W12 · UTC display proof</h1>
          <div style="font-size:12px;color:#9aa4b2;margin-bottom:10px">
            browser zone <b style="color:#7ee787">${esc(measured.resolvedZone)}</b> ·
            offset ${esc(measured.offsetMinutes)}min · viewport ${esc(viewport.name)}<br>
            source row <b>2026-08-07T23:30:00Z</b><br>
            ambient (old) call renders day <b style="color:#ff7b72">${esc(measured.ambientDay)}</b>
            — canonical renders day <b style="color:#7ee787">${esc(measured.rows.en.lateDay)}</b>
          </div>
          <table style="border-collapse:collapse;font-variant-numeric:tabular-nums">
            <tr style="color:#9aa4b2;font-size:12px;text-align:left">
              <th style="padding:3px 10px 3px 0">locale</th>
              <th style="padding:3px 10px 3px 0">date</th>
              <th style="padding:3px 10px 3px 0">time</th>
              <th style="padding:3px 10px 3px 0">date-only input</th>
            </tr>${rows}
          </table>`;
      },
      { measured, timezoneId, viewport },
    );

    const shot = path.join(OUT, `w12-utc-${timezoneId.replace(/\//g, "-")}-${viewport.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    results.push({ timezoneId, viewport: viewport.name, consoleErrors, ...measured });
    await ctx.close();
  }
}

await browser.close();

// ── Assertions ────────────────────────────────────────────────────────────
const fail = [];

// 1. The override is real: the ambient call must NOT agree across zones.
const ambient = new Set(results.map((r) => r.ambientDay));
if (ambient.size < 2) {
  fail.push(`CONTROL FAILED: the ambient call rendered the same day in every zone (${[...ambient]}) — the timezone override is not taking effect, so nothing below is proven`);
}

// 2. Each browser really reports the zone it was given.
for (const r of results) {
  if (r.resolvedZone !== r.timezoneId) {
    fail.push(`${r.timezoneId}: browser reported ${r.resolvedZone}`);
  }
}

// 3. The canonical output is identical across zones, per locale × viewport.
for (const loc of LOCALES) {
  for (const field of ["late", "early", "dateOnly", "dateTime", "dayKey"]) {
    const vals = new Set(results.map((r) => r.rows[loc][field]));
    if (vals.size !== 1) {
      fail.push(`${loc}.${field} differed across zones/viewports: ${[...vals].join(" | ")}`);
    }
  }
}

// 4. The day is the UTC day — the 7th — everywhere.
for (const r of results) {
  for (const loc of LOCALES) {
    const day = Number(String(r.rows[loc].lateDay).replace(/\D/g, ""));
    if (day !== 7) fail.push(`${r.timezoneId}/${r.viewport}/${loc}: day ${day}, expected 7`);
    if (r.rows[loc].dayKey !== "2026-08-07") {
      fail.push(`${r.timezoneId}/${loc}: dayKey ${r.rows[loc].dayKey}`);
    }
  }
}

// 5. Clean console.
for (const r of results) {
  if (r.consoleErrors.length) {
    fail.push(`${r.timezoneId}/${r.viewport}: console errors ${JSON.stringify(r.consoleErrors)}`);
  }
}

writeFileSync(
  path.join(OUT, "w12-timezone-proof.json"),
  JSON.stringify({ generatedFor: LATE, results, failures: fail }, null, 2),
);

for (const r of results) {
  console.log(
    `${r.timezoneId.padEnd(18)} ${r.viewport.padEnd(9)} zone=${r.resolvedZone.padEnd(18)} ` +
      `ambient-day=${r.ambientDay}  canonical(en)=${r.rows.en.late}  key=${r.rows.en.dayKey}`,
  );
}
console.log(`\nambient control rendered ${ambient.size} distinct days across zones: ${[...ambient].join(", ")}`);

if (fail.length) {
  console.error("\nFAILURES:\n" + fail.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("\nPASS — canonical output identical in every zone; ambient control differs (override live).");
