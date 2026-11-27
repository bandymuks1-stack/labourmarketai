import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  SB_ANON,
  SB_URL,
  accessToken,
  isolatedStack,
  lit,
  onboard,
  recordJournal,
  setUpCompany,
  signUp,
  sql,
  userId,
} from "./isolated-web-a-helpers";

/**
 * Owner P0 security directive (2026-11-21), on the THROWAWAY local stack of
 * .github/workflows/signup-isolated.yml (all migrations replayed from
 * scratch). Synthetic people only; each write is attempted through the door a
 * person can reach with the public key or their OWN session.
 *
 *   SEC-1 sign-up metadata cannot make anyone an admin
 *         (20261121100000 handle_new_user allow-list + admin grant guard);
 *         a self-service role from metadata still works (positive control).
 *   SEC-2 an owner cannot make another person a manager of the organization
 *         without that person's accepted governance membership
 *         (20261121100000 grant_org_manager); the owner's own grant still works.
 *   SEC-3 a worker cannot "correct" another person's journal entry
 *         (20261121100100 journal_entries_lineage_guard_v1); the same insert
 *         without the foreign link is accepted (positive control).
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const OWNER = `sec-owner-${RUN}@example.test`;
const WORKER = `sec-worker-${RUN}@example.test`;
const OTHER = `sec-other-${RUN}@example.test`;

async function fresh(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function signUpByApi(address: string, data: Record<string, string>): Promise<string> {
  const r = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: PASSWORD, data }),
  });
  expect(r.ok, `public sign-up → ${r.status}`).toBe(true);
  return userId(address);
}

async function rest(address: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${await accessToken(address)}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

test("SEC-1. sign-up metadata cannot grant the admin role; a self-service role still does", async () => {
  const claimed = await signUpByApi(`sec-admin-${RUN}@example.test`, { role: "admin", locale: "en" });
  const admin = sql<{ n: number }>(
    `select count(*)::int as n from public.profile_roles where profile_id = ${lit(claimed)} and role = 'admin'`,
  );
  expect(admin[0]?.n, "no admin role row from sign-up metadata").toBe(0);
  const [profile] = sql<{ active_role: string | null }>(`select active_role from public.profiles where id = ${lit(claimed)}`);
  expect(profile?.active_role ?? null, "no admin active role from sign-up metadata").not.toBe("admin");

  const worker = await signUpByApi(`sec-role-${RUN}@example.test`, { role: "worker", locale: "en" });
  const [w] = sql<{ active_role: string | null }>(`select active_role from public.profiles where id = ${lit(worker)}`);
  expect(w?.active_role, "a self-service role from metadata is kept").toBe("worker");
});

test("SEC-2. an owner cannot make a person a manager without that person's accepted membership", async ({ browser }) => {
  const o = await fresh(browser);
  await signUp(o, BASE, OWNER);
  await onboard(o, "hire", "Synthetic Security Owner");
  await setUpCompany(o, `Synthetic Security Co ${RUN}`);
  const ownerId = await userId(OWNER);
  const [org] = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(ownerId)}`);
  expect(org?.id, "the owner's organization").toBeTruthy();

  const w = await fresh(browser);
  await signUp(w, BASE, WORKER);
  await onboard(w, "work", "Synthetic Security Worker");
  await w.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  const workerId = await userId(WORKER);

  const call = async (profile: string) => {
    const r = await rest(OWNER, "rpc/grant_org_manager", {
      method: "POST",
      body: JSON.stringify({ p_org_id: org!.id, p_profile_id: profile, p_operations_role: null }),
    });
    expect(r.ok, `grant_org_manager → ${r.status}`).toBe(true);
    return (await r.json()) as string;
  };
  expect(await call(workerId), "refused: the person never accepted a membership").toBe("not_a_governance_member");
  const managers = sql<{ n: number }>(
    `select count(*)::int as n from public.engagement_contexts
      where profile_id = ${lit(workerId)} and organization_id = ${lit(org!.id)} and relationship_slug = 'manager'`,
  );
  expect(managers[0]?.n, "no manager engagement was written for the person").toBe(0);
  expect(["granted", "already_manager"], "the owner's own grant still works").toContain(await call(ownerId));
});

test("SEC-3. a worker cannot correct another person's journal entry", async ({ browser }) => {
  const v = await fresh(browser);
  await signUp(v, BASE, OTHER);
  await onboard(v, "work", "Synthetic Security Other");
  await v.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await recordJournal(v, BASE, `QA-SYNTHETIC victim entry ${RUN}`);
  const w = await fresh(browser);
  await w.goto(`${BASE}/en/auth/login`);
  await w.locator('input[name="email"]').fill(WORKER);
  await w.locator('input[name="password"]').fill(PASSWORD);
  await w.locator('form button[type="submit"]').first().click();
  await w.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await recordJournal(w, BASE, `QA-SYNTHETIC own entry ${RUN}`);

  const [victim] = sql<{ id: string }>(
    `select id from public.journal_entries where original_text = ${lit(`QA-SYNTHETIC victim entry ${RUN}`)}`,
  );
  const [own] = sql<{ worker_id: string; engagement_context_id: string }>(
    `select worker_id, engagement_context_id from public.journal_entries where original_text = ${lit(`QA-SYNTHETIC own entry ${RUN}`)}`,
  );
  expect(victim?.id && own?.worker_id, "both entries are stored").toBeTruthy();

  const row = (text: string, extra: Record<string, unknown>) =>
    JSON.stringify({
      worker_id: own!.worker_id,
      engagement_context_id: own!.engagement_context_id,
      entry_type_slug: "freeform",
      original_text: text,
      original_language: "en",
      hash_self: "client",
      visibility_scope: "closed",
      ...extra,
    });
  const attack = await rest(WORKER, "journal_entries", {
    method: "POST",
    body: row(`QA-SYNTHETIC foreign correction ${RUN}`, { correction_of: victim!.id }),
  });
  expect(attack.ok, "the foreign correction is refused").toBe(false);
  expect(await attack.text()).toContain("journal_lineage_invalid");
  const linked = sql<{ n: number }>(
    `select count(*)::int as n from public.journal_entries where correction_of = ${lit(victim!.id)}`,
  );
  expect(linked[0]?.n, "nothing links to the other person's entry").toBe(0);

  const plain = await rest(WORKER, "journal_entries", {
    method: "POST",
    body: row(`QA-SYNTHETIC plain insert ${RUN}`, {}),
  });
  expect(plain.status, `the same insert without the foreign link is accepted (${await plain.text()})`).toBe(201);
});
