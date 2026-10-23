import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { companyCreateDemandSchema } from "@/lib/conversation/company-schemas";
import { getCompanyForm } from "@/lib/conversation/company-forms";
import {
  readStructuredDemandV2,
  sanitizeStructuredDemandV2,
  teamCompositionFor,
} from "./structured-demand-v2";

/**
 * Teams of a stated size are PERSISTED without a migration: the total stays
 * in the existing `customer_requests.team_size` column, and the composition
 * goes into the existing owner-side JSON `payload.structured_v2.team`
 * (worker-facing reads project structured_v2 through a SQL whitelist, so the
 * new key is never exposed). It is kept only while it still explains the
 * number of workers — an edited count drops it, on the server.
 */
describe("structured_v2.team", () => {
  it("is accepted by the canonical schema and read back", () => {
    const v2 = sanitizeStructuredDemandV2({ team: { count: 3, per_team: 4 } });
    expect(v2?.team).toEqual({ count: 3, per_team: 4 });
    expect(readStructuredDemandV2({ structured_v2: v2 })?.team).toEqual({ count: 3, per_team: 4 });
  });

  it("rejects free text and out-of-range values (strict closed shape)", () => {
    expect(sanitizeStructuredDemandV2({ team: { count: 0, per_team: 4 } })).toBeNull();
    expect(sanitizeStructuredDemandV2({ team: { count: 3, per_team: 400 } })).toBeNull();
    expect(sanitizeStructuredDemandV2({ team: { count: 3, per_team: 4, note: "x" } })).toBeNull();
  });

  it("old records without a team stay readable", () => {
    expect(readStructuredDemandV2({ structured_v2: { opportunity_type: "temporary_assignment", meta: { contract_version: 2 } } })?.team).toBeUndefined();
  });
});

describe("teamCompositionFor — only while count × per_team = the number of workers", () => {
  it.each([
    [12, 3, 4, { count: 3, per_team: 4 }],
    [5, 1, 5, { count: 1, per_team: 5 }],
    [10, 3, 4, null], // the person edited the count: the count is the fact
    [null, 3, 4, null],
    [12, null, 4, null],
    [12, 3, null, null],
    [12, 3.5, 4, null],
  ] as const)("teamSize %s, %s × %s", (teamSize, teams, perTeam, expected) => {
    expect(teamCompositionFor(teamSize, teams, perTeam)).toEqual(expected);
  });
});

describe("both write paths carry the composition", () => {
  it("the chat form passes the derived teams to the create-demand action", () => {
    const form = getCompanyForm("company.create-demand");
    const built = form?.build({ description: "Reikia 3 brigadų po 4 žmones", teamSize: "12", teamCount: "3", perTeamSize: "4" });
    expect(built).toMatchObject({ teamSize: 12, teamCount: 3, perTeamSize: 4 });
    expect(companyCreateDemandSchema.safeParse(built).success).toBe(true);
  });

  it("the chat executor sends it as structured_v2.team; the server keeps it only when it explains team_size", () => {
    const WEB = join(__dirname, "..", "..");
    const executor = readFileSync(join(WEB, "lib", "conversation", "company-executors.ts"), "utf8");
    expect(executor).toMatch(/\{ count: input\.teamCount, per_team: input\.perTeamSize \}/);
    expect(executor).toMatch(/\.\.\.\(team \? \{ team \} : \{\}\)/);
    const submit = readFileSync(join(WEB, "lib", "demand", "demand-request.ts"), "utf8");
    expect(submit).toMatch(/teamCompositionFor\(teamSize, sanitizedV2\.team\.count, sanitizedV2\.team\.per_team\)/);
  });

  it("the demand wizard keeps the composition read from the description", () => {
    const WEB = join(__dirname, "..", "..");
    const wizard = readFileSync(join(WEB, "components", "app", "demand-request-button.tsx"), "utf8");
    expect(wizard).toMatch(/s\.teamCount != null && s\.perTeamSize != null/);
    expect(wizard).toMatch(/structuredV2: withTeam\(advWire\)/);
  });
});
