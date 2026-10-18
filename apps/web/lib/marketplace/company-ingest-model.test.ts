import { describe, expect, it } from "vitest";

import {
  CLASS_TO_ROLE,
  dedupeBatch,
  nameKey,
  normalizeCompany,
  normalizePhone,
  normalizeRegistrationCode,
  webDomainOf,
  type CompanyIngestRow,
} from "./company-ingest-model";

const SRC = { kind: "public_register" as const, ref: "rekvizitai", observedAt: "2026-09-30" };
const row = (over: Partial<CompanyIngestRow>): CompanyIngestRow => ({ name: "Statyba", source: SRC, ...over });

describe("company ingest — normalization", () => {
  it("the weak name key drops legal forms and accents, never the name itself", () => {
    expect(nameKey('UAB „Šiaurės Statyba“')).toBe("siaures statyba");
    expect(nameKey("Nordbygg AB")).toBe("nordbygg");
    expect(nameKey("Budimex Sp. z o.o.")).toBe("budimex");
    expect(normalizeCompany(row({ name: 'UAB „Šiaurės Statyba“' }), 0).displayName).toBe('UAB „Šiaurės Statyba“');
  });

  it("a free-mail domain is never a company identity", () => {
    expect(webDomainOf("https://www.Siaures-Statyba.lt/kontaktai")).toBe("siaures-statyba.lt");
    expect(webDomainOf("info@siaures-statyba.lt")).toBe("siaures-statyba.lt");
    expect(webDomainOf("jonas@gmail.com")).toBeNull();
    expect(webDomainOf("not a domain")).toBeNull();
  });

  it("codes and phones normalize; junk is reported, not guessed", () => {
    expect(normalizeRegistrationCode(" 302-123 456 ")).toBe("302123456");
    expect(normalizePhone("+370 612 34567")).toBe("+37061234567");
    expect(normalizePhone("00370 612 34567")).toBe("+37061234567");
    const bad = normalizeCompany(row({ country: "Atlantis", publicPhone: "12", source: { ...SRC, observedAt: "yesterday" } }), 0);
    expect(bad.problems).toEqual(["unknown_country", "invalid_phone", "invalid_observed_at"]);
  });

  it("agencies stay their own class — never folded into employer", () => {
    expect(CLASS_TO_ROLE.staffing_agency).toBe("workforce_provider");
    expect(CLASS_TO_ROLE.recruitment_agency).toBe("recruitment_partner");
    expect(CLASS_TO_ROLE.direct_employer).toBe("employer");
    const n = normalizeCompany(row({ classes: ["direct_employer", "contractor"] }), 0);
    expect(n.roles).toEqual(["employer", "contractor"]);
  });

  it("every fact carries its source and date", () => {
    const n = normalizeCompany(row({ country: "Lithuania", city: "Vilnius", sector: "construction" }), 0);
    expect(n.country).toBe("LT");
    for (const f of n.facts) {
      expect(f).toMatchObject({ source_kind: "public_register", source_ref: "rekvizitai", observed_at: "2026-09-30" });
    }
    expect(n.facts.map((f) => f.field)).toEqual(["display_name", "country", "city", "sector"]);
  });
});

describe("company ingest — dedupe inside the batch", () => {
  it("a repeated strong key is a duplicate; a repeated name alone is only possible", () => {
    const rows = [
      row({ ref: "a", name: "Alfa UAB", country: "LT", registrationCode: "111222333" }),
      row({ ref: "b", name: "Alfa (dup)", country: "LT", registrationCode: "111 222 333" }),
      row({ ref: "c", name: "Beta", country: "LT" }),
      row({ ref: "d", name: "BETA UAB", country: "LT" }),
      row({ ref: "e", name: "x" }),
    ].map((r, i) => normalizeCompany(r, i));
    expect(dedupeBatch(rows)).toEqual([
      { kind: "candidate" },
      { kind: "duplicate_in_batch", of: "a" },
      { kind: "candidate" },
      { kind: "possible_duplicate_in_batch", of: "c" },
      { kind: "invalid", problems: ["invalid_name"] },
    ]);
  });
});
