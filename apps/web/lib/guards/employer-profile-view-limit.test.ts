import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Owner directive 2026-10-18: the free employer plan opens up to 3 UNIQUE anonymized worker
 * profiles per ORGANIZATION; re-opening one of them never counts again; the limit is enforced on
 * the server; paid and owner-granted VIP access keep larger limits; no plan bypasses consent.
 *
 * This pins the rules of 20261023170000_employer_profile_views_v1 so a later edit cannot quietly
 * move the limit into the client, count per person instead of per organization, charge a working
 * relationship, or let VIP be self-granted.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(
  join(ROOT, "supabase", "migrations", "20261023170000_employer_profile_views_v1.sql"),
  "utf8",
);
const rollback = readFileSync(
  join(ROOT, "supabase", "rollbacks", "20261023170000_employer_profile_views_v1.down.sql"),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");
const gateBody = code.slice(code.indexOf("function public.record_worker_profile_view_v1"));
// The plan figures live in ONE helper used by the gate and the projection.
const planBody =
  code.slice(code.indexOf("function public.organization_profile_view_plan_v1")).split("$$;")[0] ?? "";

describe("employer profile view limit (free 3 unique per organization)", () => {
  it("counts unique (organization, worker) pairs, so re-opening is free", () => {
    expect(code).toMatch(/primary key \(organization_id, worker_id\)/);
    expect(gateBody).toMatch(/'already_viewed'/);
    expect(gateBody).toMatch(/on conflict \(organization_id, worker_id\) do nothing/);
  });

  it("computes the limit in SQL from the organization's own state, never from an argument", () => {
    expect(code).toMatch(/record_worker_profile_view_v1\(\s*p_organization_id uuid,\s*p_worker_id uuid\s*\)/);
    expect(planBody).toMatch(/v_free_limit constant int := 3;/);
    expect(gateBody).not.toMatch(/p_limit/);
  });

  it("requires the caller to manage the organization and the worker to be visible", () => {
    expect(gateBody).toMatch(/not public\.manages_organization\(p_organization_id\)/);
    expect(gateBody).toMatch(/not public\.can_view_worker\(p_worker_id\)/);
  });

  it("never charges a working relationship, and that check ignores discoverability", () => {
    expect(gateBody).toMatch(/caller_has_worker_relation_v1\(p_worker_id\)[\s\S]{0,120}'relationship'/);
    const relation = code.slice(
      code.indexOf("function public.caller_has_worker_relation_v1"),
      code.indexOf("organization_access_grants"),
    );
    expect(relation).not.toMatch(/worker_profile_discoverable|is_employer/);
  });

  it("serializes counting per organization so concurrent opens cannot pass the limit", () => {
    expect(gateBody).toMatch(/from public\.organizations where id = p_organization_id for update/);
  });

  it("only a live paid subscription lifts the free limit (no test-mode or manual rows)", () => {
    expect(planBody).toMatch(/s\.status in \('active', 'trialing', 'past_due'\)/);
    expect(planBody).toMatch(/s\.test_mode = false/);
    expect(planBody).toMatch(/not like 'manual\\_%'/);
  });

  it("an ended pilot pass no longer counts as paid (the same rule as effectivePilotPassStatus)", () => {
    expect(planBody).toMatch(
      /and not \(coalesce\(s\.provider_subscription_id, ''\) like 'pilotpass\\_%'\s+and \(s\.current_period_end is null or s\.current_period_end <= now\(\)\)\)/,
    );
  });

  it("an owner-granted VIP is ORGANIZATION-scoped and mode-independent, in SQL and in the web entitlement read (7.27)", () => {
    // SQL: the grant is looked up by the organization only — no billing mode, no person.
    const vip = planBody.slice(planBody.indexOf("from public.organization_access_grants g"), planBody.indexOf("if v_vip"));
    expect(vip).toMatch(/g\.organization_id = p_organization_id and g\.grant_kind = 'vip' and g\.revoked_at is null/);
    expect(vip).not.toMatch(/test_mode|owner_id|auth\.uid/);
    // Web: the organization subject reads the grant with the same server-resolved id, no mode filter.
    const web = join(ROOT, "apps", "web");
    const ent = readFileSync(join(web, "lib", "billing", "effective-entitlements.ts"), "utf8");
    const read = ent.slice(ent.indexOf('.from("organization_access_grants")'), ent.indexOf("vipGrant = activeVipGrant("));
    expect(read).toMatch(/\.eq\("organization_id", subject\.id\)/);
    expect(read).toMatch(/\.eq\("grant_kind", "vip"\)/);
    expect(read).toMatch(/\.is\("revoked_at", null\)/);
    expect(read).not.toMatch(/test_mode|owner_id/);
    expect(ent).toMatch(/manualOverridePlanKey = manualOverridePlanKey \?\? vipOverridePlanKey\(vipGrant\)/);
    // Admin door: the grant is written only through the audited admin RPCs, in the admin's own session.
    const actions = readFileSync(join(web, "lib", "admin", "billing-actions.ts"), "utf8");
    const door = actions.slice(actions.indexOf("export async function grantOrganizationVipAction"));
    expect(door).toMatch(/if \(!\(await isSuperadmin\(\)\)\) return \{ ok: false, reason: "not_admin" \}/);
    expect(door).toMatch(/\.rpc\("set_organization_vip_v1"/);
    expect(door).toMatch(/\.rpc\("revoke_organization_vip_v1"/);
    expect(door).not.toMatch(/createAdminClient|organization_access_grants/);
  });

  it("a free organization is never blocked without a way to pay (owner deferral 2026-10-19)", () => {
    const web = join(ROOT, "apps", "web");
    const page = readFileSync(
      join(web, "app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx"),
      "utf8",
    );
    expect(page).toMatch(
      /personPageViewGate\(\s*await gateWorkerProfileView\(supabase, activeOrganizationId, worker\.id as string\),\s*billingStatePurchasable\(getBillingConfigFor\(activeOrganizationId\)\.state\),\s*\)/,
    );
    const gate = readFileSync(join(web, "lib", "billing", "profile-view-gate.ts"), "utf8");
    expect(gate).toMatch(/if \(gate\.kind === "limit" && !purchasable\) return \{ kind: "open", counted: false \}/);
    // The limit state offers the way to pay.
    expect(page).toMatch(/<Link href="\/pricing"/);
  });

  it("VIP is read-only to the API and written only by a platform admin, with who and when", () => {
    expect(code).toMatch(/revoke all on table public\.organization_access_grants from public, anon, authenticated;/);
    expect(code).toMatch(/grant select on public\.organization_access_grants to authenticated;/);
    expect(code).not.toMatch(/grant (insert|update|delete|all)[^;]*organization_access_grants/);
    expect(code).not.toMatch(/organization_access_grants[^;]*for (insert|update|delete|all)/);
    for (const fn of ["set_organization_vip_v1", "revoke_organization_vip_v1"]) {
      const body = code.slice(code.indexOf(`function public.${fn}`));
      expect(body.slice(0, 900), fn).toMatch(/if uid is null or not public\.is_admin\(\) then/);
    }
    expect(code).toMatch(/set revoked_at = now\(\), revoked_by = uid/);
  });

  it("the person page asks the gate and closes only on an explicit limit answer", () => {
    const web = join(ROOT, "apps", "web");
    const gate = readFileSync(join(web, "lib", "billing", "profile-view-gate.ts"), "utf8");
    expect(gate).toContain('rpc("record_worker_profile_view_v1"');
    expect(gate).toMatch(/r\.allowed === false && r\.reason === "limit_reached"/);
    expect(gate).not.toMatch(/p_limit|display_name/);
    const page = readFileSync(
      join(web, "app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/gateWorkerProfileView\(supabase, activeOrganizationId, worker\.id as string\)/);
    expect(page).toMatch(/if \(viewGate\.kind === "limit"\)/);
    // The own-row redirect runs first: a worker never counts against anyone's plan.
    expect(page.indexOf("redirect(`/${locale}/dashboard/profile`)")).toBeLessThan(page.indexOf("gateWorkerProfileView("));
  });

  it("the limit holds on the DATA: detail fields only after a counted view or without a fixed limit", () => {
    const proj = code.slice(code.indexOf("function public.list_discoverable_worker_profiles_v1")).split("$$;")[0];
    expect(proj).toMatch(/case when d\.unlocked then w\.salary_min_eur end/);
    expect(proj).toMatch(/case when d\.unlocked then w\.own_tools end/);
    expect(proj).toMatch(/from public\.employer_profile_views v[\s\S]*public\.manages_organization\(v\.organization_id\)/);
    expect(proj).toMatch(/pl\.view_limit is null/);
    // card tier stays readable for search; identity never appears in any tier
    const withoutFlag = proj.replace(
      /\(coalesce\(w\.display_name, ''\) \|\| ' ' \|\| coalesce\(w\.headline, ''\)\)/,
      "",
    );
    expect(withoutFlag).not.toMatch(/display_name|headline|availability_note|profile_id uuid|w\.profile_id,/);
    // the plan figures live in ONE helper used by the gate and the projection
    expect(code).toMatch(/function public\.organization_profile_view_plan_v1\(p_organization_id uuid\)/);
    expect(gateBody).toMatch(/from public\.organization_profile_view_plan_v1\(p_organization_id\) pl/);
  });

  it("applies only after the identity split, and its rollback never cascades the shared predicate", () => {
    expect(code).toMatch(/apply 20261018160000_worker_identity_split_v1 first/);
    expect(rollback.replace(/--[^\n]*/g, "")).not.toMatch(/cascade/i);
    expect(rollback).toMatch(/if not exists \(select 1 from pg_policies where qual like '%caller_has_worker_relation_v1%'\)/);
    expect(rollback).toMatch(/create or replace function public\.list_discoverable_worker_profiles_v1/);
  });

  it("a found worker's view is gated and fails closed; a related viewer is never gated", () => {
    const web = join(ROOT, "apps", "web");
    const gate = readFileSync(join(web, "lib", "billing", "profile-view-gate.ts"), "utf8");
    expect(gate).toMatch(/const MISSING_FUNCTION = new Set\(\["42883", "PGRST202"\]\)/);
    expect(gate).toMatch(/if \(code === "22023" \|\| code === "42501"\) return \{ kind: "needs-organization" \}/);
    expect(gate).toMatch(/return \{ kind: "unavailable" \};\s*\}\s*if \(!data/);
    const page = readFileSync(
      join(web, "app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/if \(!nameVisible\) \{[\s\S]*gateWorkerProfileView\(/);
    expect(page).toMatch(/viewGate\.kind === "needs-organization"/);
  });

  it("is a RED, gated, reversible migration — and NOT yet acknowledged as approved", () => {
    expect(sql).toMatch(/^-- RED \(needs-human-gate\)/m);
    expect(sql).toMatch(/NO OWNER APPROVAL EXISTS YET/);
    // The approval marker is added only with the owner's recorded approval (never by an agent).
    expect(sql).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    expect(sql).toMatch(/^-- ROLLBACK: supabase\/rollbacks\/20261023170000_employer_profile_views_v1\.down\.sql$/m);
    expect(code).toMatch(/revoke all on function public\.record_worker_profile_view_v1\(uuid, uuid\) from anon;/);
    for (const obj of [
      "function if exists public.record_worker_profile_view_v1",
      "table if exists public.employer_profile_views",
      "table if exists public.organization_access_grants",
      "function if exists public.caller_has_worker_relation_v1",
      "function if exists public.set_organization_vip_v1",
      "function if exists public.revoke_organization_vip_v1",
    ]) {
      expect(rollback).toContain(`drop ${obj}`);
    }
  });
});
