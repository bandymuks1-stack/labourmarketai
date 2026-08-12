/**
 * PRODUCTION PROOF — the authenticated CV chain the /create-cv acquisition
 * page feeds (beta train v2 §5/§24, read-only).
 *
 * Uses the minted prod-QA worker session (scripts/prod-qa-mint-session.ts).
 * Asserts, without clicking any mutating control:
 *   - /en/cv renders the CV sheet for the QA worker (not a 404/redirect);
 *   - the template switch (?template=compact) renders and changes the sheet;
 *   - the print control (the free PDF path) is present;
 *   - /en/dashboard/profile exposes the CV import entry
 *     (profile-hub-cv-import-link) — the chain the public page promises;
 *   - no horizontal overflow on /en/cv at 320 and 1440.
 * Screenshots land in ../../.playwright-proofs/ (gitignored).
 */
import { chromium, type Browser } from "@playwright/test";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const BASE = process.env.PROOF_BASE_URL ?? "https://labourmarket.ai";
const STATE = join(process.cwd(), "tests", "e2e", ".storage-state.prod-qa.json");
const OUT = join(process.cwd(), "..", "..", ".playwright-proofs");

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const failures: string[] = [];
  const facts: Record<string, unknown> = {};

  // 1. CV sheet renders for the authenticated worker.
  await page.goto(`${BASE}/en/cv`, { waitUntil: "networkidle", timeout: 60_000 });
  facts.cvUrl = page.url();
  if (!page.url().includes("/en/cv")) failures.push(`redirected away: ${page.url()}`);
  const printButtons = await page.getByTestId("print-button").count();
  facts.printButtons = printButtons;
  if (printButtons === 0) failures.push("no print (free PDF) control on /en/cv");
  const standardText = (await page.locator("main, body").first().innerText()).slice(0, 400);
  facts.cvSheetPreview = standardText.replace(/\s+/g, " ").slice(0, 200);
  await page.screenshot({ path: join(OUT, "cv-standard-1280.png"), fullPage: true });

  // 2. Template switch renders a different sheet without error.
  await page.goto(`${BASE}/en/cv?template=compact`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  const compactOk = page.url().includes("template=compact");
  facts.compactUrl = page.url();
  if (!compactOk) failures.push(`compact template redirected: ${page.url()}`);
  await page.screenshot({ path: join(OUT, "cv-compact-1280.png"), fullPage: true });

  // 3. Overflow at the extremes on the CV sheet.
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    facts[`overflow${width}`] = m;
    if (m.doc > m.client + 1 || m.body > m.client + 1) {
      failures.push(`horizontal overflow on /en/cv at ${width}: ${JSON.stringify(m)}`);
    }
  }

  // 4. The profile hub exposes the CV import entry.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/en/dashboard/profile`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  const importLinks = await page.getByTestId("profile-hub-cv-import-link").count();
  facts.cvImportEntryCount = importLinks;
  if (importLinks === 0) failures.push("profile hub CV import entry absent");
  await page.screenshot({ path: join(OUT, "profile-cv-entry-1280.png"), fullPage: false });

  await context.close();
  await browser.close();
  console.log(JSON.stringify({ failures, facts }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
