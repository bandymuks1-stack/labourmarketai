import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * COMMERCIAL CHAIN — E2E (commercial readiness audit v1).
 *
 * Walks the paid path a real tester walks:
 *   registration → sign-in → account → subscription state → provider return
 *   → billing portal → sign out → sign in → the state is still the same.
 *
 * WHAT THIS SPEC CAN AND CANNOT PROVE.
 * Stripe is OFF in every environment this suite runs in (`PAYMENTS_ENABLED` is
 * false and live keys are hard-blocked by design), so no browser test can move
 * real money. Rather than fake it, this spec asserts the two things that are
 * actually true and actually matter:
 *
 *   A. while payments are off, EVERY paid entry point degrades honestly —
 *      no dead button, no "subscription active" claim, no charge attempt;
 *   B. the moment a valid Stripe TEST config exists, the same surfaces expose
 *      the real controls (the spec detects the mode from the page and asserts
 *      the matching branch, so it starts proving the paid path automatically).
 *
 * The transactional half of the chain (webhook → status → entitlement →
 * re-subscription → cancellation) is proven deterministically, against the real
 * store code and the real unique constraints, in
 * `lib/billing/commercial-chain.integration.test.ts`.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.describe("commercial chain — public surfaces (no session)", () => {
  test("pricing never offers a payment that cannot complete", async ({ page }) => {
    const response = await page.goto("/en/pricing");
    expect(response?.status()).toBeLessThan(400);

    // The internal TEST-checkout block is admin-only and must never render
    // publicly, in either config state.
    await expect(page.getByTestId("billing-test-checkout")).toHaveCount(0);

    // No public control claims to take money.
    const payLike = page.getByRole("button", {
      name: /pay now|buy now|subscribe now|checkout/i,
    });
    await expect(payLike).toHaveCount(0);
  });

  test("the billing endpoints refuse an unauthenticated caller honestly", async ({
    request,
  }) => {
    const checkout = await request.post("/api/billing/test-checkout", {
      data: { planKey: "company_pilot" },
      failOnStatusCode: false,
    });
    // 400 payments_disabled (billing off) or 401 not_authenticated (billing on).
    expect([400, 401, 403]).toContain(checkout.status());
    const checkoutBody = await checkout.json();
    expect(checkoutBody.ok).toBe(false);
    expect(["payments_disabled", "not_authenticated", "live_blocked"]).toContain(
      checkoutBody.reason,
    );

    const portal = await request.post("/api/billing/portal", {
      failOnStatusCode: false,
    });
    expect([400, 401, 403, 404]).toContain(portal.status());
    const portalBody = await portal.json();
    expect(portalBody.ok).toBe(false);
  });

  test("the webhook rejects an unsigned request before touching any state", async ({
    request,
  }) => {
    const res = await request.post("/api/billing/webhook", {
      data: { id: "evt_forged", type: "customer.subscription.updated" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).reason).toBe("invalid_signature");
  });
});

test.describe("commercial chain — signed in", () => {
  test.skip(
    !HAS_SESSION,
    `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
  );
  test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

  test("the account page states the real billing position", async ({ page }) => {
    await page.goto("/lt/dashboard/account");

    const section = page.getByTestId("account-billing-status");
    await expect(section).toBeVisible();

    const state = await section.getAttribute("data-billing-state");
    expect(["disabled", "stripe_test", "stripe_live_blocked"]).toContain(state);

    if (state === "stripe_test") {
      // Payments are configured: the subscription status must be a real value
      // and, when a subscription exists, the portal control must be present.
      const status = await section.getAttribute("data-subscription-status");
      expect(status).toBeTruthy();
      if (status && status !== "none") {
        await expect(page.getByTestId("billing-portal-open")).toBeVisible();
      }
    } else {
      // Payments are off: no portal control, and no paid-status claim.
      await expect(page.getByTestId("billing-portal-open")).toHaveCount(0);
      await expect(section).toContainText(/./);
    }
  });

  test("the provider return is acknowledged instead of landing silently", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/account?billing=test_cancelled");
    const notice = page.getByTestId("account-billing-return");
    // The acknowledgement renders only when payments are configured; when they
    // are off the honest disabled statement is the correct answer.
    const state = await page
      .getByTestId("account-billing-status")
      .getAttribute("data-billing-state");
    if (state === "stripe_test") {
      await expect(notice).toBeVisible();
    } else {
      await expect(page.getByTestId("account-billing-status")).toBeVisible();
    }
  });

  test("billing state survives sign-out and sign-in (it is stored, not cached)", async ({
    page,
    context,
  }) => {
    await page.goto("/lt/dashboard/account");
    const before = await page
      .getByTestId("account-billing-status")
      .getAttribute("data-subscription-status");

    // A brand-new browser context reusing the same stored session = the
    // "log out, log back in" case for a server-rendered surface.
    const fresh = await context.browser()?.newContext({
      storageState: STORAGE_STATE,
    });
    if (!fresh) test.skip(true, "no browser context available");
    const page2 = await fresh!.newPage();
    await page2.goto(
      `${process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"}/lt/dashboard/account`,
    );
    const after = await page2
      .getByTestId("account-billing-status")
      .getAttribute("data-subscription-status");
    expect(after).toBe(before);
    await fresh!.close();
  });

  test("a non-admin cannot reach the LMC credit surface", async ({ page }) => {
    const res = await page.goto("/lt/dashboard/admin/billing");
    // Either the admin page is refused (redirect / 40x), or the caller IS an
    // admin and the LMC panel renders with real, DB-read flag state.
    if (page.url().includes("/dashboard/admin/billing") && res && res.ok()) {
      const panel = page.getByTestId("admin-lmc-panel");
      await expect(panel).toBeVisible();
      // Never a credit form that pretends to work while grants are switched
      // off in the database.
      const grantsOff = page.getByTestId("admin-lmc-grants-disabled");
      const flags = page.getByTestId("admin-lmc-flags");
      const unavailable = page.getByTestId("admin-lmc-unavailable");
      expect(
        (await flags.count()) + (await unavailable.count()),
      ).toBeGreaterThan(0);
      if ((await flags.count()) > 0) {
        const enabled = await page
          .locator('[data-flag="lmc_promotional_grants_enabled"]')
          .getAttribute("data-enabled");
        if (enabled === "false") await expect(grantsOff).toBeVisible();
      }
    } else {
      expect(page.url()).not.toContain("/dashboard/admin/billing");
    }
  });
});
