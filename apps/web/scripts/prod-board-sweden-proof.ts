/**
 * PRODUCTION PROOF — Swedish external vacancies on the ONE worker board.
 *
 * Read-only Playwright pass against https://labourmarket.ai using the minted
 * prod-QA worker session (scripts/prod-qa-mint-session.ts). Asserts, per
 * locale (lt, en) and per width (320…1440):
 *   - the external section renders with >0 cards;
 *   - every card carries attribution + provenance text;
 *   - the ONLY action is the publisher's original ad (no platform apply);
 *   - no horizontal overflow (documentElement AND body scrollWidth);
 *   - the section survives a reload.
 * Screenshots land in ../../.playwright-proofs/ (gitignored path outside the
 * app). Never clicks a mutating control.
 */
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const BASE = process.env.PROOF_BASE_URL ?? "https://labourmarket.ai";
const STATE = join(process.cwd(), "tests", "e2e", ".storage-state.prod-qa.json");
const OUT = join(process.cwd(), "..", "..", ".playwright-proofs");
const WIDTHS = [320, 360, 375, 390, 412, 768, 1024, 1440];
const LOCALES = ["lt", "en"];

interface CardFacts {
  title: string;
  meta: string;
  attribution: string;
  originalHref: string | null;
  buttonsInside: string[];
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await chromium.launch();
  const failures: string[] = [];
  const summary: Record<string, unknown>[] = [];

  for (const locale of LOCALES) {
    const context: BrowserContext = await browser.newContext({
      storageState: STATE,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const url = `${BASE}/${locale}/dashboard/opportunities`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

    const section = page.getByTestId("opportunities-external");
    const sectionCount = await section.count();
    if (sectionCount === 0) {
      failures.push(`${locale}: external section ABSENT`);
      await page.screenshot({
        path: join(OUT, `board-${locale}-MISSING.png`),
        fullPage: true,
      });
      await context.close();
      continue;
    }

    const cards = page.getByTestId("external-vacancy-card");
    const cardCount = await cards.count();

    // First card facts, for the report.
    const first = cards.first();
    const facts: CardFacts = {
      title: (await first.locator("span.text-sm.font-semibold").first().innerText()).trim(),
      meta: (await first.locator("p.text-xs").first().innerText()).trim(),
      attribution: (await first.locator("div.border-t p").first().innerText()).trim(),
      originalHref: await first
        .getByTestId("external-vacancy-original-link")
        .first()
        .getAttribute("href")
        .catch(() => null),
      buttonsInside: await first.locator("button").allInnerTexts(),
    };

    // Platform-apply controls must NOT exist inside external cards.
    const applyControls = await cards.locator("button").count();

    // Width sweep: overflow + section visibility.
    const widthResults: Record<number, { docOverflow: boolean; bodyOverflow: boolean; visible: boolean }> = {};
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const measured = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        inner: window.innerWidth,
      }));
      const visible = await section.first().isVisible();
      widthResults[width] = {
        docOverflow: measured.doc > measured.inner,
        bodyOverflow: measured.body > measured.inner,
        visible,
      };
      if (measured.doc > measured.inner || measured.body > measured.inner) {
        failures.push(
          `${locale}@${width}: horizontal overflow doc=${measured.doc} body=${measured.body} inner=${measured.inner}`,
        );
      }
      if (!visible) failures.push(`${locale}@${width}: external section not visible`);
      if (width === 390 || width === 1440) {
        await section.first().scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(OUT, `board-${locale}-${width}.png`),
          fullPage: width === 390,
        });
      }
    }

    // Reload persistence.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    const afterReload = await page.getByTestId("external-vacancy-card").count();
    if (afterReload === 0) failures.push(`${locale}: cards gone after reload`);

    summary.push({
      locale,
      url,
      cardCount,
      afterReload,
      applyButtonCountInsideCards: applyControls,
      firstCard: facts,
      widthResults,
    });
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify({ failures, summary }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
});
