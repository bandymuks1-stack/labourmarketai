import { test, expect } from "@playwright/test";

/**
 * Primary route LIVE-RENDER smoke (skeleton).
 *
 * The static guard `pnpm check:primary-route-smoke` (PR #136) proves the route
 * source files exist and contain no dead links / placeholder leaks. This spec
 * is the next QA layer: it actually loads the public primary routes in a real
 * browser and asserts they render (HTTP 200) with no uncaught page error.
 *
 * Secret-free by design:
 *   - only PUBLIC routes are loaded (no login, no captcha, no SUPABASE_TEST_URL);
 *   - auth-gated routes are asserted to bounce anonymous visitors to /auth/login
 *     (no fake login is performed).
 *
 * Run against local dev (default) or any deployed URL:
 *   pnpm -F web e2e primary-route-live-smoke
 *   E2E_BASE_URL=https://labourmarket.ai E2E_NO_SERVER=1 \
 *     pnpm -F web exec playwright test primary-route-live-smoke
 *
 * Uses the already-present @playwright/test (no new dependency). See
 * docs/quality/playwright-live-render-smoke-plan.md for the full plan and the
 * CTA / mobile-viewport layers still to wire.
 */

// Public primary routes — must render with no auth and no secrets.
const PUBLIC_ROUTES: readonly string[] = [
  "/lt",
  "/lt/for-workers",
  "/lt/for-companies",
  "/lt/for-agencies",
  "/lt/pricing",
  "/lt/vision",
  "/lt/auth/login",
  "/lt/auth/signup",
];

// Auth-gated primary routes — an anonymous visit must redirect to login.
// (Mirrors the proven behaviour in auth.spec.ts; no fake login.)
const AUTH_GATED_ROUTES: readonly string[] = ["/lt/onboarding"];

test.describe("primary route live-render smoke — public routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders 200 with no uncaught page error`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      const response = await page.goto(route, { waitUntil: "domcontentloaded" });

      expect(response, `no response for ${route}`).not.toBeNull();
      expect(
        response?.status(),
        `expected 2xx for ${route}, got ${response?.status()}`,
      ).toBeLessThan(400);

      // A real page, not an error shell: <body> has visible content.
      await expect(page.locator("body")).not.toBeEmpty();

      expect(
        pageErrors,
        `uncaught page errors on ${route}:\n${pageErrors.join("\n")}`,
      ).toEqual([]);
    });
  }
});

test.describe("primary route live-render smoke — auth-gated routes", () => {
  for (const route of AUTH_GATED_ROUTES) {
    test(`${route} bounces anonymous visitor to /auth/login`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }
});
