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

test.describe("Signup → magic link → onboarding → dashboard", () => {
  test("worker signup lands on a 'check your email' state", async ({
    page,
  }) => {
    requiresTestEnv();
    await page.goto("/lt/auth/signup");
    await expect(
      page.getByRole("heading", { name: /Sukurkite paskyrą/i }),
    ).toBeVisible();
    await page.getByLabel(/El\. paštas|Email/i).fill("worker.e2e@local.test");
    await page.getByRole("button", { name: /Darbuotojas|Worker/i }).click();
    await page.getByRole("button", { name: /Siųsti prisijungimo nuorodą|Send login link/i }).click();
    await expect(page.getByText(/Patikrinkite el\. paštą|Check your email/i)).toBeVisible();
  });

  test("company signup uses the company role card", async ({ page }) => {
    requiresTestEnv();
    await page.goto("/lt/auth/signup");
    await page.getByLabel(/El\. paštas|Email/i).fill("company.e2e@local.test");
    await page.getByRole("button", { name: /Įmonė|Company/i }).click();
    await page.getByRole("button", { name: /Siųsti prisijungimo nuorodą|Send login link/i }).click();
    await expect(page.getByText(/Patikrinkite el\. paštą|Check your email/i)).toBeVisible();
  });
});

test.describe("Existing user login", () => {
  test("login page renders and accepts an email", async ({ page }) => {
    requiresTestEnv();
    await page.goto("/lt/auth/login");
    await expect(
      page.getByRole("heading", { name: /Prisijungti|Sign in/i }),
    ).toBeVisible();
    await page.getByLabel(/El\. paštas|Email/i).fill("existing@local.test");
    await page.getByRole("button", { name: /Siųsti prisijungimo nuorodą|Send login link/i }).click();
    await expect(page.getByText(/Patikrinkite el\. paštą|Check your email/i)).toBeVisible();
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

  test("worker adds the customer role from the switcher", async () => {
    requiresTestEnv();
    test.skip(true, "Requires authenticated session — wire after test project is configured (M1.x).");
  });
});

test.describe("Logout", () => {
  test("logout clears session and returns to the locale home", async () => {
    requiresTestEnv();
    test.skip(true, "Requires authenticated session — wire after test project is configured (M1.x).");
  });
});
