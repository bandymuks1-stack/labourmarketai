import { describe, expect, it } from "vitest";

import { safeCountryCode } from "@/lib/player-card/requirement-ledger";

/**
 * QA finding F1 on #1525: `projects.country` is manager-written free text that
 * was interpolated verbatim into a PostgREST `.or()` filter. Only a validated
 * ISO-2 code may reach a filter; lower case is normalised (the deriver
 * compares upper-cased `char(2)` codes), everything else is dropped so the
 * read falls back to "remote or any country" instead of a malformed filter.
 */
describe("safeCountryCode — the only shape a country may take before a filter", () => {
  it("accepts ISO-2 codes and normalises case and whitespace", () => {
    expect(safeCountryCode("LT")).toBe("LT");
    expect(safeCountryCode("lt")).toBe("LT");
    expect(safeCountryCode(" nl ")).toBe("NL");
  });

  it("drops anything that is not exactly two letters — including filter injections", () => {
    expect(safeCountryCode("LT,provider_id.eq.00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(safeCountryCode("Lietuva")).toBeNull();
    expect(safeCountryCode("L")).toBeNull();
    expect(safeCountryCode("L1")).toBeNull();
    expect(safeCountryCode("")).toBeNull();
    expect(safeCountryCode(null)).toBeNull();
    expect(safeCountryCode(undefined)).toBeNull();
  });
});
