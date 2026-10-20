import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A NEED'S COMPANY IS ITS OWN ORGANIZATION'S COMPANY — one rule, not five.
 *
 * Five SECURITY DEFINER functions found a need's company through the PERSON
 * who posted it (`companies.profile_id = customer_requests.profile_id`). A
 * person who owns several companies then saw each need once per company,
 * under the wrong name, with the wrong verification state (production
 * 2026-10-20: the agency's team board returned 19 rows for 15 needs). Since
 * 20261020010000 every one of them resolves the company through
 * `demand_company_id_v1(organization_id, profile_id)`.
 */
const MIG = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
const ONE_RULE = "20261020010000_demand_company_one_rule_v1.sql";
const FUNCTIONS = [
  "list_open_demand_for_workers",
  "list_open_demand_for_team_offer_v1",
  "list_team_demand_offers_for_team_v1",
  "offer_team_to_demand_v1",
  "contact_demand_owner_v1",
];
const PERSON_JOIN = /companies\s+c\s+on\s+c\.profile_id\s*=\s*cr\.profile_id/i;
/** SQL without its `--` comments (the header DESCRIBES the old join). */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("one demand-company rule", () => {
  const sql = code(readFileSync(join(MIG, ONE_RULE), "utf8"));

  it("the helper resolves through the need's organization first", () => {
    expect(sql).toMatch(/create or replace function public\.demand_company_id_v1/);
    expect(sql).toMatch(/select o\.legacy_company_id from public\.organizations o where o\.id = p_organization_id/);
    expect(sql).toMatch(/revoke all on function public\.demand_company_id_v1\(uuid, uuid\) from public, anon, authenticated/);
  });

  it("all five functions use it and none joins the company by the poster", () => {
    for (const fn of FUNCTIONS) {
      expect(sql.includes(`FUNCTION public.${fn}(`), fn).toBe(true);
    }
    expect((sql.match(/public\.demand_company_id_v1\(cr\.organization_id, cr\.profile_id\)/g) ?? []).length).toBe(5);
    expect(sql).not.toMatch(PERSON_JOIN);
  });

  it("an org-less need resolves to NO company (v2) — attribution is never invented", () => {
    const v2 = code(readFileSync(join(MIG, "20261020015000_demand_company_one_rule_v2.sql"), "utf8"));
    expect(v2).toMatch(/select o\.legacy_company_id from public\.organizations o where o\.id = p_organization_id/);
    expect(v2).not.toMatch(/companies/);
  });

  it("no later migration brings the person join back", () => {
    const later = readdirSync(MIG).filter((f) => f > ONE_RULE && f.endsWith(".sql"));
    for (const f of later) {
      expect(code(readFileSync(join(MIG, f), "utf8")), f).not.toMatch(PERSON_JOIN);
    }
  });
});
