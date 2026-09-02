import { test, expect } from "@playwright/test";

/**
 * Auth flow e2e (slice 6). Each spec checks `SUPABASE_TEST_URL` up front
 * and skips if it isn't configured — keeps `pnpm e2e` green until the
 * founder has stood up a separate test Supabase project. See
 * docs/TESTING.md for setup.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const requiresTestEnv = (): void => {
  test.skip(
    !HAS_TEST_SUPABASE,
    "SUPABASE_TEST_URL not configured — see docs/TESTING.md",
  );
};

/**
 * RE-ANCHORED 2026-08-31 (journey-E2E truth pass). These three tests were
 * written for the RETIRED magic-link flow ("Siųsti prisijungimo nuorodą") and
 * had been failing against the real product — password + Google, role chosen
 * in onboarding — while the smoke suite below correctly asserted the current
 * surface. They now exercise the REAL current journey: signup with
 * email+password lands the new user in onboarding (local stack has
 * "Confirm email" OFF, so signUp returns a live session), the role choice
 * (worker AND company) lives on the onboarding step, and an existing user
 * logs in with a password.
 *
 * Retirement verified before this re-anchor (not assumed): zero
 * `signInWithOtp`/magic-link calls exist in app/components/lib; no OTP block
 * in supabase/config.toml; the sole surviving "prisijungimo nuoroda" copy is
 * `auth.callback.verifying` — the PKCE callback page serving Google OAuth and
 * password-reset redirects, not a login-link offer. Owner ruling 2026-07-29
 * (P0) fixed sign-in to exactly two methods (same-tab Google PKCE +
 * email/password). Password-RESET links are a separate, still-supported
 * capability and keep their own tests below (`?reset=1` pair). Coverage was
 * replaced (dead flow → real journey), never reduced.
 */
const E2E_PASSWORD = "E2ePass!23x";

test.describe("Signup → password → onboarding", () => {
  test("signup with email+password lands the NEW user in onboarding", async ({
    page,
  }) => {
    requiresTestEnv();
    const email = `e2e.signup.${Date.now()}@local.test`;
    await page.goto("/lt/auth/signup");
    await expect(
      page.getByRole("heading", { name: /Sukurkite paskyrą/i }),
    ).toBeVisible();
    await page.locator('input[type="email"]').fill(email);
    // Structural selectors: the password label's accessible name carries the
    // inline help text, so an anchored label regex cannot match it.
    await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Registruotis|Sign up/i }).click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  });

  test("onboarding offers BOTH the worker and the company role", async ({
    page,
  }) => {
    requiresTestEnv();
    // The role choice moved from the signup form into onboarding — the
    // company path must still exist there (the old test's real intent).
    const email = `e2e.roles.${Date.now()}@local.test`;
    await page.goto("/lt/auth/signup");
    await page.locator('input[type="email"]').fill(email);
    // Structural selectors: the password label's accessible name carries the
    // inline help text, so an anchored label regex cannot match it.
    await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Registruotis|Sign up/i }).click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    // The REAL card copy (onboarding.rolePicker): person = "Asmuo",
    // organization = "Įmonė" — both paths must be offered.
    await expect(
      page.getByRole("button", { name: /Asmuo|Person/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /Įmonė|Company/i }),
    ).toBeVisible();
  });
});

test.describe("Existing user login", () => {
  test("an existing user logs in with a password and reaches the app", async ({
    page,
  }) => {
    requiresTestEnv();
    // Create the "existing" user through the REAL signup (local stack only —
    // requiresTestEnv gates this), then sign out cookie-free by using a fresh
    // context-free navigation: the login form must authenticate on its own.
    const email = `e2e.login.${Date.now()}@local.test`;
    await page.goto("/lt/auth/signup");
    await page.locator('input[type="email"]').fill(email);
    // Structural selectors: the password label's accessible name carries the
    // inline help text, so an anchored label regex cannot match it.
    await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Registruotis|Sign up/i }).click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

    await page.context().clearCookies();
    await page.goto("/lt/auth/login");
    await expect(
      page.getByRole("heading", { name: /Prisijungti|Sign in/i }),
    ).toBeVisible();
    await page.getByLabel(/El\. paštas|Email/i).fill(email);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page
      .getByRole("button", { name: /^(Prisijungti|Sign in)$/i })
      .click();
    // A real session lands on an authenticated surface (onboarding for a
    // not-yet-onboarded account, dashboard otherwise) — never back on login.
    await expect(page).toHaveURL(/\/(onboarding|dashboard)/, {
      timeout: 30_000,
    });
  });
});

test.describe("Auth smoke — protected routes + login surface (no test DB needed)", () => {
  // These run WITHOUT SUPABASE_TEST_URL: they assert the middleware/login
  // surface contract that the login P0 fix locks in. No real session needed.

  for (const path of [
    "/lt/dashboard",
    "/lt/dashboard/market-map",
    "/lt/dashboard/communication",
    "/lt/dashboard/profile",
  ]) {
    test(`anonymous ${path} redirects to /auth/login with a next param`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/lt\/auth\/login\?.*next=/);
    });
  }

  test("login page renders Google + email/password (both methods live)", async ({
    page,
  }) => {
    await page.goto("/lt/auth/login");
    await expect(
      page.getByRole("heading", { name: /Prisijungti|Sign in/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Google/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/El\. paštas|Email/i)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("signup page renders the Google + email/password form", async ({
    page,
  }) => {
    await page.goto("/lt/auth/signup");
    await expect(
      page.getByRole("button", { name: /Google/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/El\. paštas|Email/i)).toBeVisible();
  });

  test("a protected route preserves its return path through to login", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/market-map");
    await expect(page).toHaveURL(/next=%2Flt%2Fdashboard%2Fmarket-map/);
  });

  // `reset-password` lands the user here with `?reset=1` once the new password
  // has saved. For a long time nothing read it, so the confirmation the person
  // most needs — "yes, that worked" — was never shown. Asserted in a browser
  // because a source guard cannot tell a rendered notice from a dead branch.
  test("?reset=1 confirms the new password saved", async ({ page }) => {
    await page.goto("/lt/auth/login?reset=1");
    await expect(page.getByTestId("login-reset-success")).toBeVisible();
  });

  test("a plain login has no reset confirmation to be confused by", async ({
    page,
  }) => {
    await page.goto("/lt/auth/login");
    await expect(page.locator("form").first()).toBeVisible();
    await expect(page.getByTestId("login-reset-success")).toHaveCount(0);
  });
});

test.describe("Onboarding entity creation (migration 0006)", () => {
  // No SUPABASE_TEST_URL needed: anonymous visit to /onboarding must
  // bounce to /auth/login because the page itself checks auth.getUser().
  test("anonymous /onboarding redirects to /auth/login", async ({ page }) => {
    await page.goto("/lt/onboarding");
    await expect(page).toHaveURL(/\/lt\/auth\/login/);
  });

  test("worker onboarding creates a workers row + profile_roles entry", async () => {
    requiresTestEnv();
    test.skip(
      true,
      "Requires authenticated test session + DB introspection. Wire when SUPABASE_TEST_URL is provisioned (M1.x). Asserts: profiles.active_role='worker', profiles.onboarded_at IS NOT NULL, workers.profile_id = user.id (exactly one row), profile_roles entry with role='worker' and role_data containing profession/language/city.",
    );
  });

  test("worker onboarding with profession creates worker_professions primary row", async () => {
    requiresTestEnv();
    test.skip(
      true,
      "Requires authenticated test session + DB introspection (migration 0008). Wire when SUPABASE_TEST_URL is provisioned. Asserts: worker_professions row exists with worker_id matching workers.id (via profile_id), profession_id matching the chosen seed slug (e.g. 'carpenter'), is_primary=true. Re-running with the same profession_id is a no-op; re-running with a different profession_id inserts is_primary=false (partial unique index 'worker_professions_one_primary' protects the primary).",
    );
  });

  test("worker adds the company role from the switcher (creates companies row)", async () => {
    requiresTestEnv();
    test.skip(
      true,
      "Requires authenticated test session + DB introspection. Wire when SUPABASE_TEST_URL is provisioned (M1.x). Asserts: addRole('company') leaves exactly one row in companies WHERE profile_id = user.id, profile_roles entry with role='company' and is_active=true, profiles.active_role='company'. Re-invoking is a no-op (still exactly one companies row).",
    );
  });
});

test.describe("Logout", () => {
  test("logout clears session and returns to the locale home", async () => {
    requiresTestEnv();
    test.skip(true, "Requires authenticated session — wire after test project is configured (M1.x).");
  });
});
