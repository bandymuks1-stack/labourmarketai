import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getSafeReturnPath, isSafeReturnPath } from "@/lib/auth/redirect";
import {
  COMPANY_NEED_RETURN_MAX_CHARS,
  companyNeedReturnPath,
  parseCompanyNeedPrefill,
} from "@/lib/staffing/company-need-prefill";

/**
 * SIGNING IN FROM THE PUBLIC NEED FORM COMES BACK TO IT, WITH WHAT WAS TYPED
 * (employer path P0 2026-11-15). The form's sign-in and sign-up links had no
 * `next`, so a person who signed in mid-form landed on the dashboard and the need
 * they had typed was gone.
 */

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";

const TYPED = {
  company_name: "UAB Pavyzdys",
  contact_person: "Vardenis Pavardenis",
  contact_email: "vardenis@example.com",
  profession: "",
  country: "SE",
  number_of_workers: "4",
  expected_duration: "3 mėnesiai",
  description: "Reikia keturių plytelių klojėjų objektui Stokholme.",
  engagement_model: "subcontracting",
};

describe("the return path carries the typed need as the form's own prefill", () => {
  it("what was typed reads back through the form's prefill parser", () => {
    const value = companyNeedReturnPath("lt", form(TYPED), "?from=landing_entry");
    const [path, query] = value.split("?");
    expect(path).toBe("/lt/company-need");
    expect(parseCompanyNeedPrefill(new URLSearchParams(query))).toEqual({
      country: "SE",
      numberOfWorkers: 4,
      expectedDuration: "3 mėnesiai",
      description: "Reikia keturių plytelių klojėjų objektui Stokholme.",
      engagement: "subcontracting",
      entry: "landing_entry",
    });
  });

  it("never a name, an e-mail address or a phone number", () => {
    const value = companyNeedReturnPath("lt", form({ ...TYPED, contact_phone: "+37060000000" }));
    for (const leak of ["UAB", "Pavyzdys", "Vardenis", "example.com", "%40", "3706", "company_name", "contact_"]) {
      expect(value, leak).not.toContain(leak);
    }
  });

  it("untouched defaults are not carried; an empty form returns to the bare form", () => {
    expect(companyNeedReturnPath("en", form({ number_of_workers: "1", engagement_model: "employment" }))).toBe(
      "/en/company-need",
    );
  });

  it("only a valid page id travels as `from`", () => {
    expect(companyNeedReturnPath("en", form({}), "?from=Bad%20Value")).toBe("/en/company-need");
    expect(companyNeedReturnPath("en", form({}), "?from=calculator")).toBe("/en/company-need?from=calculator");
  });

  it("a long text is shortened so the return always survives sign-in, other answers intact", () => {
    // Lithuanian letters grow sixfold when encoded; this is the worst realistic case.
    const long = "ąčęėįšųūž ".repeat(120);
    const value = companyNeedReturnPath("lt", form({ ...TYPED, description: long }));
    expect(value.length).toBeLessThanOrEqual(COMPANY_NEED_RETURN_MAX_CHARS);
    expect(isSafeReturnPath(value)).toBe(true);
    expect(getSafeReturnPath(value, "lt")).toBe(value);
    const prefill = parseCompanyNeedPrefill(new URLSearchParams(value.split("?")[1]));
    expect(prefill.country).toBe("SE");
    expect(prefill.numberOfWorkers).toBe(4);
    expect(prefill.description && long.startsWith(prefill.description)).toBe(true);
  });

  it("an ordinary need passes the sign-in return rules unchanged", () => {
    const value = companyNeedReturnPath("en", form(TYPED), "?from=landing_entry");
    expect(getSafeReturnPath(value, "en")).toBe(value);
  });
});

describe("the public need form's links and e-mail field", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, "..", "..", rel), "utf8");

  it("sign-up and sign-in both return to the form, carrying the typed need", () => {
    const page = read("app/[locale]/(marketing)/company-need/page.tsx");
    expect(page).toMatch(/<CompanyNeedAuthLinks locale=\{locale\}/);
    expect(page).not.toMatch(/relPath=\{`\/\$\{locale\}\/auth\/(signup|login)`\}/);
    const links = read("components/app/company-need-auth-links.tsx");
    expect(links).toMatch(/\/auth\/\$\{door\}\?next=\$\{encodeURIComponent\(next\)\}/);
    expect(links).toMatch(/companyNeedReturnPath\(locale, read, window\.location\.search\)/);
  });

  it("the required e-mail field is not described as optional", () => {
    const formSrc = read("components/app/company-need-form.tsx");
    expect(formSrc).toMatch(/name="contact_email" required/);
    expect(formSrc).not.toMatch(/contactEmailHelp/);
    for (const locale of ["en", "lt", "de", "nl", "pl", "ru", "sv"]) {
      const catalog = JSON.parse(read(`messages/${locale}.json`)) as { companyNeed?: Record<string, unknown> };
      expect(catalog.companyNeed?.contactEmailHelp, locale).toBeUndefined();
    }
  });
});
