import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TEAM / BRIGADE DISBAND v1 (owner directive 2026-10-14 §3.3: "brigadų
 * išformavimas išsaugant istoriją"). RED migration 20261014190000 — owner
 * applies it; until then the panel's control answers "not available yet".
 *
 * What must never regress:
 *  - disbanding ARCHIVES (organizations.archived_at) and ENDS memberships
 *    through the canonical lifecycle writer — it never deletes anything;
 *  - the owner's own engagement is left alone (end_org_membership_v1 refuses
 *    the last owner by design; archived orgs are already out of every
 *    workspace read);
 *  - open work blocks it;
 *  - create_team_v1's cap counts ACTIVE brigades only (before: every brigade
 *    ever, so an owner past 20 could never form another — prod walk red);
 *  - anon can never call it.
 */
const ROOT = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const sql = read("supabase/migrations/20261014190000_team_disband_v1.sql");
const down = read("supabase/rollbacks/20261014190000_team_disband_v1.down.sql");
const reader = read("apps/web/lib/company/team-brigades.ts");
const panel = read("apps/web/components/app/team-brigades-panel.tsx");

describe("brigade disband — history kept, nothing deleted", () => {
  it("archives the brigade and ends members through the canonical lifecycle writer", () => {
    expect(sql).toMatch(/set archived_at = now\(\),\s*archived_reason = 'team_disbanded'/);
    expect(sql).toMatch(/public\.end_engagement_lifecycle_v1\(v_ec\.id::text, 'other', 'team_disbanded'\)/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/update public\.engagement_contexts/i);
  });

  it("leaves the owner's own engagement alone", () => {
    expect(sql).toMatch(/ec\.profile_id is distinct from v_team\.owner_profile_id/);
  });

  it("refuses while open work remains", () => {
    expect(sql).toMatch(/team_assignments a[\s\S]{0,80}a\.status = 'active'/);
    expect(sql).toMatch(/team_demand_offers d[\s\S]{0,80}d\.status in \('offered', 'accepted'\)/);
    expect(sql).toMatch(/team_enquiries e[\s\S]{0,80}e\.status = 'created'/);
    expect(sql).toMatch(/return 'has_open_work';/);
  });

  it("is all-or-nothing: a member that cannot be ended rolls everything back", () => {
    expect(sql).toMatch(/exception when sqlstate 'P0001' then\s*(--[^\n]*\n\s*)*return 'member_end_failed';/);
  });

  it("only the owning person can call it; anon cannot", () => {
    expect(sql).toMatch(/o\.owner_profile_id = uid\s*and o\.organization_type = 'team'/);
    expect(sql).toMatch(/revoke all on function public\.disband_team_v1\(uuid\) from anon;/);
    expect(sql).toMatch(/grant execute on function public\.disband_team_v1\(uuid\) to authenticated;/);
  });

  it("the cap of 20 counts active brigades only; the rollback restores the old cap", () => {
    expect(sql).toMatch(/o\.organization_type = 'team'\s*and o\.archived_at is null\) >= 20/);
    expect(down).toMatch(/drop function if exists public\.disband_team_v1\(uuid\);/);
    expect(down).toMatch(/o\.organization_type = 'team'\) >= 20/);
  });

  it("the panel lists active brigades, keeps disbanded ones as history, and confirms in two steps", () => {
    expect(reader).toMatch(/\.eq\("organization_type", "team"\)[\s\S]{0,300}\.is\("archived_at", null\)/);
    expect(reader).toMatch(/\.not\("archived_at", "is", null\)/);
    expect(reader).toMatch(/rpc\(supabase, "disband_team_v1"/);
    expect(panel).toMatch(/team-disband-confirm-/);
    expect(panel).toMatch(/team-brigades-disbanded/);
  });
});
