import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vacancyPayLabel } from "./vacancy-pay-label";

const pay = (
  compensationCurrency: string | null,
  compensationMin: number | null,
  compensationMax: number | null,
) => ({ compensationCurrency, compensationMin, compensationMax });

const norm = (s: string | null) => s?.replace(/\s/g, " ") ?? null;

describe("vacancyPayLabel: the pay the publisher supplied, never invented", () => {
  it("prints a range with the currency in the reader's number format", () => {
    expect(norm(vacancyPayLabel(pay("SEK", 25000, 30000), "lt"))).toBe("25 000–30 000 SEK");
    expect(vacancyPayLabel(pay("EUR", 2500, 3200), "en")).toBe("2,500–3,200 EUR");
  });

  it("names an open end in the reader's language", () => {
    expect(norm(vacancyPayLabel(pay("NOK", 40000, null), "lt"))).toBe("nuo 40 000 NOK");
    expect(norm(vacancyPayLabel(pay("NOK", null, 40000), "ru"))).toBe("до 40 000 NOK");
  });

  it("prints one figure when min equals max", () => {
    expect(vacancyPayLabel(pay("EUR", 1800, 1800), "en")).toBe("1,800 EUR");
  });

  it("returns null without a valid currency or a positive amount", () => {
    expect(vacancyPayLabel(pay(null, 25000, 30000), "lt")).toBeNull();
    expect(vacancyPayLabel(pay("kr", 25000, 30000), "lt")).toBeNull();
    expect(vacancyPayLabel(pay("SEK", null, null), "lt")).toBeNull();
    expect(vacancyPayLabel(pay("SEK", 0, 0), "lt")).toBeNull();
    expect(vacancyPayLabel(pay("SEK", Number.NaN, null), "lt")).toBeNull();
  });
});

describe("/jobs member facts stay member-only (owner directive 2026-08-24)", () => {
  const page = readFileSync(
    join(__dirname, "../../app/[locale]/(marketing)/jobs/page.tsx"),
    "utf8",
  );

  it("reads employer and place only for a signed-in person, under their own client", () => {
    expect(page).toMatch(
      /supabase && user && shownIds\.length > 0\s*\?\s*await listMemberVacancyFactsByIds\(supabase, shownIds\)/,
    );
  });

  it("an anonymous visitor gets the honest line, a member never does", () => {
    expect(page).toContain("const lockedFactsLabel = user ? undefined : LOCKED_FACTS[active];");
  });
});
