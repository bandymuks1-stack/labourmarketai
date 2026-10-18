import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AGENCY_CAPABILITY_ROLES, actsAsAgency } from "@/lib/company/agency-capability";
import { ORGANIZATION_ROLES } from "@/lib/product-gate/organization-roles";

/**
 * ONE meaning of "acts as an agency" (owner decision 2026-09-28). Home read
 * it as company type OR a declared workforce role; the chat, the partners
 * page and the two agency definers read company type only — so a
 * construction company that declared workforce_provider was shown
 * "Pakviesti klientą" and then refused. Every surface now asks the same rule,
 * and the SQL twin says the same thing.
 */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");
const MIG = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20260928180000_agency_capability_one_rule_v1.sql"),
  "utf8",
);

describe("the agency rule", () => {
  it("type OR declared workforce role; a construction company can be both", () => {
    expect(actsAsAgency("staffing_agency", [])).toBe(true);
    expect(actsAsAgency("construction", ["employer", "workforce_provider"])).toBe(true);
    expect(actsAsAgency("construction", ["recruitment_partner"])).toBe(true);
    expect(actsAsAgency("construction", ["talent_provider"])).toBe(true);
    expect(actsAsAgency("construction", ["employer"])).toBe(false);
    expect(actsAsAgency(null, [])).toBe(false);
  });

  it("uses only roles from the one owner-locked vocabulary", () => {
    for (const r of AGENCY_CAPABILITY_ROLES) expect(ORGANIZATION_ROLES as readonly string[]).toContain(r);
  });

  it("every agency surface asks the same rule, never company_type alone", () => {
    for (const rel of [
      "lib/conversation/starters.ts",
      "lib/conversation/starter-signals.ts",
      "lib/conversation/agency-workspace.ts",
      "lib/company/organization-doors.ts",
      "lib/agency/bridge-read.ts",
      "app/[locale]/dashboard/company/partners/page.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/actsAsAgency|readActsAsAgency/);
      expect(src, rel).not.toMatch(/companyType (===|!==) "staffing_agency"\)? (\?|&&|\)\s*\{|return)/);
    }
  });

  it("the SQL twin names the same roles and gates both definers after owns_company", () => {
    for (const r of AGENCY_CAPABILITY_ROLES) expect(MIG).toContain(`'${r}'`);
    for (const fn of ["create_agency_client_connection_v1", "submit_agency_candidate_offer_v1"]) {
      const body = MIG.slice(MIG.indexOf(`create or replace function public.${fn}`));
      const owns = body.indexOf("public.owns_company(");
      const rule = body.indexOf("public.company_acts_as_agency(");
      expect(owns, fn).toBeGreaterThan(-1);
      expect(rule, fn).toBeGreaterThan(owns);
      expect(body.slice(0, body.indexOf("$function$;")), fn).not.toMatch(/<> 'staffing_agency'|company_type = 'staffing_agency'\) then/);
    }
  });
});
