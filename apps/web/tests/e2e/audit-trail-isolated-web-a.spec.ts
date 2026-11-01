import { expect, test } from "@playwright/test";

import {
  BASE,
  SB_ANON,
  SB_URL,
  accessToken,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signIn,
  signUp,
  sql,
  stackMailLink,
  userId,
} from "./isolated-web-a-helpers";

/**
 * AUDIT TRAIL (function register 9.9) on the THROWAWAY local stack
 * (.github/workflows/signup-isolated.yml): audited actions taken through the
 * real UI write `public.audit_logs` rows bound to the acting person, and the
 * trail is not readable or writable by that person's own session (admin-only
 * by RLS). Local database only; nothing here touches production.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const OWNER = `audit.owner.${RUN}@local.test`;
const ROLE = `Audit tiler ${RUN}`;

type AuditRow = { action: string; entity: string | null; entity_id: string | null; payload: Record<string, unknown> | null };

function auditRows(actor: string, action: string): AuditRow[] {
  return sql<AuditRow>(
    `select action, entity, entity_id, payload from public.audit_logs
      where actor_id = ${lit(actor)} and action = ${lit(action)} order by occurred_at`,
  );
}

const state: { ownerId?: string; requestId?: string } = {};

test("U-1. closing and reopening a need writes one audit row each, bound to the person who did it", async ({ page }) => {
  await signUp(page, BASE, OWNER);
  await onboard(page, "hire", "Synthetic Audit Owner");
  await setUpCompany(page, `Synthetic Audit Co ${RUN}`);
  await publishNeed(page, BASE, ROLE);
  state.ownerId = await userId(OWNER);
  const [req] = sql<{ id: string; status: string }>(
    `select id, status from public.customer_requests where title ilike ${lit(`%${RUN}%`)} order by created_at desc limit 1`,
  );
  expect(req?.id, "the need is stored").toBeTruthy();
  state.requestId = req.id;

  await page.goto(`${BASE}/en/dashboard/company/scouting?request=${req.id}`);
  const controls = page.getByTestId("demand-lifecycle-controls");
  await expect(controls, "the need's own lifecycle controls").toBeVisible({ timeout: 30_000 });
  await controls.getByTestId("demand-close").click();
  await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
  await expect
    .poll(() => auditRows(state.ownerId!, "close_demand").map((r) => r.entity_id), {
      message: "close_demand is in the audit trail for this need",
      timeout: 30_000,
    })
    .toEqual([req.id]);
  const [closed] = auditRows(state.ownerId!, "close_demand");
  expect(closed.entity).toBe("customer_requests");
  expect(closed.payload?.to_status, "the trail records the transition").toBe("closed");

  await controls.getByTestId("demand-reopen").click();
  await expect(controls).not.toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
  await expect
    .poll(() => auditRows(state.ownerId!, "reopen_demand").map((r) => r.entity_id), {
      message: "reopen_demand is in the audit trail for this need",
      timeout: 30_000,
    })
    .toEqual([req.id]);
  const [reopened] = auditRows(state.ownerId!, "reopen_demand");
  expect(reopened.payload?.from_status).toBe("closed");
});

test("U-2. proving a mailbox writes an email_verified audit row", async ({ page }) => {
  expect(state.ownerId, "U-1 created the person").toBeTruthy();
  await signIn(page, BASE, OWNER);
  await page.goto(`${BASE}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt, "a new account is asked to confirm its address").toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  const proof = await stackMailLink(OWNER);
  await page.goto(proof);
  await page.waitForURL((url) => url.host === new URL(BASE).host && !url.pathname.includes("/auth/callback"), {
    timeout: 60_000,
  });
  await expect
    .poll(() => auditRows(state.ownerId!, "email_verified").length, {
      message: "email_verified is in the audit trail",
      timeout: 30_000,
    })
    .toBe(1);
  expect(auditRows(state.ownerId!, "email_verified")[0].payload?.method).toBe("mailbox_proof");
});

test("U-3. the person's own session can neither read nor forge the audit trail", async () => {
  expect(state.ownerId, "U-1 created the person").toBeTruthy();
  test.skip(!SB_ANON, "anon key not exported");
  const token = await accessToken(OWNER);
  const headers = { apikey: SB_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const read = await fetch(`${SB_URL}/rest/v1/audit_logs?select=action&actor_id=eq.${state.ownerId}`, { headers });
  if (read.ok) {
    expect(await read.json(), "a non-admin reads none of their own audit rows").toEqual([]);
  } else {
    expect([401, 403]).toContain(read.status);
  }

  const before = sql<{ n: number }>(`select count(*)::int as n from public.audit_logs where actor_id = ${lit(state.ownerId!)}`)[0].n;
  const forge = await fetch(`${SB_URL}/rest/v1/audit_logs`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ actor_id: state.ownerId, action: "forged_by_walk", entity: "none" }),
  });
  expect(forge.ok, "a direct insert into the audit trail is refused").toBe(false);
  const after = sql<{ n: number }>(`select count(*)::int as n from public.audit_logs where actor_id = ${lit(state.ownerId!)}`)[0].n;
  expect(after, "no row was added").toBe(before);
  expect(auditRows(state.ownerId!, "forged_by_walk")).toEqual([]);
});
