/**
 * PRODUCTION PROOF v2 — chat "Ieškau darbo" → canonical search → panel rows.
 *
 * Part A: the chat intent. Waits for the ANSWER SENTENCE itself (not a typing
 * heuristic), then reads the URL and the panel.
 * Part B: the `?result=opportunities` deep link — the panel state IS the URL,
 * so this is the restorable address the chat opens.
 */
import { chromium } from "@playwright/test";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const BASE = process.env.PROOF_BASE_URL ?? "https://labourmarket.ai";
const STATE = join(process.cwd(), "tests", "e2e", ".storage-state.prod-qa.json");
const OUT = join(process.cwd(), "..", "..", ".playwright-proofs");

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // ── Part A: the intent ────────────────────────────────────────────────────
  await page.goto(`${BASE}/lt/dashboard`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  const composer = page.locator("textarea, input[type='text']").first();
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await composer.fill("Ieškau darbo");
  await composer.press("Enter");

  await page
    .getByText(/viešų darbo skelbimų iš oficialių šaltinių/)
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(2_500);

  const partA = {
    url: page.url(),
    answerVisible: true,
    externalRowsInPanel: await page
      .getByTestId("opportunities-external-row")
      .count(),
    panelHeadings: (
      await page.locator("aside, [data-testid*='panel']").allInnerTexts()
    )
      .join(" | ")
      .slice(0, 300),
  };
  console.log(JSON.stringify({ partA }, null, 1));
  await page.screenshot({ path: join(OUT, "chat-A-answer.png") });

  // ── Part B: the deep link the chat opens ─────────────────────────────────
  await page.goto(`${BASE}/lt/dashboard?result=opportunities`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(3_000);
  const rows = page.getByTestId("opportunities-external-row");
  const rowCount = await rows.count();
  const partB: Record<string, unknown> = { url: page.url(), rowCount };
  if (rowCount > 0) {
    partB.firstRow = (await rows.first().innerText()).slice(0, 250);
    partB.originalHref = await rows
      .first()
      .getByTestId("opportunities-external-original")
      .getAttribute("href")
      .catch(() => null);
  }
  console.log(JSON.stringify({ partB }, null, 1));
  await page.screenshot({ path: join(OUT, "chat-B-deeplink.png") });

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
});
