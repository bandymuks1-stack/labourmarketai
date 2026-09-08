import { describe, expect, it } from "vitest";

import { getCompanyForm } from "@/lib/conversation/company-forms";
import { companyCreateDemandSchema } from "@/lib/conversation/company-schemas";
import { parseDurationDays, parseEndDate, parseTimeWindow } from "./time-window";
import { structureValueStatement } from "./value-statement";

/**
 * Owner Master Execution Contract 2026-09-04 §9 — DATES: "from 5 October"
 * became canonical in #1468; the END of the work ("iki spalio 20", "for 3
 * weeks") still fell on the floor. Now the window carries an end when one is
 * stated — as a date or as a duration — and nothing is invented otherwise.
 */
const TODAY = "2026-09-04";

describe("a WRITTEN end date — the way a person copies it off a certificate", () => {
  it("iki 2027-03-31 / until 31.03.2027 / bis 31.3.2027 → the ISO day; an impossible day is null", () => {
    expect(parseEndDate("turiu naują A1 pažymą iki 2027-03-31", "2026-09-04", null)).toBe("2027-03-31");
    expect(parseEndDate("valid until 31.03.2027", "2026-09-04", null)).toBe("2027-03-31");
    expect(parseEndDate("gültig bis 31.3.2027", "2026-09-04", null)).toBe("2027-03-31");
    expect(parseEndDate("iki 2027-02-30", "2026-09-04", null)).toBeNull();
    expect(parseEndDate("iki 2027-13-01", "2026-09-04", null)).toBeNull();
  });
});

describe("an END date across locales, anchored on the start (never next year by accident)", () => {
  it.each([
    ["nuo spalio 5 iki spalio 20", "2026-10-05", "2026-10-20"],
    ["from 5 October until 20 October", "2026-10-05", "2026-10-20"],
    ["from October 5 to October 20", "2026-10-05", "2026-10-20"],
    ["с 5 октября до 20 октября", "2026-10-05", "2026-10-20"],
    ["vanaf 5 oktober tot 20 oktober", "2026-10-05", "2026-10-20"],
    ["ab 5. Oktober bis 20. Oktober", "2026-10-05", "2026-10-20"],
    ["od 5 października do 20 października", "2026-10-05", "2026-10-20"],
    // an end that crosses the year boundary stays after the start
    ["nuo gruodžio 20 iki sausio 10", "2026-12-20", "2027-01-10"],
  ])("%s", (text, start, end) => {
    expect(parseTimeWindow(text, TODAY)).toMatchObject({ kind: "from_date", startIso: start, endIso: end });
    expect(parseEndDate(text, TODAY, start)).toBe(end);
  });
});

describe("a DURATION becomes an end day from the start", () => {
  it.each([
    ["nuo spalio 5 trims savaitėms", 21, "2026-10-25"],
    ["from 5 October for 3 weeks", 21, "2026-10-25"],
    ["с 5 октября на 3 недели", 21, "2026-10-25"],
    ["vanaf 5 oktober 3 weken", 21, "2026-10-25"],
    ["ab 5. Oktober 3 Wochen", 21, "2026-10-25"],
    ["od 5 października na 3 tygodnie", 21, "2026-10-25"],
    ["nuo spalio 5 dviem mėnesiams", 60, "2026-12-03"],
    ["from 5 October for two months", 60, "2026-12-03"],
  ])("%s", (text, days, end) => {
    expect(parseDurationDays(text)).toBe(days);
    expect(parseTimeWindow(text, TODAY)).toMatchObject({ kind: "from_date", startIso: "2026-10-05", endIso: end });
  });

  it("a stated day count on a from-date is a duration too; no end is invented otherwise", () => {
    expect(parseTimeWindow("nuo spalio 5 penkioms dienoms", TODAY)).toMatchObject({ startIso: "2026-10-05", endIso: "2026-10-09" });
    const bare = parseTimeWindow("nuo spalio 5", TODAY);
    expect(bare.kind).toBe("from_date");
    expect(bare.endIso).toBeUndefined();
    expect(parseDurationDays("reikia 12 pastolininkų")).toBeNull();
  });
});

describe("the structured demand carries the end", () => {
  it("the owner's sentence with an end: start + end both read", () => {
    const v = structureValueStatement("Reikia 12 pastolininkų Roterdame nuo spalio 5 iki spalio 20.", TODAY);
    expect(v.window).toMatchObject({ kind: "from_date", startIso: "2026-10-05", endIso: "2026-10-20" });
    expect(v.headcount).toBe(12);
    expect(v.workType).toBe("scaffolder");
  });

  it("the form carries endDate to the dispatch schema; blank is null, malformed is refused", () => {
    const spec = getCompanyForm("company.create-demand")!;
    expect(spec.fields.some((f) => f.name === "endDate")).toBe(true);
    const built = spec.build({ description: "reikia darbuotojų", startDate: "2026-10-05", endDate: "2026-10-20" });
    const parsed = companyCreateDemandSchema.safeParse(built);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.endDate).toBe("2026-10-20");
    expect(spec.build({ description: "reikia darbuotojų", endDate: "" }).endDate).toBeNull();
    expect(companyCreateDemandSchema.safeParse(spec.build({ description: "reikia darbuotojų", endDate: "spalio 20" })).success).toBe(false);
  });
});
