import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-9 (2026-09-19 completion audit): a roster relationship can be ENDED —
 * by the worker who accepted it (consent withdrawn) and by the owner of the
 * company/agency (roster removal). Since R-1 nothing but the accept/assign
 * RPCs can write `company_workers` / `agency_workers`, and none of them
 * writes `status = 'removed'`; the worker could see the link nowhere and end
 * it nowhere.
 *
 * THE WRITE IS RED (new SECURITY DEFINER function) and lives in
 * supabase/migrations/20260919150000_end_roster_link_v1.sql, applied only
 * after the owner's approval. Dry run on production inside an aborted
 * transaction (2026-09-19): invite → the worker accepts (roster row 1,
 * employee context 1) → stranger → not_found → the WORKER ends it →
 * removed/self, engagement_ended=true → again → already_removed →
 * caller_manages_worker_by_roster = false for the owner → owner (admin) ends
 * the real row → removed → wrong kind → not_found → after: removed=1,
 * active employee context=0. Function absent and rows untouched afterwards.
 *
 * This guard pins what is true regardless of apply state.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");
const FILE = "20260919150000_end_roster_link_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${FILE}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${FILE}.down.sql`);
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("R-9 migration — one gated end for a roster link", () => {
  const raw = readFileSync(MIGRATION, "utf8");
  const sql = strip(raw);

  it("carries the human-gate annotation (RED, never auto-merged)", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/m);
  });

  it("creates exactly ONE function; touches no table, policy or grant beyond the function's own", () => {
    const defs = sql.match(/create or replace function public\.([a-z_0-9]+)/gi) ?? [];
    expect(defs).toEqual(["create or replace function public.end_roster_link_v1"]);
    expect(sql).not.toMatch(/create policy|drop policy|alter table|create table|delete from/i);
    expect(sql).not.toMatch(/grant[^;]*\bto (anon|public)\b/i);
  });

  it("authority ladder: admin, the owner of THAT company/agency, or the subject worker — anyone else gets not_found", () => {
    expect(sql).toMatch(/if public\.is_admin\(\) then\s*v_capacity := 'admin';/);
    expect(sql).toMatch(/p_kind = 'company' and public\.owns_company\(p_org_legacy_id\)/);
    expect(sql).toMatch(/p_kind = 'agency'\s+and public\.owns_agency\(p_org_legacy_id\)/);
    expect(sql).toMatch(/v_profile is not null and v_profile = uid then\s*v_capacity := 'self';/);
    // The no-standing branch is indistinguishable from a missing link.
    const ladder = sql.slice(sql.indexOf("if public.is_admin()"), sql.indexOf("if v_status = 'removed'"));
    expect(ladder).toMatch(/else\s*return jsonb_build_object\('outcome', 'not_found'\);/);
    expect(ladder).not.toMatch(/not_authorized/);
  });

  it("never deletes: status → 'removed', review cleared, the employee engagement ended in the same transaction, audited with capacity", () => {
    expect(sql).toMatch(/update public\.company_workers\s+set status = 'removed', journal_review_enabled = false/);
    expect(sql).toMatch(/update public\.agency_workers\s+set status = 'removed', journal_review_enabled = false/);
    expect(sql).toMatch(/update public\.engagement_contexts\s+set status = 'ended'/);
    expect(sql).toMatch(/relationship_slug = 'employee'\s+and status = 'active'/);
    expect(sql).toMatch(/'actor_capacity', v_capacity/);
    expect(sql).toMatch(/'self_initiated', \(v_profile = uid\)/);
    expect(sql).not.toMatch(/delete from/i);
    // Project assignments have their own end path and are not touched here.
    expect(sql).not.toMatch(/project_worker_assignments/);
  });

  it("is idempotent and rejects an unknown kind before reading", () => {
    expect(sql).toMatch(/if v_status = 'removed' then\s*return jsonb_build_object\('outcome', 'already_removed'\)/);
    expect(sql.indexOf("'invalid'")).toBeLessThan(sql.indexOf("for update"));
  });

  it("is reversible: the rollback drops exactly that function", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = strip(readFileSync(ROLLBACK, "utf8"));
    expect(down).toMatch(/drop function if exists public\.end_roster_link_v1\(text, uuid, uuid, text\)/);
    expect(down).not.toMatch(/update public|delete from|alter table|create policy/i);
  });
});

describe("R-9 application — both sides reach the ONE write, honestly gated", () => {
  const action = read("lib/company/roster-link-end-actions.ts");
  const control = read("components/app/roster-link-end.tsx");
  const links = read("lib/company/team-links.ts");
  const profile = read("app/[locale]/dashboard/profile/page.tsx");
  const roster = read("components/app/company-workers-section.tsx");

  it("the action calls ONLY end_roster_link_v1, validates the form, and degrades to needs_migration", () => {
    expect(action).toMatch(/\.rpc\("end_roster_link_v1", \{/);
    expect(action).not.toMatch(/\.from\("(company_workers|agency_workers|engagement_contexts)"\)/);
    expect(action).toMatch(/\(kind !== "company" && kind !== "agency"\)/);
    expect(action).toMatch(/!UUID_RX\.test\(orgLegacyId\)/);
    expect(action).toMatch(/MIGRATION_MISSING\.has\(error\.code \?\? ""\)\) return \{ ok: false, code: "needs_migration" \}/);
  });

  it("authority is never a prop: `side` picks sentences only; the RPC decides", () => {
    expect(control).toMatch(/side: "self" \| "owner"/);
    expect(control).not.toMatch(/owns|isOwner|canEnd|allowed/);
    expect(control).toMatch(/action=\{submit\}/);
    // Two steps, a reason field, pending + alert surfaces.
    expect(control).toMatch(/data-testid="roster-link-end-open"/);
    expect(control).toMatch(/aria-busy=\{pending\}/);
    expect(control).toMatch(/role="alert"/);
  });

  it("the worker's own links are read RLS-only, bounded, in the profile's existing parallel stage", () => {
    expect(links).toMatch(/\.from\("company_workers"\)[^;]*workers!inner\(profile_id\)[^;]*\.eq\("workers\.profile_id", userId\)[^;]*\.eq\("status", "active"\)[^;]*\.limit\(TEAM_LINKS_LIMIT\)/);
    expect(links).toMatch(/\.from\("agency_workers"\)[^;]*\.limit\(TEAM_LINKS_LIMIT\)/);
    expect(links).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
    expect(profile).toMatch(/myOrgEvidence,\s*myTeamLinks,\s*\] = await Promise\.all\(/);
    expect(profile).toMatch(/listMyTeamLinks\(supabase, user\.id\),/);
    expect(profile).toMatch(/<TeamLinkWithdrawals result=\{myTeamLinks\} \/>/);
  });

  it("the owner's roster rows carry the same control, keyed on the row's own company", () => {
    expect(roster).toMatch(/<RosterLinkEndControl\s+kind="company"\s+orgLegacyId=\{w\.companyId\}\s+workerId=\{w\.workerId\}\s+side="owner"/);
  });

  it("copy exists in every active locale and says leaving/removing is not deletion", () => {
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      const m = JSON.parse(read(`messages/${loc}.json`)).rosterLinkEnd;
      for (const k of ["title", "hint", "openSelf", "openOwner", "confirmSelf", "confirmOwner", "reasonLabel", "submit", "cancel", "doneSelf", "doneOwner", "needsMigration", "notFound", "failed", "readFailed", "since", "unnamedOrganization"]) {
        expect(typeof m[k], `${loc}.${k}`).toBe("string");
        expect(m[k].trim().length, `${loc}.${k}`).toBeGreaterThan(0);
      }
      expect(m.since).toMatch(/\{date\}/);
    }
  });
});
