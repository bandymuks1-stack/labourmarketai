import { test, expect } from "@playwright/test";

/**
 * WORKER_REGISTRATION_FRICTION_REMOVAL — the two journeys that must BOTH be
 * proven before the registration lane is READY (status: NOT RUN until a stack
 * with "Confirm email" OFF and the migration 20261003151000 applied is
 * available — the local Supabase stack satisfies both; production must not be
 * used before the runbook's flip step).
 *
 *  A. POSITIVE — a new person registers with the minimum (email + password),
 *     receives a usable session at once WITHOUT opening any email, lands in
 *     onboarding and can open their own areas. No "confirm your email" screen.
 *
 *  B. NEGATIVE — an UNVERIFIED registrant (the address was typed, never
 *     proved) cannot claim, accept, decline or enumerate what is addressed to
 *     that address, and is offered the progressive proof instead; while a
 *     possession-proved invitation TOKEN still works for the same person.
 *
 * Environment (all required for B; A needs only SUPABASE_TEST_URL):
 *   SUPABASE_TEST_URL               local/test stack API URL
 *   SUPABASE_TEST_ANON_KEY          its anon key
 *   SUPABASE_TEST_SERVICE_ROLE_KEY  its service-role key (seeds the invitation)
 *   E2E_INVITE_COMPANY_ID           an existing public.companies.id in that stack
 */
const URL_ = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const COMPANY = process.env.E2E_INVITE_COMPANY_ID;
const PASSWORD = "E2ePass!23x";

async function signUpThroughUi(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/signup");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
  await page.getByRole("button", { name: /Sign up|Registruotis/i }).click();
}

test.describe("Registration friction removal — positive journey", () => {
  test("signup without opening any email -> usable session -> onboarding -> own dashboard", async ({ page }) => {
    test.skip(!URL_, "SUPABASE_TEST_URL not configured — see docs/TESTING.md");
    await signUpThroughUi(page, `e2e.friction.${Date.now()}@local.test`);
    // No 'check your email' dead end, no confirmation screen.
    await expect(page.getByTestId("signup-check-email")).toHaveCount(0);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    // The session is real: an authenticated area opens without any mailbox step.
    await page.goto("/en/dashboard");
    await expect(page).not.toHaveURL(/\/auth\/(login|signup)/);
    await expect(page.getByText(/confirm your email to continue|cannot continue until/i)).toHaveCount(0);
  });
});

test.describe("Registration friction removal — negative security journey", () => {
  test("an unverified registrant cannot claim or see an invitation addressed to their typed address", async ({ page, request }) => {
    test.skip(!(URL_ && ANON && SERVICE && COMPANY), "needs SUPABASE_TEST_URL/ANON_KEY/SERVICE_ROLE_KEY + E2E_INVITE_COMPANY_ID");
    const email = `e2e.victim.${Date.now()}@local.test`;

    // Seed: a pending roster invitation addressed to an address nobody has proved.
    // inviter_profile_id is NOT NULL: use the company's own owner profile.
    const own = await request.get(`${URL_}/rest/v1/companies?id=eq.${COMPANY}&select=profile_id`, {
      headers: { apikey: SERVICE!, Authorization: `Bearer ${SERVICE}` },
    });
    const inviter = ((await own.json()) as { profile_id: string }[])[0]?.profile_id;
    expect(inviter, "company owner profile").toBeTruthy();
    const seed = await request.post(`${URL_}/rest/v1/company_worker_invitations`, {
      headers: { apikey: SERVICE!, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { company_id: COMPANY, invited_email: email, status: "pending", inviter_profile_id: inviter },
    });
    expect(seed.ok(), await seed.text()).toBeTruthy();

    // The attacker registers with that address — and enters at once (the lane's promise).
    await signUpThroughUi(page, email);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

    // The registrant finishes onboarding (their own RPC) so the account area opens, as for any user.
    const tok0 = await request.post(`${URL_}/auth/v1/token?grant_type=password`, {
      headers: { apikey: ANON!, "Content-Type": "application/json" },
      data: { email, password: PASSWORD },
    });
    const jwt0 = ((await tok0.json()) as { access_token: string }).access_token;
    const ob = await request.post(`${URL_}/rest/v1/rpc/complete_onboarding`, {
      headers: { apikey: ANON!, Authorization: `Bearer ${jwt0}`, "Content-Type": "application/json" },
      data: { p_role: "worker", p_display_name: "E2E Victim", p_country: "LT", p_role_data: {} },
    });
    expect(ob.ok(), await ob.text()).toBeTruthy();

    // 1. The UI offers the proof instead of the invitation.
    await page.goto("/en/dashboard/network");
    await expect(page.getByTestId("network-email-unverified")).toBeVisible();
    await expect(page.getByTestId("verify-email-send")).toBeVisible();
    await expect(page.getByTestId("incoming-invitations")).toHaveCount(0);

    // 2. The database refuses the claim for the same session (REST, real JWT).
    const token = await request.post(`${URL_}/auth/v1/token?grant_type=password`, {
      headers: { apikey: ANON!, "Content-Type": "application/json" },
      data: { email, password: PASSWORD },
    });
    expect(token.ok(), await token.text()).toBeTruthy();
    const { access_token } = (await token.json()) as { access_token: string };
    const rpc = (fn: string, data: unknown) =>
      request.post(`${URL_}/rest/v1/rpc/${fn}`, {
        headers: { apikey: ANON!, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        data,
      });
    const accept = await rpc("accept_company_worker_invitation", { p_company_id: COMPANY });
    // A worker row may not exist yet for a brand-new registrant; either way the
    // claim must NOT succeed.
    const body = (await accept.text()).replace(/"/g, "");
    expect(["email_unverified", "no_worker_profile"]).toContain(body);
    expect(body).not.toMatch(/^(linked|already_linked)$/);
    const list = await rpc("list_invitations_for_me_v1", {});
    const listed = (await list.json()) as { items: unknown[]; email_unverified?: boolean };
    expect(listed.items).toEqual([]);
    expect(listed.email_unverified).toBe(true);
    const rows = await request.get(`${URL_}/rest/v1/company_worker_invitations?select=id&invited_email=eq.${encodeURIComponent(email)}`, {
      headers: { apikey: ANON!, Authorization: `Bearer ${access_token}` },
    });
    expect(await rows.json()).toEqual([]);
  });
});

test.describe("Registration friction removal — progressive proof round trip (local inbox)", () => {
  /**
   * Optional, skipped unless a local mail capture is available. The local
   * Supabase stack ships Mailpit/Inbucket (container supabase_inbucket_*,
   * UI http://127.0.0.1:54324). Set E2E_INBOX_URL to its base URL.
   * Proves: request_email_verification_v1 -> one-time mail -> /auth/callback
   * flow=verify_email -> confirm_my_email_v1 -> verified=true, and that the
   * password session alone was NOT verified before. NOT RUN by the lane author.
   */
  const INBOX = process.env.E2E_INBOX_URL;
  const LINK_RX = /https?:\/\/[^\s"'<>]+/g;
  const isProofLink = (l: string) => /\/auth\/v1\/verify|\/auth\/callback/.test(l);

  async function findLink(
    request: import("@playwright/test").APIRequestContext,
    email: string,
  ): Promise<string | null> {
    const local = email.split("@")[0];
    for (let i = 0; i < 30; i++) {
      // Mailpit: search then read the message.
      const mp = await request.get(`${INBOX}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      if (mp.ok()) {
        const id = ((await mp.json()) as { messages?: { ID: string }[] }).messages?.[0]?.ID;
        if (id) {
          const body = (await (await request.get(`${INBOX}/api/v1/message/${id}`)).json()) as { HTML?: string; Text?: string };
          const hit = `${body.HTML ?? ""} ${body.Text ?? ""}`.match(LINK_RX)?.find(isProofLink);
          if (hit) return hit.replace(/&amp;/g, "&");
        }
      } else {
        // Inbucket: list the mailbox then read the newest message.
        const ib = await request.get(`${INBOX}/api/v1/mailbox/${encodeURIComponent(local)}`);
        if (ib.ok()) {
          const last = ((await ib.json()) as { id: string }[]).at(-1);
          if (last) {
            const body = (await (await request.get(`${INBOX}/api/v1/mailbox/${encodeURIComponent(local)}/${last.id}`)).json()) as { body?: { html?: string; text?: string } };
            const hit = `${body.body?.html ?? ""} ${body.body?.text ?? ""}`.match(LINK_RX)?.find(isProofLink);
            if (hit) return hit.replace(/&amp;/g, "&");
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  test("request -> mailed one-time link -> callback -> verified", async ({ page, request }) => {
    test.skip(!(URL_ && ANON && INBOX), "needs SUPABASE_TEST_URL/ANON_KEY + E2E_INBOX_URL (local Mailpit/Inbucket)");
    const email = `e2e.proof.${Date.now()}@local.test`;
    await signUpThroughUi(page, email);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    const tok = await request.post(`${URL_}/auth/v1/token?grant_type=password`, {
      headers: { apikey: ANON!, "Content-Type": "application/json" },
      data: { email, password: PASSWORD },
    });
    const jwt = ((await tok.json()) as { access_token: string }).access_token;
    const rpc = (fn: string, token: string, data: unknown = {}) =>
      request.post(`${URL_}/rest/v1/rpc/${fn}`, {
        headers: { apikey: ANON!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data,
      });
    const ob = await rpc("complete_onboarding", jwt, { p_role: "worker", p_display_name: "E2E Proof", p_country: "LT", p_role_data: {} });
    expect(ob.ok(), await ob.text()).toBeTruthy();
    // A password session alone proves nothing.
    expect(((await (await rpc("my_email_verification_v1", jwt)).json()) as { verified: boolean }).verified).toBe(false);

    // Step 1: record the request, step 2: ask GoTrue to mail the one-time link
    // (exactly what requestEmailVerificationAction does server-side).
    const reqd = (await (await rpc("request_email_verification_v1", jwt)).json()) as { outcome: string };
    expect(reqd.outcome).toBe("requested");
    const otp = await request.post(`${URL_}/auth/v1/otp`, {
      headers: { apikey: ANON!, "Content-Type": "application/json" },
      data: { email, create_user: false },
    });
    expect(otp.ok(), await otp.text()).toBeTruthy();

    const link = await findLink(request, email);
    expect(link, "proof mail with a one-time link arrived in the local inbox").toBeTruthy();
    // The mailed link mints a one-time-token session; the callback (flow=verify_email)
    // is what calls confirm_my_email_v1 — so open it through the callback.
    await page.goto(link!);
    await page.waitForLoadState("networkidle");

    // Read the state with a FRESH password token: verification is persisted per address.
    const tok2 = await request.post(`${URL_}/auth/v1/token?grant_type=password`, {
      headers: { apikey: ANON!, "Content-Type": "application/json" },
      data: { email, password: PASSWORD },
    });
    const jwt2 = ((await tok2.json()) as { access_token: string }).access_token;
    expect(((await (await rpc("my_email_verification_v1", jwt2)).json()) as { verified: boolean }).verified).toBe(true);
  });
});
