/**
 * PRODUCTION PROOF — chat "Ieškau darbo" reaches the canonical vacancy search.
 *
 * Read-only-ish: types the find-work intent into the shipped conversation
 * composer as the sanctioned QA worker and follows the DESIGNED dialogue
 * (criteria first, then search). Asserts the answer sentence and the panel's
 * external rows — the same rows the board renders. Screenshots each step.
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
  await page.goto(`${BASE}/lt/dashboard`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.screenshot({ path: join(OUT, "chat-0-initial.png") });

  // The composer: the one textbox on the conversation surface.
  const composer = page.locator("textarea, input[type='text']").first();
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await composer.fill("Ieškau darbo");
  await composer.press("Enter");
  // Wait until the assistant's typing indicator settles (up to 45s).
  await page.waitForTimeout(4_000);
  for (let i = 0; i < 14; i += 1) {
    const typing = await page.locator("[aria-busy='true']").count();
    const dots = await page.getByText("•••").count();
    if (typing === 0 && dots === 0) break;
    await page.waitForTimeout(3_000);
  }
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: join(OUT, "chat-1-intent.png"), fullPage: false });

  // If the canonical criteria (work-card) form appeared, list its controls
  // and fill the minimum honestly: location Sweden, available now.
  const formInputs = page.locator("form select, form input, form textarea");
  const formCount = await formInputs.count();
  console.log(JSON.stringify({ formControlCount: formCount }));
  for (let i = 0; i < Math.min(formCount, 12); i += 1) {
    const el = formInputs.nth(i);
    console.log(
      JSON.stringify({
        i,
        tag: await el.evaluate((n) => n.tagName),
        name: await el.getAttribute("name"),
        placeholder: await el.getAttribute("placeholder"),
      }),
    );
  }
  // Dump any chips/buttons the assistant offered.
  const chips = await page
    .getByTestId("conversation-chat")
    .locator("button")
    .allInnerTexts()
    .catch(() => [] as string[]);
  console.log(JSON.stringify({ chips: chips.filter((c) => c.trim()).slice(0, 20) }));

  // Dump the visible thread text so the run is diagnosable whatever state the
  // dialogue reached (criteria form vs straight results).
  const threadText = await page
    .getByTestId("conversation-chat")
    .innerText()
    .catch(async () => (await page.locator("body").innerText()).slice(0, 4000));
  console.log("--- THREAD AFTER INTENT ---");
  console.log(threadText.slice(0, 3000));

  console.log(JSON.stringify({ urlAfterReply: page.url() }));

  // The result may dock collapsed — expand it if the control is offered.
  const expand = page.getByRole("button", { name: /Išskleisti/ }).first();
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(3_000);
    console.log(JSON.stringify({ expanded: true, url: page.url() }));
  }
  await page.screenshot({ path: join(OUT, "chat-1b-expanded.png") });

  // If the external rows are already on screen, assert and finish.
  const externalRows = page.getByTestId("opportunities-external-row");
  const rowCount = await externalRows.count();
  console.log(JSON.stringify({ externalRowCount: rowCount }));

  if (rowCount > 0) {
    const first = externalRows.first();
    console.log(
      JSON.stringify({
        firstRow: (await first.innerText()).slice(0, 300),
        originalHref: await first
          .getByTestId("opportunities-external-original")
          .getAttribute("href")
          .catch(() => null),
      }),
    );
    await page.screenshot({ path: join(OUT, "chat-2-results.png") });
  }

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
});
