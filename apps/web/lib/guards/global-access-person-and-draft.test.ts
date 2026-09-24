import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GLOBAL ACCESS — the person side and the draft side of the rule (2026-09-22).
 *
 * MARKET PRIORITY != ACCESS PERMISSION. #1825 opened the EMPLOYER surfaces
 * (company setup, job location, the demand wizard's criteria select) to every
 * ISO country. Two gates were left behind, both measured before this guard:
 *
 *   1. The onboarding wizard's country select still mapped `ACTIVE_MARKETS`
 *      (10 codes). A person in Ireland, Vietnam, the United States, Saudi
 *      Arabia or the Philippines could not answer the FIRST question the
 *      product asks, while `complete_onboarding` had accepted any code all
 *      along — only the question was gated.
 *   2. "Save as draft" in the demand wizard forwarded no `country`, the draft
 *      allowlist had no key for it, and the draft RPC never touched the
 *      `customer_requests.country` column — the column the prefill reads
 *      back. So a Vietnamese employer's draft continued with no country and
 *      the UI said "Išsaugota." (same silent-loss class as teamSize /
 *      opportunityType).
 *
 * Source pins: a list that orders may never shorten; a draft keeps what the
 * employer picked, on the column the rest of the chain reads.
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8").replace(/\r/g, "");

describe("onboarding country select offers every ISO country, active markets first", () => {
  it("renders countryOptionsForLocale, not a bare ACTIVE_MARKETS map", () => {
    const src = read("components/app/onboarding-wizard.tsx");
    expect(src).toContain('from "@/lib/location/country-options"');
    expect(src).toMatch(/countryOptionsForLocale\(locale\)/);
    expect(src).toMatch(/countryOptions\.map\(\(o\) => \(\s*<option key=\{o\.value\} value=\{o\.value\}>/);
    // The market list may still ORDER the select (inside countryOptionsForLocale);
    // it must not be the thing that is mapped into <option>s here.
    expect(src).not.toMatch(/ACTIVE_MARKETS\.map\(/);
  });
});

describe("a demand draft keeps the picked country on the column the prefill reads", () => {
  it("the wizard's draft leg forwards the country it holds in state", () => {
    const src = read("components/app/demand-request-button.tsx");
    const draftLeg = src.slice(src.indexOf("async function saveAsDraft"), src.indexOf("function applyPrefill"));
    expect(draftLeg).toContain('saveDemandDraftAction("company_request", {');
    expect(draftLeg).toMatch(/country: country \|\| undefined,/);
  });

  it("the draft allowlist carries `country` and the action stamps customer_requests.country", () => {
    const src = read("lib/demand/demand-drafts.ts");
    const allow = src.slice(src.indexOf("company_request: new Set<string>(["), src.indexOf("agency_offer: new Set<string>(["));
    expect(allow).toContain('"country"');
    // ISO-resolved through the ONE canonical resolver — never a substring, never a
    // market-gated subset — and written with the owner-scoped UPDATE the submit path
    // already uses (RLS: profile_id = auth.uid(); status = draft only).
    expect(src).toContain('import { resolveCountryCode } from "@/lib/location/country-model";');
    expect(src).toMatch(/resolveCountryCode\(\(payload as CompanyRequestPayload\)\.country\)/);
    expect(src).toMatch(/\.update\(\{ country: draftCountry \}\)\s*\.eq\("id", draftId\)\s*\.eq\("profile_id", user\.id\)\s*\.eq\("status", "draft"\)/);
  });
});
