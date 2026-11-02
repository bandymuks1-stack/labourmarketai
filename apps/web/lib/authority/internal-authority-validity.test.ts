import { describe, expect, it } from "vitest";

import {
  INTERNAL_AUTHORITY_TERM_DAYS,
  INTERNAL_AUTHORITY_TERM_HOURS,
  INTERNAL_AUTHORITY_TERM_MONTHS,
  INTERNAL_AUTHORITY_TERM_MS,
  rollingInternalExpiryIso,
} from "./internal-authority-validity.mjs";

describe("internal authority validity — 12-month rolling term (owner P0 2026-10-22)", () => {
  it("one term is 12 months / 365 days", () => {
    expect(INTERNAL_AUTHORITY_TERM_MONTHS).toBe(12);
    expect(INTERNAL_AUTHORITY_TERM_DAYS).toBe(365);
    expect(INTERNAL_AUTHORITY_TERM_HOURS).toBe(365 * 24);
    expect(INTERNAL_AUTHORITY_TERM_MS).toBe(365 * 86_400_000);
  });

  it("inside the first term: approval + 12 months", () => {
    expect(rollingInternalExpiryIso("2026-08-10T00:00:00.000Z", new Date("2026-10-22T12:00:00Z"))).toBe(
      "2027-08-10T00:00:00.000Z",
    );
  });

  it("renews automatically, term after term, until it lies after now", () => {
    expect(rollingInternalExpiryIso("2026-08-10", new Date("2027-08-10T00:00:00Z"))).toBe(
      "2028-08-10T00:00:00.000Z",
    );
    expect(rollingInternalExpiryIso("2026-08-10", new Date("2031-01-01T00:00:00Z"))).toBe(
      "2031-08-10T00:00:00.000Z",
    );
  });

  it("never lapses by the calendar alone", () => {
    for (const now of ["2026-12-31", "2027-06-01", "2029-03-15", "2040-01-01"]) {
      const at = new Date(`${now}T00:00:00Z`);
      expect(new Date(rollingInternalExpiryIso("2026-08-27", at)).getTime()).toBeGreaterThan(at.getTime());
    }
  });

  it("an unreadable date is returned unchanged (caller stays fail-closed)", () => {
    expect(rollingInternalExpiryIso("not-a-date")).toBe("not-a-date");
  });

  it("is pure — the clock is a parameter", () => {
    const now = new Date("2026-10-22T00:00:00Z");
    expect(rollingInternalExpiryIso("2026-09-30", now)).toBe(rollingInternalExpiryIso("2026-09-30", now));
  });
});
