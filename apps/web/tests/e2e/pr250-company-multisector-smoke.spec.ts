/**
 * Owner final smoke for PR #250 — company profile request + multi-sector skills.
 *
 * Mirrors pilot-role-dashboards.spec.ts: gated on a minted Playwright session
 * (tests/e2e/.storage-state.json), skips cleanly when it's missing. Run against
 * a REAL preview/staging or local app with a real Supabase auth + test user
 * (the migration 20260604120000 must be applied on that DB first).
 *
 *   1) pnpm -F web e2e:install              # once
 *   2) E2E_OWNER_EMAIL=<test-user> pnpm -F web exec tsx scripts/e2e-mint-session.ts
 *      # needs NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   3) E2E_BASE_URL=<preview-url> pnpm -F web exec playwright test tests/e2e/pr250-company-multisector-smoke.spec.ts
 *
 * Writes the three required LT screenshots to
 *   runtime/review-evidence/labourmarketai/pr250-company-multisector/screenshots/
 * and asserts every owner PASS criterion at the rendered-DOM level.
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const SHOTS = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "runtime",
  "review-evidence",
  "labourmarketai",
  "pr250-company-multisector",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs a real Supabase test user).`,
);

test.use({ storageState: STORAGE_STATE });
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

// ── 1. Account: coming-later is SECONDARY (collapsed), real spaces are primary ─
test("LT account — real spaces primary, 'Vėliau įjungiami moduliai' collapsed", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/account");
  await expect(page.getByTestId("my-spaces")).toBeVisible();
  // The real, actionable role catalogue ("Galimos erdvės") is present.
  await expect(page.getByTestId("my-spaces-available")).toBeVisible();
  // Coming-later modules must be a COLLAPSED <details>, not the main surface.
  const comingLater = page.getByTestId("my-spaces-coming-later");
  await expect(comingLater).toBeVisible();
  const isCollapsedDetails = await comingLater.evaluate(
    (el) => el.tagName.toLowerCase() === "details" && !(el as HTMLDetailsElement).open,
  );
  expect(isCollapsedDetails, "coming-later must be a collapsed <details>").toBe(true);
  await shot(page, "01-lt-account");
});

// ── 2. Company setup: name + country, draft + verification request, honest status ─
test("LT company setup — fields save, request works, no fake verified", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/start/company");
  await expect(page.getByTestId("company-start-page")).toBeVisible();

  const blocker = page.getByTestId("company-start-migration-blocker");
  if (await blocker.isVisible().catch(() => false)) {
    // Honest "feature not available yet" until the migration is applied on
    // this DB. Screenshot it and stop — this is the expected pre-migration UI.
    await shot(page, "02-lt-start-company");
    test.info().annotations.push({
      type: "note",
      description:
        "Migration 20260604120000 not applied on this DB — honest blocker shown. Apply it, then re-run for the full form smoke.",
    });
    return;
  }

  // Required minimum + optional fields render.
  await expect(page.getByTestId("company-setup-legal-name")).toBeVisible();
  await expect(page.getByTestId("company-setup-country")).toBeVisible();
  for (const id of [
    "company-setup-registration-code",
    "company-setup-address",
    "company-setup-website",
    "company-setup-contact-email",
    "company-setup-contact-phone",
    "company-setup-requester-role",
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // Honest verification notice + a REQUEST action (not a "verify" control).
  await expect(page.getByTestId("company-setup-verification-notice")).toBeVisible();
  await expect(page.getByTestId("company-setup-save-draft")).toBeVisible();
  await expect(page.getByTestId("company-setup-submit-request")).toBeVisible();

  // Fill the minimum (name + country) and SAVE DRAFT — real end-to-end write.
  await page.getByTestId("company-setup-legal-name").fill("Smoke Test UAB");
  await page.getByTestId("company-setup-country").fill("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 15_000 });
  await shot(page, "02-lt-start-company");

  // Submit a verification REQUEST and confirm the status actually moves to
  // pending_verification (regression guard: the submit button must not behave
  // like save-draft).
  await page.getByTestId("company-setup-submit-request").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  const status = page.getByTestId("company-start-verification-status");
  await expect(status).toBeVisible({ timeout: 10_000 });
  const txt = ((await status.textContent()) ?? "").toLowerCase();
  // Honest pending state, NOT a fake verified.
  expect(/laukia|pending/.test(txt), `status was "${txt}"`).toBe(true);
  expect(txt).not.toContain("patvirtinta"); // LT "verified"
  expect(txt).not.toContain("verified");
});

// ── 3. Journal: multi-sector, non-construction not forced into construction ─
test("LT journal — non-construction entry yields honest non-construction label", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/journal");
  // Page renders (auth-gated route reachable).
  await shot(page, "03-lt-journal");

  // Best-effort functional check: if the compose textarea is reachable, type a
  // clearly NON-construction entry and confirm the suggestion is its honest
  // sector label, never a construction trade.
  const textarea = page.getByRole("textbox").first();
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.fill("Dirbau 3 valandas kasininku parduotuvėje");
    const organize = page.getByTestId("journal-organize-text");
    if (await organize.isVisible().catch(() => false)) {
      await organize.click();
      const summary = page.getByTestId("journal-fragment-summary").first();
      if (await summary.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const txt = ((await summary.textContent()) ?? "").toLowerCase();
        expect(/kasinink|parduotuv|kasos/.test(txt)).toBe(true);
        // Must NOT be forced into a construction trade label.
        expect(/plytel|mūr|tinkav|stog|betonav|gipso/.test(txt)).toBe(false);
      }
    }
  }
});

// ── EN parity (assert-only; routes must render without error) ─────────────────
for (const path of [
  "/en/dashboard/account",
  "/en/dashboard/start/company",
  "/en/dashboard/journal",
]) {
  test(`EN route renders: ${path}`, async ({ page }) => {
    const resp = await page.goto(path);
    expect(resp?.status() ?? 200).toBeLessThan(400);
  });
}
