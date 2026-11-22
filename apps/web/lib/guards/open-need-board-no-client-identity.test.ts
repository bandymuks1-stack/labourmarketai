import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE OPEN NEED BOARD NAMES NO CLIENT (owner decision 2026-11-22).
 *
 * Registered agencies and other providers see open needs — profession,
 * country, start, duration, requirements — with no client identity, and offer
 * without prior approval. 20261122140000 makes the database say so: the v1
 * open reader returns no name, the offerer's own list names the client only
 * after the client answered yes, and the v2 reader has no client column at all.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const WEB = join(ROOT, "apps", "web");
const read = (p: string) => readFileSync(p, "utf8");
const UP = read(join(ROOT, "supabase/migrations/20261122140000_open_need_board_no_client_identity_v1.sql"));
const DOWN = read(join(ROOT, "supabase/rollbacks/20261122140000_open_need_board_no_client_identity_v1.down.sql"));
const OPEN_BASE = read(join(ROOT, "supabase/migrations/20261028123000_synthetic_demand_cross_org_readers_v1.sql"));
const SENT_BASE = read(join(ROOT, "supabase/migrations/20261020010000_demand_company_one_rule_v1.sql"));

function fnBlock(sql: string, name: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$function\\$;\\n`);
  const m = sql.match(re);
  expect(m, `${name} not found`).toBeTruthy();
  return m![0];
}
const NAME_EXPR = "coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), ''))";

describe("the database names no client on the open board", () => {
  it("v1 open reader: same signature, the name column is always empty, nothing else changed", () => {
    const now = fnBlock(UP, "list_open_demand_for_team_offer_v1");
    const before = fnBlock(OPEN_BASE, "list_open_demand_for_team_offer_v1");
    expect(now).not.toContain(NAME_EXPR);
    expect(now).toMatch(/\n\s+null::text,\n\s+cr\.created_at,/);
    // every other line is the prior definition
    const strip = (s: string) => s.replace(/\n\s+-- NO CLIENT IDENTITY[^\n]*\n\s+--[^\n]*\n\s+null::text,/, `\n         ${NAME_EXPR},`);
    expect(strip(now)).toBe(before);
  });

  it("the offerer's own list names the client only after a yes", () => {
    const now = fnBlock(UP, "list_team_demand_offers_for_team_v1");
    expect(now).toContain(`case when o.status in ('accepted', 'assigned')\n              then ${NAME_EXPR}\n         end,`);
    expect(now.split(NAME_EXPR).length - 1).toBe(1);
    expect(fnBlock(SENT_BASE, "list_team_demand_offers_for_team_v1").split("(").length).toBeGreaterThan(5);
  });

  it("v2 has no client, person or free-text column and the v1 caller rule", () => {
    const v2 = fnBlock(UP, "list_open_needs_for_offer_v2");
    const ret = v2.match(/RETURNS TABLE\(([^)]*)\)/)![1]!;
    for (const col of ["company", "profile", "name", "summary", "notes", "description", "location"]) {
      expect(ret, col).not.toMatch(new RegExp(col, "i"));
    }
    expect(v2).not.toMatch(/c\.display_name|c\.legal_name|need_summary|cr\.notes|cr\.location/);
    expect(v2).toMatch(/\bSTABLE SECURITY DEFINER\b/);
    expect(v2).toMatch(/SET search_path TO 'public'/);
    expect(v2).toMatch(/raise exception 'Not authenticated' using errcode = '42501'/);
    expect(v2).toContain("public.manages_organization(p_team_org_id)");
    expect(v2).toContain("c.verification_status = 'verified'");
    expect(v2).toContain("public.demand_company_id_v1(cr.organization_id, cr.profile_id)");
    expect(v2).toContain("public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)");
    expect(v2).toContain("cr.organization_id is distinct from p_team_org_id");
  });

  it("v2 is for signed-in callers only", () => {
    expect(UP).toContain("revoke all on function public.list_open_needs_for_offer_v2(uuid) from public;");
    expect(UP).toContain("revoke all on function public.list_open_needs_for_offer_v2(uuid) from anon;");
    expect(UP).toContain("grant execute on function public.list_open_needs_for_offer_v2(uuid) to authenticated;");
  });

  it("writes no row and widens nothing", () => {
    const code = UP.replace(/--[^\n]*/g, "");
    expect(code).not.toMatch(/\b(insert into|update public\.|delete from|alter table|create policy|drop policy|grant select)\b/i);
  });

  it("the rollback restores both v1 bodies verbatim and drops v2", () => {
    expect(DOWN).toContain("drop function if exists public.list_open_needs_for_offer_v2(uuid);");
    expect(DOWN).toContain(fnBlock(OPEN_BASE, "list_open_demand_for_team_offer_v1"));
    expect(DOWN).toContain(fnBlock(SENT_BASE, "list_team_demand_offers_for_team_v1"));
  });
});

describe("the app shows what a need is, never whose it is", () => {
  const form = read(join(WEB, "components/app/team-demand-offer-form.tsx"));
  const svc = read(join(WEB, "lib/company/team-offer.ts"));
  const model = read(join(WEB, "lib/market/team-offer-model.ts"));

  it("reads v2 and falls back to v1 only while v2 is missing", () => {
    expect(svc).toMatch(/readRows\("list_open_needs_for_offer_v2"[\s\S]*?if \(v2\.status !== "needs_migration"\) return v2;[\s\S]*?readRows\("list_open_demand_for_team_offer_v1"/);
  });

  it("the offerable-need model has no client field, so a v1 name cannot reach the screen", () => {
    const iface = model.match(/export interface OfferableDemand \{[\s\S]*?\n\}/)![0];
    expect(iface).not.toMatch(/company|client/i);
    const parse = model.match(/export function parseOfferableDemand[\s\S]*?\n\}/)![0];
    expect(parse).not.toMatch(/company_name/);
  });

  it("the open-need choice and its facts carry no client", () => {
    expect(form).not.toMatch(/d\.companyName/);
    expect(form).toMatch(/data-testid=\{`team-offer-need-facts-\$\{teamId\}`\}/);
  });
});
