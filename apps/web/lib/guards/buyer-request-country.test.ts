import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * The buyer request form took the country as free text, up to 100
 * characters: "Sweden", "Švedija" or nothing at all. No country filter can
 * match a name, and an empty field stored NULL (Swedish employer audit
 * 2026-11-11, CL-3). The form now offers the ISO list and the server stores
 * only a resolved ISO code, refusing anything else, so a request made through
 * any caller of the action gets the same rule.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");

describe("a buyer request carries an ISO country", () => {
  it("the form offers the ISO list and requires a choice", () => {
    const src = read("components", "app", "buyer-requests-section.tsx");
    const at = src.indexOf('data-testid="buyer-requests-field-country"');
    const field = src.slice(src.lastIndexOf("<select", at), src.indexOf("</select>", at));
    expect(field).toContain('name="country"');
    expect(field).toContain("required");
    expect(field).toContain("countryOptions.map(");
    expect(src).not.toMatch(/type="text"\s+name="country"/);
    expect(read("app", "[locale]", "dashboard", "buyer", "page.tsx")).toContain(
      "countryOptions={countryOptionsForLocale(locale)}",
    );
  });

  it("the server stores only a resolved ISO code and refuses a request without one", () => {
    const src = read("lib", "buyer", "customer-requests.ts");
    expect(src).toContain("const country = resolveCountryCode(input.country ?? null);");
    expect(src).toMatch(/if \(!country\) \{\s*return \{ kind: "invalid"/);
    expect(src).toContain("p_country: country,");
    expect(src).not.toContain("p_country: input.country");
  });

  it("the placeholder asks for a choice and names no country", () => {
    for (const l of activeLocales) {
      const v = JSON.parse(read("messages", `${l}.json`)).roleDashboards.buyer.requests.fieldCountryPlaceholder;
      expect(v, l).toBeTruthy();
      expect(v, l).not.toMatch(/\bLT\b/);
    }
  });
});
