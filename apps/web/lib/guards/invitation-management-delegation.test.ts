import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: invitation management by PERMISSION, never by job title (owner
 * direction 2026-09-24). RED, owner-approved (#1875); APPLIED 2026-09-24,
 * ledger 20260924120147 — the file is the applied text, never edited again.
 *
 * Pins the shape of 20260924150000_invitation_management_delegation_v1:
 *   · ONE per-person delegation flag on the canonical membership row, default
 *     false, written only by ONE audited owner/admin command (no backfill);
 *   · the ONE org-invitation authority (`invitation_org_authority_v1`) admits
 *     the owner, an active owner/admin membership or a delegated member — no
 *     manager / external_manager title, no engagement arm;
 *   · create_invitation_v1/v2 change exactly ONE expression each (the org
 *     branch); their bodies are otherwise the previous migration's text, and
 *     join_project / invite_to_demand keep their own authority;
 *   · the rollback refuses while a delegation is active and restores the
 *     previous bodies verbatim.
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");

const NAME = "20260924150000_invitation_management_delegation_v1";
const up = readRepo(`supabase/migrations/${NAME}.sql`);
const down = readRepo(`supabase/rollbacks/${NAME}.down.sql`);

/** The last `create or replace function public.<fn>(...) ... $$;` statement. */
function fnStatement(src: string, fn: string): string {
  const re = new RegExp(
    `create or replace function public\\.${fn}\\([\\s\\S]*?\\bas\\s+(\\$[a-z_]*\\$)[\\s\\S]*?\\1\\s*;`,
    "gi",
  );
  const all = src.match(re);
  expect(all, `${fn} present`).not.toBeNull();
  return all![all!.length - 1];
}
const body = (stmt: string) => stmt.replace(/^[\s\S]*?\bas\s+(\$[a-z_]*\$)([\s\S]*?)\1\s*;$/i, "$2");

const PREVIOUS = {
  create_invitation_v1: "supabase/migrations/20260827200000_relationship_invitations_v1.sql",
  create_invitation_v2: "supabase/migrations/20260917120000_universal_invitation_referral_network_v1.sql",
  invitation_org_authority_v1: "supabase/migrations/20260817121000_invitation_org_authority_v1.sql",
} as const;

describe("Guard: invitation delegation migration (RED draft)", () => {
  it("adds ONE per-person flag, default false, and delegates nobody", () => {
    expect(up).toMatch(
      /alter table public\.company_memberships\s+add column if not exists manages_invitations boolean not null default false;/,
    );
    // No backfill: outside function bodies there is no data write at all.
    const outsideBodies = up.replace(/\bas\s+(\$[a-z_]*\$)[\s\S]*?\1/gi, "");
    expect(outsideBodies).not.toMatch(/\b(update|insert into|delete from)\s+public\./i);
  });

  it("the org-invitation authority is owner / owner-admin / delegated — never a title", () => {
    const b = body(fnStatement(up, "invitation_org_authority_v1"));
    expect(b).toMatch(/o\.owner_profile_id = auth\.uid\(\)/);
    expect(b).toMatch(/m\.status = 'active'/);
    expect(b).toMatch(/m\.role in \('owner', 'admin'\) or m\.manages_invitations/);
    expect(b).not.toMatch(/manager|manages_organization|engagement_contexts/);
  });

  for (const fn of ["create_invitation_v1", "create_invitation_v2"] as const) {
    it(`${fn}: exactly the org-branch expression changes; the rest is the previous body`, () => {
      const now = body(fnStatement(up, fn));
      const before = body(fnStatement(readRepo(PREVIOUS[fn]), fn));
      expect(now.match(/public\.invitation_org_authority_v1\(p_organization_id\)/g)?.length).toBe(1);
      expect(now).not.toMatch(/public\.manages_organization\(p_organization_id\)/);
      expect(
        now.replace(
          "public.invitation_org_authority_v1(p_organization_id)",
          "public.manages_organization(p_organization_id)",
        ),
      ).toBe(before);
    });
  }

  it("project and demand invitations keep their own authority", () => {
    const v2 = body(fnStatement(up, "create_invitation_v2"));
    expect(v2).toMatch(/public\.can_manage_project\(p_project_id\)/);
    expect(v2).toMatch(/public\.manages_organization\(v_req_org\)/);
  });

  it("company worker invitations: owner/admin or the delegated person, through one definer helper", () => {
    const helper = body(fnStatement(up, "invitation_company_authority_v1"));
    expect(helper).toMatch(/o\.legacy_company_id = p_company_id/);
    expect(helper).toMatch(/public\.invitation_org_authority_v1\(o\.id\)/);
    const invite = body(fnStatement(up, "invite_company_worker"));
    expect(invite).toMatch(
      /if not \(public\.owns_company\(p_company_id\)\s+or public\.invitation_company_authority_v1\(p_company_id\)\) then/,
    );
    expect(up).toMatch(
      /alter policy company_worker_invitations_select[\s\S]*?or public\.invitation_company_authority_v1\(company_id\)\s*\);/,
    );
  });

  it("the grant is ONE audited owner/admin command for an active non-owner/admin member", () => {
    const b = body(fnStatement(up, "membership_set_invitation_manager_v1"));
    expect(b).toMatch(/actor_role not in \('owner', 'admin'\)/);
    expect(b).toMatch(/m\.status <> 'active'/);
    expect(b).toMatch(/m\.role in \('owner', 'admin'\) then return 'held_by_role'/);
    expect(b).toMatch(/insert into public\.audit_logs/);
    expect(b.match(/\bupdate public\.company_memberships\b/g)?.length).toBe(1);
    expect(b).toMatch(/set manages_invitations = p_enabled/);
  });

  it("every function it defines is EXECUTE for authenticated only", () => {
    const defined = [...up.matchAll(/create or replace function public\.([a-z_0-9]+)\(/g)].map((m) => m[1]);
    expect(new Set(defined)).toEqual(
      new Set([
        "invitation_org_authority_v1",
        "invitation_company_authority_v1",
        "create_invitation_v1",
        "create_invitation_v2",
        "invite_company_worker",
        "membership_set_invitation_manager_v1",
      ]),
    );
    for (const fn of defined) {
      expect(up, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`));
      expect(up, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`));
      expect(up, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    }
    expect(up).not.toMatch(/grant [^;]* to (anon|public)\b/i);
    expect(up).not.toMatch(/grant (update|insert|delete|all)[^;]*on (table )?public\.company_memberships/i);
  });

  it("the rollback refuses while a delegation is active and restores the previous bodies verbatim", () => {
    expect(down).toMatch(/if exists \(select 1 from public\.company_memberships where manages_invitations\) then\s+raise exception 'ROLLBACK REFUSED/);
    for (const fn of Object.keys(PREVIOUS) as (keyof typeof PREVIOUS)[]) {
      expect(body(fnStatement(down, fn)), fn).toBe(body(fnStatement(readRepo(PREVIOUS[fn]), fn)));
    }
    expect(body(fnStatement(down, "invite_company_worker"))).toMatch(
      /if not public\.owns_company\(p_company_id\) then\s+return 'not_owner';/,
    );
    expect(down).toMatch(/drop function if exists public\.membership_set_invitation_manager_v1\(uuid, boolean\);/);
    expect(down).toMatch(/drop function if exists public\.invitation_company_authority_v1\(uuid\);/);
    expect(down).toMatch(/alter table public\.company_memberships drop column if exists manages_invitations;/);
  });
});

describe("Guard: invitation delegation — the app half uses the one command and the one flag", () => {
  const web = (rel: string) => readFileSync(resolve(root, rel), "utf8");

  it("the grant goes through membership_set_invitation_manager_v1 only, from a stale-refusing action", () => {
    const memberships = web("lib/company/memberships.ts");
    expect(memberships).toMatch(/callCommand\("membership_set_invitation_manager_v1", \{\s*p_membership_id: membershipId,\s*p_enabled: enabled,\s*\}\)/);
    const actions = web("lib/company/membership-actions.ts");
    const action = actions.slice(actions.indexOf("export async function setMembershipInvitationManagerAction"));
    const body = action.slice(0, action.indexOf("\nexport async function"));
    expect(body.indexOf("refuseStaleWorkspace(")).toBeGreaterThan(-1);
    expect(body.indexOf("refuseStaleWorkspace(")).toBeLessThan(body.indexOf("setMembershipInvitationManager("));
    expect(body).toMatch(/membershipBelongsToOrg\(membershipId, orgId\)/);
    // No app code writes the flag directly.
    expect(`${memberships}\n${actions}`).not.toMatch(/\.update\([^)]*manages_invitations/);
  });

  it("the member's own flag feeds canManageInvitations; a title never does", () => {
    const ctx = web("lib/company/employer-company-context.ts");
    expect(ctx).toMatch(/readMembership\("role, manages_invitations"\)/);
    expect(ctx).toMatch(/invitationDelegate = memberRow\?\.manages_invitations === true/);
    const authority = web("lib/company/organization-authority.ts");
    expect(authority).toMatch(/input\.invitationDelegate === true/);
  });

  it("the invite panel offers exactly the organizations invitation_org_authority_v1 admits", () => {
    const managed = web("lib/company/managed-organizations.ts");
    const fn = managed.slice(managed.indexOf("export async function getInvitationOrganizations"));
    expect(fn).toMatch(/getGovernedOrganizations\(\)/); // owned + owner/admin
    expect(fn).toMatch(/\.eq\("manages_invitations", true\)/); // + delegated
    expect(fn).toMatch(/withoutArchivedOrganizations/);
    // Any delegated member — a plain `member` included, who opens no employer
    // surface — reaches their organization here: no role filter on the grant.
    expect(fn).not.toMatch(/"manager"|"external_manager"|"member"/);
    const network = web("app/[locale]/dashboard/network/page.tsx");
    expect(network).toContain("organizations={inviteOrganizations}");
  });
});

