import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A company that described its need on the public /company-need form picks
 * the country from a REQUIRED select, so the intake holds an ISO code. When
 * the company signed in and claimed it, that code was folded into the
 * free-text location ("Göteborg, SE") and the draft, and every need submitted
 * from it, had no `customer_requests.country`: invisible to every country
 * filter. The claim also wrote Lithuanian into the employer's description
 * ("Darbuotojų: N") and marked the language "lt" whatever the UI was.
 * (Swedish employer audit 2026-11-11, CL-2.)
 */
const src = readFileSync(
  join(__dirname, "..", "company", "claim-public-intake.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("claiming a public intake keeps its country", () => {
  it("puts the ISO country in the draft payload and keeps location to the city", () => {
    expect(src).toContain("country: resolveCountryCode(intake.country ?? undefined) ?? undefined,");
    expect(src).not.toMatch(/location: join\(\[intake\.city_or_region, intake\.country\]/);
  });

  it("stamps it on the column, owner-scoped, after the draft exists", () => {
    const draftAt = src.indexOf('rpc("save_demand_draft_v2"');
    const failAt = src.indexOf('return { ok: false, reason: "error" };', draftAt);
    const stampAt = src.indexOf('.from("customer_requests")\n      .update({', src.indexOf("const headcount ="));
    expect(stampAt).toBeGreaterThan(failAt);
    const stamp = src.slice(stampAt, stampAt + 600);
    expect(stamp).toContain('.eq("profile_id", sessionUser.id)');
    expect(stamp).toContain('.eq("status", "draft")');
    // The headcount reaches the wizard too: it reads `team_size`, not the payload.
    expect(stamp).toContain("...(headcount != null ? { team_size: headcount } : {}),");
  });

  it("writes no Lithuanian into the employer's words and no fixed language", () => {
    const code = src.replace(/^\s*(\/\/|\*).*$/gm, "");
    expect(code).not.toMatch(/[ąčęėįšųūž]/i);
    expect(code).not.toContain('p_original_language: "lt"');
    expect(code).toContain("p_original_language: await demandWrittenLanguage()");
    expect(code).toContain("teamSize: intake.headcount != null ? String(intake.headcount) : undefined,");
  });
});
