import { test, expect } from "@playwright/test";

/**
 * S3.5 — One-Tap Confirm + Verified CV export e2e. Convention follows
 * journal.spec.ts: unauthenticated access-control smokes run unconditionally;
 * DB-dependent flows are gated on SUPABASE_TEST_URL and documented until the
 * test Supabase project exists (docs/TESTING.md).
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const requiresTestEnv = (): void => {
  test.skip(
    !HAS_TEST_SUPABASE,
    "SUPABASE_TEST_URL not configured — see docs/TESTING.md",
  );
};

test.describe("S3.5 — access control (mobile viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("anonymous /dashboard/inbox/quick redirects to /auth/login", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/inbox/quick");
    await expect(page).toHaveURL(/\/lt\/auth\/login/);
  });

  test("anonymous /cv redirects to /auth/login", async ({ page }) => {
    await page.goto("/lt/cv");
    await expect(page).toHaveURL(/\/lt\/auth\/login/);
  });

  test("anonymous /en/cv redirects to /en/auth/login (locale kept)", async ({
    page,
  }) => {
    await page.goto("/en/cv");
    await expect(page).toHaveURL(/\/en\/auth\/login/);
  });
});

test.describe("S3.5 — one-tap confirm timing + batch + CV print", () => {
  test("manager one-tap confirm completes in ≤10s; batch summarises; CV prints", async () => {
    requiresTestEnv();
    test.skip(
      true,
      [
        "Requires authenticated manager + worker test sessions sharing an org with journal_review_enabled and pending entries. Wire when SUPABASE_TEST_URL is provisioned.",
        "Steps & assertions:",
        "1. As manager on a phone viewport, open /lt/dashboard/inbox/quick; cards list worker, date, entry text, recognized works and the EXPLICIT will-confirm skill chips (quick-will-confirm-<id>); no checkboxes anywhere.",
        "2. Start a timer, tap quick-confirm-tap-<id>, await quick-confirmed-<id>. Assert elapsed ≤ 10s (the S3.5 budget) and a journal_entry_confirmations row with confirmation_scope.action='confirm' + the listed skills flipped verified=true.",
        "3. With ≥2 entries created today, tap quick-batch-open; the dialog lists every entry (worker, date, skills) BEFORE quick-batch-confirm. Confirm once; assert per-entry confirmation rows and the batchDone counts match.",
        "4. Reject path: tap quick-reject-open-<id>, submit without a note → blocked (required); with a short reason → quick-rejected-<id>, confirmation row action='reject', NO skill flips.",
        "5. As the worker, open /lt/cv. Assert: confirmed skills render under 'Patvirtinta vadovo' ONLY for verified=true rows; self-declared under 'Paties nurodyta'; proof table shows date/project/role with NO confirmer name; footer has the generation date + the platform-check line and no public URL.",
        "6. page.pdf() (print emulation) succeeds for /lt/cv and /en/cv — the browser-print export path.",
      ].join("\n"),
    );
  });
});
