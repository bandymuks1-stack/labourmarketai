import { expect, test } from "@playwright/test";

/**
 * Social-auth matrix — the provider-INDEPENDENT legs (FINAL COMPLETION Train C2).
 *
 * Every social provider (Google today; LinkedIn / Facebook once gate G-2 is
 * closed) shares ONE callback, ONE `next` contract and ONE cancel path. The
 * legs that need a provider screen (a real person signing in at Google /
 * LinkedIn / Facebook) are human steps and are recorded in
 * docs/human-gates/social-providers-gate.md; everything AFTER the provider
 * returns is exercised here without a session, without a test DB and without
 * any credential, so it runs in the CI e2e subset on every PR.
 *
 * What a green run proves:
 *   • a provider CANCEL is rendered as a neutral status line (never a red
 *     system fault) and keeps the person's `next`;
 *   • an expired / used e-mail confirmation link is told apart from a cancel
 *     (GoTrue sends the same `error=access_denied` for both) and offers a
 *     fresh link right there;
 *   • a confirmation opened on a device that did not start the signup is
 *     "confirmed — sign in here", not a failure;
 *   • provider buttons are HONEST: only providers the auth server reports as
 *     enabled render (fail-closed: Google only until the owner enables more);
 *   • credential-shaped and chained `next` values never survive the callback.
 */

const NEXT = "/lt/oauth/consent?authorization_id=e2e-social-matrix";

test.describe("social auth — callback legs shared by every provider", () => {
  test("provider cancel → neutral status on login, next preserved", async ({ page }) => {
    await page.goto(
      `/lt/auth/callback?error=access_denied&next=${encodeURIComponent(NEXT)}`,
    );
    await expect(page).toHaveURL(/\/lt\/auth\/login\?/);
    await expect(page).toHaveURL(/error=cancelled/);
    await expect(page).toHaveURL(/next=%2Flt%2Foauth%2Fconsent/);
    const notice = page.getByTestId("login-oauth-error");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "status");
  });

  test("expired e-mail link (access_denied + otp_expired) → link_expired with a resend, not a cancel", async ({
    page,
  }) => {
    await page.goto(
      `/lt/auth/callback?error=access_denied&error_code=otp_expired&next=${encodeURIComponent(NEXT)}`,
    );
    await expect(page).toHaveURL(/error=link_expired/);
    await expect(page).not.toHaveURL(/error=cancelled/);
    const notice = page.getByTestId("login-oauth-error");
    await expect(notice).toBeVisible();
    // A dead link is a problem to solve, so it is an alert — and the way
    // forward is right there: a resend block, gated on a typed address.
    await expect(notice).toHaveAttribute("role", "alert");
    const resend = page.getByTestId("login-resend-confirmation");
    await expect(resend).toBeVisible();
    const button = resend.getByRole("button");
    await expect(button).toBeDisabled();
    await page.getByLabel(/El\. paštas|Email/i).fill("someone@example.com");
    await expect(button).toBeEnabled();
  });

  test("confirmation opened on another device → 'confirmed, sign in here' as a neutral status", async ({
    page,
  }) => {
    await page.goto(
      `/lt/auth/login?error=confirmed_sign_in&next=${encodeURIComponent(NEXT)}`,
    );
    const notice = page.getByTestId("login-oauth-error");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "status");
    await expect(page.getByTestId("login-resend-confirmation")).toHaveCount(0);
  });

  test("a missing code is a system error, rendered as an alert", async ({ page }) => {
    await page.goto("/lt/auth/callback");
    await expect(page).toHaveURL(/error=missing_code/);
    await expect(page.getByTestId("login-oauth-error")).toHaveAttribute("role", "alert");
  });

  test("provider buttons are honest: Google renders, LinkedIn/Facebook only when the auth server enables them", async ({
    page,
    request,
  }) => {
    await page.goto("/lt/auth/login");
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
    // The page and the test read the SAME truth: the auth server's /settings.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let linkedin = false;
    let facebook = false;
    if (supabaseUrl && anonKey) {
      const res = await request.get(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
        headers: { apikey: anonKey },
      });
      if (res.ok()) {
        const body = (await res.json()) as { external?: Record<string, unknown> };
        linkedin = body.external?.linkedin_oidc === true;
        facebook = body.external?.facebook === true;
      }
    }
    await expect(page.getByTestId("linkedin-signin")).toHaveCount(linkedin ? 1 : 0);
    await expect(page.getByTestId("facebook-signin")).toHaveCount(facebook ? 1 : 0);
  });

  test("a hostile next never survives the callback (external origin, chained next, credential key)", async ({
    page,
  }) => {
    for (const bad of [
      "https://evil.example/phish",
      "//evil.example/phish",
      "/lt/dashboard?next=https://evil.example",
      "/lt/dashboard?token=abc",
    ]) {
      await page.goto(
        `/lt/auth/callback?error=access_denied&next=${encodeURIComponent(bad)}`,
      );
      await expect(page).toHaveURL(/\/lt\/auth\/login\?/);
      // The callback forwards `next` verbatim for diagnostics; the login FORM
      // is what navigates, and it only ever uses the sanitised path. Assert
      // the form's target through its signup link, which is built from that
      // sanitised path (`getSafeReturnPath`).
      const signupHref =
        (await page
          .getByTestId("login-signup-link")
          .getAttribute("href")) ?? "";
      expect(signupHref, bad).not.toMatch(/evil\.example|token=/);
      expect(signupHref, bad).toMatch(/^\/lt\/auth\/signup/);
    }
  });
});
