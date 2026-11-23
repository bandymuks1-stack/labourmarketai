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
  setUpCompany,
  signUp,
  sql,
  sqlExec,
  userId,
} from "./isolated-web-a-helpers";

/**
 * Owner decision 2026-11-22: a demoted owner loses owner rights at once
 * (RED 20261122140000_demoted_owner_loses_owner_authority_v1, #3620). On the
 * THROWAWAY local stack of signup-isolated.yml (all migrations replayed);
 * synthetic people only; every check goes through the door the person can
 * reach with their OWN session.
 *
 *   DO-1 the creator, demoted to member by a co-owner, loses owns_company,
 *        manages_organization and the company row edit; the owner pointer
 *        moves to the co-owner (R2 P3-1 on #3620: database proof).
 *   DO-2 the co-owner, an owner by membership who did not create the company,
 *        keeps owns_company and manages_organization (the reverse case).
 *   DO-3 the last owner cannot demote themselves (refused as last_owner).
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const CREATOR = `do-creator-${RUN}@example.test`;
const COOWNER = `do-coowner-${RUN}@example.test`;
const state = { orgId: "", companyId: "", creatorId: "", coownerId: "" };

async function fresh(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
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

async function rpc<T>(address: string, fn: string, body: Record<string, unknown>): Promise<T> {
  const r = await rest(address, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
  expect(r.ok, `${fn} → ${r.status}`).toBe(true);
  return (await r.json()) as T;
}

/** Rows the caller's own session actually updated (RLS filters silently). */
async function editCompany(address: string): Promise<number> {
  const r = await rest(address, `companies?id=eq.${state.companyId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ description: `edited ${RUN}` }),
  });
  expect(r.ok, `companies PATCH → ${r.status}`).toBe(true);
  return ((await r.json()) as unknown[]).length;
}

test("DO-1. a creator demoted to member loses every owner right; the owner pointer moves", async ({ browser }) => {
  const p = await fresh(browser);
  await signUp(p, BASE, CREATOR);
  await onboard(p, "hire", "Synthetic Demotion Creator");
  await setUpCompany(p, `Synthetic Demotion Co ${RUN}`);
  state.creatorId = await userId(CREATOR);
  const [org] = sql<{ id: string; company: string }>(
    `select id, legacy_company_id as company from public.organizations where owner_profile_id = ${lit(state.creatorId)} and organization_type = 'company'`,
  );
  expect(org?.id, "the creator's organization").toBeTruthy();
  state.orgId = org!.id;
  state.companyId = org!.company;

  const r = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: COOWNER, password: PASSWORD, data: { role: "company" } }),
  });
  expect(r.ok, `co-owner sign-up → ${r.status}`).toBe(true);
  state.coownerId = await userId(COOWNER);
  // Synthetic seed: both are active owners (the creator's row only if the
  // company setup did not already write it).
  sqlExec(`insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at, source)
           select ${lit(state.orgId)}, ${lit(state.creatorId)}, 'owner', 'active', now(), 'test:demoted-owner'
            where not exists (select 1 from public.company_memberships
                               where organization_id = ${lit(state.orgId)} and profile_id = ${lit(state.creatorId)} and status = 'active');
           update public.company_memberships set role = 'owner'
            where organization_id = ${lit(state.orgId)} and profile_id = ${lit(state.creatorId)} and status = 'active';
           insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at, source)
           values (${lit(state.orgId)}, ${lit(state.coownerId)}, 'owner', 'active', now(), 'test:demoted-owner');`);

  // Before: the creator is an owner on every path.
  expect(await rpc<boolean>(CREATOR, "owns_company", { c: state.companyId }), "creator owns before").toBe(true);
  expect(await rpc<boolean>(CREATOR, "manages_organization", { org: state.orgId }), "creator manages before").toBe(true);
  expect(await editCompany(CREATOR), "creator edits the company row before").toBe(1);

  const [creatorRow] = sql<{ id: string }>(
    `select id from public.company_memberships where organization_id = ${lit(state.orgId)} and profile_id = ${lit(state.creatorId)} and status = 'active'`,
  );
  expect(
    await rpc<string>(COOWNER, "membership_change_role_v1", { p_membership_id: creatorRow!.id, p_new_role: "member" }),
    "the co-owner demotes the creator",
  ).toBe("role_changed");

  // After: no owner right is left on any path.
  expect(await rpc<boolean>(CREATOR, "owns_company", { c: state.companyId }), "creator no longer owns").toBe(false);
  expect(await rpc<boolean>(CREATOR, "manages_organization", { org: state.orgId }), "creator no longer manages").toBe(false);
  expect(await editCompany(CREATOR), "the company row edit is refused by RLS").toBe(0);
  const [o] = sql<{ owner: string }>(`select owner_profile_id as owner from public.organizations where id = ${lit(state.orgId)}`);
  expect(o?.owner, "the owner pointer moved to the co-owner").toBe(state.coownerId);
  const [e] = sql<{ n: number }>(
    `select count(*)::int as n from public.engagement_contexts
      where organization_id = ${lit(state.orgId)} and profile_id = ${lit(state.creatorId)}
        and status = 'active' and relationship_slug in ('owner', 'manager', 'external_manager')`,
  );
  expect(e?.n, "no active governance engagement is left").toBe(0);
});

test("DO-2. an owner by membership who did not create the company keeps owner rights", async () => {
  expect(await rpc<boolean>(COOWNER, "owns_company", { c: state.companyId }), "co-owner owns").toBe(true);
  expect(await rpc<boolean>(COOWNER, "manages_organization", { org: state.orgId }), "co-owner manages").toBe(true);
});

test("DO-3. the last owner cannot demote themselves", async () => {
  const [row] = sql<{ id: string }>(
    `select id from public.company_memberships where organization_id = ${lit(state.orgId)} and profile_id = ${lit(state.coownerId)} and status = 'active'`,
  );
  expect(
    await rpc<string>(COOWNER, "membership_change_role_v1", { p_membership_id: row!.id, p_new_role: "admin" }),
    "refused: the organization would have no owner",
  ).toBe("last_owner");
  const [o] = sql<{ owner: string }>(`select owner_profile_id as owner from public.organizations where id = ${lit(state.orgId)}`);
  expect(o?.owner, "the owner pointer is unchanged").toBe(state.coownerId);
});
