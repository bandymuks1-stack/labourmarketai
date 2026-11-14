import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * A company need saved without a country is invisible to every country
 * filter — the worker board, agency offers and search all read
 * `customer_requests.country`. The wizard's country picker was optional and
 * the location field said "Location or country", so a company typing
 * "Stockholm, Sweden" there believed the market was set.
 *
 * The country is never guessed (owner rule), so the wizard asks for it:
 * it is required before the review step and before create, and the location
 * field asks only for the city or site.
 */
const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("company-need wizard requires the country", () => {
  const wizard = read("components/app/demand-request-button.tsx");

  it("blocks the step into review while no country is chosen", () => {
    expect(wizard).toMatch(/const countryOk = country !== "";/);
    expect(wizard).toMatch(/if \(step === 2 && !countryOk\) \{\s*setShowCountryError\(true\);\s*return;/);
  });

  it("refuses to create without a country and sends the person back to it", () => {
    expect(wizard).toMatch(/if \(!countryOk\) \{\s*setStep\(2\);\s*setShowCountryError\(true\);\s*return;/);
    expect(wizard).toMatch(/disabled=\{state === "sending" \|\| !descOk \|\| !estimateOk \|\| !countryOk\}/);
  });

  it("says why, next to the picker", () => {
    expect(wizard).toContain('data-testid="demand-country-error"');
    expect(wizard).toContain('t("form.countryRequired")');
  });

  it("every active locale explains it, and the location field no longer asks for a country", () => {
    for (const l of activeLocales) {
      const form = JSON.parse(read(`messages/${l}.json`)).auth.dashboard.wow.demand.form;
      expect(form.countryRequired, `${l} countryRequired`).toBeTruthy();
      expect(form.locationPlaceholder, `${l} placeholder still names a country`).not.toMatch(
        /Lithuania|Lietuva|Литва|Litauen|Litwa|Litouwen|Vilni|Вильн|Wilno/,
      );
    }
    // Doctrine §2.4: a new UI key lands in all 11 catalogs in the same PR.
    for (const l of ["sv", "da", "no", "et", "lv"]) {
      const form = JSON.parse(read(`messages/${l}.json`)).auth.dashboard.wow.demand.form;
      expect(form?.countryRequired, `${l} countryRequired`).toBeTruthy();
    }
    const en = JSON.parse(read("messages/en.json")).auth.dashboard.wow.demand.form;
    expect(en.locationLabel).not.toMatch(/country/i);
  });

  it("the chat draft leg keeps the country the person entered", () => {
    const exec = read("lib/conversation/company-executors.ts");
    const draft = exec.slice(exec.indexOf('saveDemandDraftAction("company_request", {'));
    expect(draft.slice(0, draft.indexOf("});"))).toContain("country: input.country ?? undefined,");
  });

  it("the end-to-end walks choose a country instead of skipping it", () => {
    const helper = read("tests/e2e/demand-country.ts");
    expect(helper).toContain("demand-country-select");
    for (const spec of ["tests/e2e/demand-flow.spec.ts", "tests/e2e/prod-company-chain.spec.ts", "tests/e2e/signup-isolated.spec.ts"]) {
      expect(read(spec), spec).toContain("chooseDemandCountryIfEmpty(page)");
    }
  });
});
