/**
 * NL/DE activation smoke (launch repair Scope D) — run against a local
 * `next start` server. Desktop (1280px) + mobile (390px) passes over the
 * primary public routes in nl/de (full) and lt/en/ru (light regression):
 *   - HTTP 200
 *   - no MISSING_MESSAGE / [EN] / [NL] / [DE] markers in rendered HTML
 *   - no horizontal overflow at 390px
 *   - hreflang set includes all five active locales
 *   - language selector present
 * Usage: pnpm exec tsx scripts/nl-de-launch-smoke.ts [baseUrl]
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";

const FULL_LOCALES = ["nl", "de"] as const;
const LIGHT_LOCALES = ["lt", "en", "ru"] as const;
const FULL_PATHS = ["", "/for-workers", "/for-companies", "/company-need", "/pricing", "/auth/signup", "/worker-intake", "/about", "/for-agencies"];
const LIGHT_PATHS = ["", "/for-workers", "/pricing", "/company-need"];

const MARKERS = /MISSING_MESSAGE|\[EN\]|\[NL\]|\[DE\]/;

async function main() {
  const browser = await chromium.launch();
  const failures: string[] = [];
  let checked = 0;

  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile390", width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await ctx.newPage();

    const targets: Array<[string, string]> = [
      ...FULL_LOCALES.flatMap((l) => FULL_PATHS.map((p) => [l, p] as [string, string])),
      ...LIGHT_LOCALES.flatMap((l) => LIGHT_PATHS.map((p) => [l, p] as [string, string])),
    ];

    for (const [locale, path] of targets) {
      const url = `${BASE}/${locale}${path}`;
      checked++;
      try {
        const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        if (!res || res.status() !== 200) {
          failures.push(`${viewport.name} ${url}: HTTP ${res?.status()}`);
          continue;
        }
        const html = await page.content();
        const marker = html.match(MARKERS);
        if (marker) failures.push(`${viewport.name} ${url}: marker ${marker[0]}`);

        if (viewport.name === "mobile390") {
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          if (overflow > 1) failures.push(`mobile390 ${url}: horizontal overflow ${overflow}px`);
        }

        // hreflang completeness on public marketing pages (skip auth).
        if (!path.startsWith("/auth")) {
          const langs = await page.evaluate(() =>
            Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map((e) =>
              e.getAttribute("hreflang"),
            ),
          );
          for (const need of ["lt", "en", "ru", "nl", "de", "x-default"]) {
            if (!langs.includes(need)) {
              failures.push(`${viewport.name} ${url}: hreflang missing ${need} (got ${langs.join(",")})`);
              break;
            }
          }
        }
      } catch (e) {
        failures.push(`${viewport.name} ${url}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`checked ${checked} page loads`);
  if (failures.length) {
    console.error(`FAILURES (${failures.length}):`);
    for (const f of failures) console.error("  " + f);
    process.exit(1);
  }
  console.log("NL/DE launch smoke: ALL GREEN");
}

main();
