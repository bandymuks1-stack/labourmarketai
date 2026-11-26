/**
 * GUARD — owner decision 2026-11-22 (item 2): a demoted owner loses owner
 * rights at once; the organization never loses its last owner; nobody takes
 * control on their own. Static checks on the RED migration
 * 20261122140000_demoted_owner_loses_owner_authority_v1 and its rollback.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const NAME = "20261122140000_demoted_owner_loses_owner_authority_v1";
const up = readFileSync(resolve(ROOT, `supabase/migrations/${NAME}.sql`), "utf8");
const down = readFileSync(resolve(ROOT, `supabase/rollbacks/${NAME}.down.sql`), "utf8");

function body(sql: string, fn: string): string {
  const start = sql.indexOf(`create or replace function public.${fn}`);
  expect(start, fn).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("a demoted owner keeps no owner right", () => {
  it("the role change closes the old role's paths inside the same subtransaction", () => {
    const b = body(up, "membership_change_role_v1");
    expect(b).toContain("select id, organization_id, profile_id, role, status into m");
    expect(b).toMatch(/if p_new_role <> 'owner' then\s+if coalesce\(public\.membership_demote_governance_v1\(\s*m\.organization_id, m\.profile_id, uid, m\.role, p_new_role\) = 'last_owner', false\) then\s+raise exception 'last_owner_membership'/);
    // nobody takes control alone: an admin still may neither touch nor grant owner
    expect(b).toContain("if actor_role = 'admin' and (m.role = 'owner' or p_new_role = 'owner') then");
  });

  it("the owner pointer moves to another active owner, or the demotion is refused", () => {
    const b = body(up, "membership_demote_governance_v1");
    expect(b).toMatch(/if p_from_role = 'owner' then/);
    expect(b).toContain("and m.role = 'owner'\n         and m.status = 'active'\n         and m.profile_id <> p_profile_id");
    expect(b).toMatch(/if v_successor is null then\s+return 'last_owner';/);
    expect(b).toContain("for update");
  });

  it("only governance engagements end, by the new role; employment never", () => {
    const b = body(up, "membership_demote_governance_v1");
    expect(b).toContain("when 'admin'            then array['owner']");
    expect(b).toContain("when 'member'           then array['owner', 'manager', 'external_manager']");
    expect(b).toContain("ec.relationship_slug = any (v_end)");
    expect(b).not.toMatch(/'employee'|'collaborator'/);
  });

  it("the helper has no client grant", () => {
    for (const r of ["public", "anon", "authenticated"]) {
      expect(up).toContain(`revoke all on function public.membership_demote_governance_v1(uuid, uuid, uuid, text, text) from ${r};`);
    }
    expect(up).not.toMatch(/grant execute on function public\.membership_demote_governance_v1/);
  });

  it("a demoted creator loses the creator arm in helpers and in company/agency row policies", () => {
    expect(body(up, "creator_governance_ended_v1")).toContain("and d.role not in ('owner', 'admin'))");
    expect(body(up, "owns_company")).toContain("and not public.company_creator_governance_ended_v1(c)");
    for (const p of ["companies_update", "companies_delete"]) {
      expect(up).toMatch(new RegExp(`alter policy ${p} on public\\.companies\\s+using \\(\\(profile_id = auth\\.uid\\(\\) and not public\\.company_creator_governance_ended_v1\\(id\\)\\) or public\\.is_admin\\(\\)\\)`));
    }
    for (const p of ["agencies_update", "agencies_delete"]) {
      expect(up).toMatch(new RegExp(`alter policy ${p} on public\\.agencies\\s+using \\(\\(profile_id = auth\\.uid\\(\\) and not public\\.agency_creator_governance_ended_v1\\(id\\)\\) or public\\.is_admin\\(\\)\\)`));
    }
  });

  it("no row changes at apply time, and the rollback restores every replaced object", () => {
    const outsideBodies = up.replace(/\$\$[\s\S]*?\$\$;/g, "");
    expect(outsideBodies).not.toMatch(/^\s*(update|delete|insert)\s/im);
    for (const fn of ["membership_change_role_v1", "creator_governance_ended_v1", "owns_company"]) {
      expect(down, fn).toContain(`create or replace function public.${fn}`);
    }
    for (const p of ["companies_update", "companies_delete", "agencies_update", "agencies_delete"]) expect(down).toContain(`alter policy ${p}`);
    expect(down).toContain("drop function if exists public.membership_demote_governance_v1(uuid, uuid, uuid, text, text);");
  });
});
