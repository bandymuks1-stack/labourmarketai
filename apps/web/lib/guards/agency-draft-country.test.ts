import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * An agency drafting a need FOR its client typed the country into a free
 * two-letter field: "se" (never upper-cased) or nothing, stored as-is by
 * draft_client_need_v1 (Swedish employer audit 2026-11-11, CL-4). The form now
 * offers the ISO list and requires a choice; the action resolves it to ISO and
 * refuses a draft without one.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");

describe("an agency-drafted need carries an ISO country", () => {
  it("the form offers the ISO list and requires a choice", () => {
    const src = read("components", "app", "agency-delegation-panel.tsx");
    const at = src.indexOf('data-testid="agency-draft-country"');
    const field = src.slice(src.lastIndexOf("<select", at), src.indexOf("</select>", at));
    expect(field).toContain('name="country"');
    expect(field).toContain("required");
    expect(field).toContain("countryOptionsForLocale(locale).map(");
    expect(src).not.toMatch(/name="country"\s+maxLength=\{2\}/);
  });

  it("the action resolves the country to ISO and refuses a draft without one", () => {
    const src = read("lib", "agency", "bridge-actions.ts");
    const fn = src.slice(src.indexOf("export async function draftClientNeedAction"));
    expect(fn).toContain('const country = resolveCountryCode(String(formData.get("country") ?? ""));');
    expect(fn).toMatch(/\|\| !country\) \{\s*return \{ status: "invalid" \};/);
    expect(fn).toContain("p_country: country,");
  });
});
