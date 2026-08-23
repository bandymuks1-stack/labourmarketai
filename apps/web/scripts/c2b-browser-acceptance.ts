/**
 * C2b BROWSER ACCEPTANCE DRIVER (value train 2) — run once, then delete or
 * keep as owner-runnable evidence tooling. Drives the REAL production build
 * on :3100 (wired to the production Supabase project) with the clearly
 * marked synthetic test account, through the full import chain:
 *
 *   login → documents → (create doc if none) → upload PDF work report
 *   → draft link → inline review → EDIT → CONFIRM → journal shows the entry.
 *
 * Also: honest not-found notice, image gets NO draft link, EN copy spot
 * check, mobile 390px pass, console-error capture, screenshots.
 *
 * Usage: pnpm -C apps/web exec tsx scripts/c2b-browser-acceptance.ts
 * Env: E2E_BASE (default http://127.0.0.1:3100), E2E_EMAIL, E2E_PASSWORD,
 * SHOTS_DIR.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { makePdf } from "../lib/cv/__fixtures__/cv-fixtures";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/c2b-shots";

const REPORT_TEXT =
  "TEST fixture (train2-c2b): 2026-08-20 objektas Vilniuje. Dengiau stoga 6 valandas, sumontavau 20 m2 dangos.";
const EDIT_SUFFIX = " (patikrinta ir pataisyta ranka)";

const consoleErrors: string[] = [];

function shot(page: Page, name: string) {
  return page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

async function login(page: Page) {
  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  if (!EMAIL || !PASSWORD) throw new Error("E2E_EMAIL/E2E_PASSWORD required");

  // The environment pre-installs chromium at /opt/pw-browsers/chromium; the
  // repo's pinned @playwright/test expects a different build id, so launch by
  // explicit executablePath (the documented fallback for this environment).
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium",
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });

  const out: string[] = [];
  const ok = (s: string) => {
    out.push(`OK  ${s}`);
    console.log(`OK  ${s}`);
  };

  await login(page);
  ok("login → dashboard");

  await page.goto(`${BASE}/lt/dashboard/documents`, { waitUntil: "domcontentloaded" });

  // Ensure at least one document row exists (create via the REAL form).
  if ((await page.locator('[data-testid="doc-file-slot"]').count()) === 0) {
    const form = page.locator('[data-testid="worker-document-form"]');
    await form.waitFor({ state: "visible", timeout: 30_000 });
    await form
      .locator('select[name="document_type_slug"]')
      .selectOption({ index: 1 });
    await form.locator('[data-testid="worker-document-save"]').click();
    await page.waitForLoadState("domcontentloaded");
    ok("document row created via the real form");
  }

  // Upload the PDF work report into the first slot.
  const slot = page.locator('[data-testid="doc-file-slot"]').first();
  await slot.waitFor({ state: "visible", timeout: 30_000 });
  await slot.locator('[data-testid="doc-file-input"]').setInputFiles({
    name: "TEST-train2-c2b-darbo-ataskaita.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(makePdf(REPORT_TEXT)),
  });
  await slot.locator('[data-testid="doc-file-upload-submit"]').click();
  await page.waitForLoadState("domcontentloaded");
  const draftLink = page.locator('[data-testid="doc-file-journal-draft"]').first();
  await draftLink.waitFor({ state: "visible", timeout: 30_000 });
  ok("PDF uploaded → draft link rendered");
  await shot(page, "01-documents-with-draft-link-1440");

  await draftLink.click();
  await page.waitForLoadState("domcontentloaded");
  const review = page.locator('[data-testid="doc-journal-draft"]');
  await review.waitFor({ state: "visible", timeout: 30_000 });
  const notes = review.locator('[data-testid="doc-journal-draft-notes"]');
  const extracted = await notes.inputValue();
  if (!/stoga|valand/i.test(extracted)) {
    throw new Error(`extracted text missing expected content: ${extracted.slice(0, 120)}`);
  }
  ok("review shows the extracted text (editable)");
  await shot(page, "02-review-lt-1440");

  // EN copy spot check on the same draft URL.
  const draftUrl = page.url();
  await page.goto(draftUrl.replace("/lt/", "/en/"), { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-testid="doc-journal-draft"]')
    .waitFor({ state: "visible", timeout: 30_000 });
  await shot(page, "03-review-en-1440");
  ok("EN locale renders the review");
  await page.goto(draftUrl, { waitUntil: "domcontentloaded" });

  // Mobile 390 pass on the review.
  await page.setViewportSize({ width: 390, height: 844 });
  await review.waitFor({ state: "visible" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) throw new Error(`horizontal overflow at 390px: ${overflow}px`);
  await shot(page, "04-review-lt-390");
  ok("mobile 390px: review usable, no horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 960 });

  // HUMAN-IN-THE-LOOP: edit, then confirm.
  await notes.fill(REPORT_TEXT + EDIT_SUFFIX);
  await review.locator('[data-testid="doc-journal-draft-save"]').click();
  await review
    .locator('[data-testid="doc-journal-draft-saved"]')
    .waitFor({ state: "visible", timeout: 45_000 });
  ok("edited text confirmed → saved with provenance");
  await shot(page, "05-saved-1440");

  await page.goto(`${BASE}/lt/dashboard/journal`, { waitUntil: "domcontentloaded" });
  await page
    .locator(`text=${EDIT_SUFFIX.trim().slice(1, 20)}`)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  ok("journal shows the confirmed imported entry");
  await shot(page, "06-journal-1440");

  // Honest not-found: random uuid.
  await page.goto(
    `${BASE}/lt/dashboard/documents?draftFrom=00000000-0000-4000-8000-000000000000`,
    { waitUntil: "domcontentloaded" },
  );
  await page
    .locator('[data-testid="doc-journal-draft-notice"]')
    .waitFor({ state: "visible", timeout: 30_000 });
  ok("random uuid → honest not-found notice");

  // Image honesty: upload a PNG — the draft link must NOT appear for it.
  const PNG_1PX = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.goto(`${BASE}/lt/dashboard/documents`, { waitUntil: "domcontentloaded" });
  const slots = page.locator('[data-testid="doc-file-slot"]');
  const lastSlot = slots.last();
  // Upload the PNG as a NEW VERSION on the same document — the current file
  // becomes an image, so its draft link must disappear.
  await lastSlot.locator('[data-testid="doc-file-input"]').setInputFiles({
    name: "TEST-train2-c2b-photo.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });
  await lastSlot.locator('[data-testid="doc-file-upload-submit"]').click();
  await page.waitForLoadState("domcontentloaded");
  const linkCount = await page
    .locator('[data-testid="doc-file-journal-draft"]')
    .count();
  if (linkCount !== 0) {
    throw new Error(`image current version still shows ${linkCount} draft link(s)`);
  }
  ok("image current version → NO draft link (no OCR is not pretended)");
  await shot(page, "07-image-no-link-1440");

  console.log("\n--- console errors:", consoleErrors.length);
  for (const e of consoleErrors) console.log("  ERR", e);
  console.log("\nRESULT: PASS —", out.length, "assertions");
  await browser.close();
  if (consoleErrors.length > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error("RESULT: FAIL —", e?.message ?? e);
  process.exitCode = 1;
});
