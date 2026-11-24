import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * The LMC balance, seen by a real person in a real browser.
 *
 * The ledger was proven correct on production months ago and had ZERO
 * application readers — no screen anywhere showed a single number of it. So the
 * question this spec answers is not "does the query work" but "does a signed-in
 * person actually SEE their credit, and is what they see honest when the data
 * is missing".
 *
 * Three states, and the whole point is that they are three:
 *
 *   no_account   — nothing has ever happened. Said plainly, not dressed as "0".
 *   ready        — a real balance, from the canonical view.
 *   unavailable  — the read failed. Shown AS a failure, never as a zero.
 *
 * The rows are created through the ledger's own SECURITY DEFINER RPCs, never by
 * inserting into the tables: there is no INSERT policy on any LMC table and
 * even service_role is revoked from writing them. A test that could write the
 * ledger directly would be proving something about a database this product does
 * not have.
 */

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

/** The fixture WORKER — the personal subject the surface reads. */
const WORKER_USER_ID = "aaaaaaaa-0000-0000-0000-000000000001";

function assertLocal(): void {
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to touch a non-local target: ${SUPA_URL}`);
  }
}

/** Call a ledger RPC as service_role. */
async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; body: string }> {
  assertLocal();
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { ok: res.ok, body: await res.text() };
}

/** REST helper for the fixture-only role changes below. */
async function rest(
  method: "PATCH" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  assertLocal();
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Grant / revoke the local fixture's admin role.
 *
 * `lmc_set_flag_v1` requires the DUAL-SIGNAL admin role, and it is right to:
 * flag flips move money policy. The fixtures ship no admin, so the spec makes
 * one for the length of the run and takes it away again. This is a LOCAL
 * fixture operation on a database that is reset before every run — the same
 * class as the verification_status trick the local E2E recipe already
 * documents — and it is deliberately NOT a way around the gate: the two
 * `owner_only` flags are refused for every caller, admin included, and this
 * spec never touches them.
 */
async function setFixtureAdmin(on: boolean): Promise<void> {
  if (on) {
    await rest("POST", "profile_roles", {
      profile_id: WORKER_USER_ID,
      role: "admin",
      is_active: true,
    });
  } else {
    await rest(
      "DELETE",
      `profile_roles?profile_id=eq.${WORKER_USER_ID}&role=eq.admin`,
    );
  }
}

/**
 * Flip an LMC kill-switch through its own audited RPC.
 *
 * `lmc_set_flag_v1` refuses the two `owner_only` flags for EVERY caller
 * including service_role — deliberately, and this spec never touches those. The
 * `admin` class ones it does use are restored in `afterAll`, so a local stack is
 * left as it was found.
 */
async function setFlag(key: string, enabled: boolean): Promise<void> {
  const res = await rpc("lmc_set_flag_v1", {
    p_key: key,
    p_enabled: enabled,
    p_actor_profile_id: WORKER_USER_ID,
  });
  if (!res.ok) throw new Error(`setFlag ${key}: ${res.body}`);
}

const section = (page: Page) => page.getByTestId("lmc-balance-section");

test.describe("a person can see their LMC", () => {
  test.skip(
    !HAS_LOCAL_STACK,
    "needs the local stack (pnpm -C apps/web e2e:local)",
  );
  test.use({
    storageState: "tests/e2e/.storage-state.json",
    viewport: { width: 1440, height: 900 },
  });
  test.setTimeout(180_000);
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    // Leave every flag as it was found, then hand the admin role back. The
    // ledger ROWS are append-only by design and are NOT deleted — pretending a
    // money record can be removed is the one thing this ledger exists to make
    // impossible, and the next run starts from a reset database anyway.
    await setFlag("lmc_promotional_grants_enabled", false).catch(() => {});
    await setFlag("lmc_spending_enabled", false).catch(() => {});
    await setFixtureAdmin(false);
  });

  /**
   * Runs FIRST, on a freshly reset database where the fixture worker has no
   * LMC account. "Nothing has ever happened" must read as exactly that — not as
   * a balance of zero, which is a different claim.
   */
  test("with no account it says nothing has happened, not that you have nothing", async ({
    page,
  }) => {
    // PRECONDITION, asserted rather than assumed. An LMC account cannot be
    // deleted — `lmc_accounts` has no DELETE policy and service_role is revoked
    // from writing it — so this state exists only on a freshly reset database.
    // Saying that out loud turns a confusing "expected no_account, got ready"
    // on a second run into an instruction. It is NOT skipped: a skipped
    // authenticated test is how a suite starts lying (#1319).
    const existing = await fetch(
      `${SUPA_URL}/rest/v1/lmc_account_balances?profile_id=eq.${WORKER_USER_ID}&select=account_id`,
      {
        headers: {
          apikey: SUPA_SERVICE,
          Authorization: `Bearer ${SUPA_SERVICE}`,
        },
      },
    );
    expect(
      ((await existing.json()) as unknown[]).length,
      "the fixture worker already has an LMC account, and one cannot be deleted — run `npx supabase db reset && pnpm -C apps/web db:fixtures:local` before this spec",
    ).toBe(0);

    await page.goto("/lt/dashboard/account#lmc");
    await expect(section(page)).toBeVisible();
    await expect(section(page)).toHaveAttribute("data-state", "no_account");
    await expect(page.getByTestId("lmc-no-account")).toBeVisible();
    // No number is shown, because there is no account to have one.
    await expect(page.getByTestId("lmc-available")).toHaveCount(0);
  });

  test("a real grant and a real spend appear as a balance and a history", async ({
    page,
  }) => {
    await setFixtureAdmin(true);
    await setFlag("lmc_promotional_grants_enabled", true);
    // The promotional amount is FIXED in the RPC (5000 LMC-cents = 50 LMC) and
    // is not a caller argument — the test takes what the ledger gives it rather
    // than choosing a number that would make the assertion prettier.
    const grant = await rpc("lmc_grant_promotional_v1", {
      p_kind: "promotional_activity",
      p_profile_id: WORKER_USER_ID,
      p_campaign: "e2e_lmc_surface",
      p_idempotency_key: "e2e-lmc-grant-1",
    });
    expect(grant.ok, `grant failed: ${grant.body}`).toBe(true);

    await setFlag("lmc_spending_enabled", true);
    const spend = await rpc("lmc_spend_v1", {
      p_amount_cents: 250,
      p_reason: "e2e_lmc_spend",
      p_idempotency_key: "e2e-lmc-spend-1",
      p_profile_id: WORKER_USER_ID,
      // Required, and refusing without it (`lmc_actor_required`) is the ledger
      // being right: every debit records WHO initiated it.
      p_actor_profile_id: WORKER_USER_ID,
    });
    expect(spend.ok, `spend failed: ${spend.body}`).toBe(true);

    await page.goto("/lt/dashboard/account#lmc");
    await expect(section(page)).toHaveAttribute("data-state", "ready");

    // 5000 granted − 250 spent = 4750 LMC-cents = 47.50 LMC. The figure comes
    // from `lmc_account_balances`; this asserts the SURFACE agrees with the
    // ledger, which is the only thing a client is allowed to do with it.
    await expect(page.getByTestId("lmc-available")).toHaveAttribute(
      "data-cents",
      "4750",
    );

    // The most recent movement is the spend, and it is a DEBIT — read from the
    // kind, not from the sign of a number the ledger stores as a magnitude.
    await expect(page.getByTestId("lmc-latest")).toBeVisible();
    await page.getByTestId("lmc-history").click();
    const rows = page.getByTestId("lmc-movement");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute("data-kind", "spend");
    await expect(rows.first()).toHaveAttribute("data-direction", "debit");
    await expect(rows.last()).toHaveAttribute("data-direction", "credit");
  });

  /**
   * Top-up is gated by `owner_only` flags that no caller can flip. The surface
   * must therefore carry a sentence, never a button that cannot work.
   */
  test("offers an explanation instead of a top-up button that cannot work", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/account#lmc");
    await expect(page.getByTestId("lmc-topup-state")).toBeVisible();
    await expect(
      section(page).getByRole("button", { name: /papildyt|top ?up/i }),
    ).toHaveCount(0);
  });

  test("the section is usable at phone width with no sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard/account#lmc");
    await expect(section(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.body.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow at 375px").toBeLessThanOrEqual(0);
  });
});
