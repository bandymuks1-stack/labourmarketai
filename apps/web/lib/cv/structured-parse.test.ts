import { describe, expect, it } from "vitest";

import { hasAnyProposal, parseCvSections } from "./structured-parse";

/**
 * Structured CV parsing heuristics (Full CV System v1) — fixture-driven.
 * The parser PROPOSES only; these tests pin the honesty rules:
 *  - nothing invented (no level → null; hourly wage → no salary proposal);
 *  - deterministic (same text, same result);
 *  - bounded (caps, dedup).
 */

const LT_CV = `
Vardenis Pavardenis

Darbo patirtis
UAB Statyba — mūrininkas 2019–2022
MB Renovacija, pagalbinis darbininkas 2017–2019

Išsilavinimas
Vilniaus statybininkų rengimo centras, profesinis mokymas 2015–2017

Kalbos
Anglų B1
Rusų gimtoji

Sertifikatai
Aukštalipio pažymėjimas 2020

Atlyginimo lūkestis: 2500–3000 € per mėnesį
Galiu dirbti savaitgaliais.
`;

describe("parseCvSections", () => {
  it("is deterministic and empty-safe", () => {
    const empty = parseCvSections("");
    expect(hasAnyProposal(empty)).toBe(false);
    expect(parseCvSections(LT_CV)).toEqual(parseCvSections(LT_CV));
  });

  it("detects work history with company markers and year ranges", () => {
    const p = parseCvSections(LT_CV);
    expect(p.workHistory.length).toBeGreaterThanOrEqual(2);
    const first = p.workHistory[0];
    expect(first.title).toContain("UAB Statyba");
    expect(first.startYear).toBe(2019);
    expect(first.endYear).toBe(2022);
    expect(first.isCurrent).toBe(false);
    expect(first.confidence).toBe("high"); // company marker + range
  });

  it("marks an open-ended range as current without inventing an end year", () => {
    const p = parseCvSections("UAB Testas — vairuotojas 2021–dabar");
    expect(p.workHistory).toHaveLength(1);
    expect(p.workHistory[0].isCurrent).toBe(true);
    expect(p.workHistory[0].endYear).toBeNull();
  });

  it("detects education with a type slug guess", () => {
    const p = parseCvSections(LT_CV);
    expect(p.education).toHaveLength(1);
    expect(p.education[0].institution).toContain("Vilniaus statybininkų");
    expect(p.education[0].educationTypeSlug).toBe("vocational");
    expect(p.education[0].startYear).toBe(2015);
  });

  it("detects languages with stated levels only — never invents a level", () => {
    const p = parseCvSections(LT_CV);
    const en = p.languages.find((l) => l.lang === "en");
    const ru = p.languages.find((l) => l.lang === "ru");
    expect(en?.level).toBe("B1");
    expect(ru?.level).toBe("native");

    const noLevel = parseCvSections("Kalbos: anglų");
    expect(noLevel.languages).toHaveLength(1);
    expect(noLevel.languages[0].level).toBeNull();
  });

  it("detects certificates as their own group (not work history)", () => {
    const p = parseCvSections(LT_CV);
    expect(p.certificates).toHaveLength(1);
    expect(p.certificates[0].title).toContain("Aukštalipio");
    expect(p.certificates[0].year).toBe(2020);
    expect(
      p.workHistory.some((w) => w.title.includes("Aukštalipio")),
    ).toBe(false);
  });

  it("detects a monthly salary range and availability hints", () => {
    const p = parseCvSections(LT_CV);
    expect(p.salary).not.toBeNull();
    expect(p.salary!.minEur).toBe(2500);
    expect(p.salary!.maxEur).toBe(3000);
    expect(p.availability.map((h) => h.key)).toContain("weekendShiftsOk");
  });

  it("NEVER converts an hourly wage into a monthly expectation", () => {
    const p = parseCvSections("Atlyginimo lūkestis: 15 €/val.");
    expect(p.salary).toBeNull();
  });

  it("rejects an implausible salary figure", () => {
    const p = parseCvSections("Atlyginimas: 150 € per mėnesį"); // below floor
    expect(p.salary).toBeNull();
  });

  it("caps and dedups proposals", () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `UAB Firma${i} — darbininkas ${1980 + (i % 40)}–${1981 + (i % 40)}`,
    ).join("\n");
    const p = parseCvSections(many);
    expect(p.workHistory.length).toBeLessThanOrEqual(20);

    const dup = parseCvSections(
      "UAB Statyba — mūrininkas 2019–2022\nUAB Statyba — mūrininkas 2019–2022",
    );
    expect(dup.workHistory).toHaveLength(1);
  });

  it("parses English CVs too (active-locale coverage)", () => {
    const p = parseCvSections(
      [
        "Mason at BuildCo Ltd 2018–2023",
        "University of Tartu, civil engineering bachelor 2014–2018",
        "English C1",
        "Willing to relocate.",
      ].join("\n"),
    );
    expect(p.workHistory.length + p.education.length).toBeGreaterThanOrEqual(2);
    expect(p.education[0]?.educationTypeSlug).toBe("university_bachelor");
    expect(p.languages.find((l) => l.lang === "en")?.level).toBe("C1");
    expect(p.availability.map((h) => h.key)).toContain("willingToRelocate");
  });

  // Production repro (worker E2E, 2026-07-22): a CV line using year-month
  // periods ("2021-03 - 2024-11") lost BOTH years and saved the corrupted
  // title "03 - -11 - Murininkas, …" into engagement_contexts, and the second
  // experience line (no company-form marker) produced no proposal at all.
  describe("year-month period formats", () => {
    it("parses 'YYYY-MM - YYYY-MM' ranges and keeps the title clean", () => {
      const p = parseCvSections(
        "2021-03 - 2024-11 - Murininkas, UAB Statybos testas, Vilnius",
      );
      expect(p.workHistory).toHaveLength(1);
      const w = p.workHistory[0];
      expect(w.title).toBe("Murininkas, UAB Statybos testas, Vilnius");
      expect(w.startYear).toBe(2021);
      expect(w.endYear).toBe(2024);
      // Stated month precision is preserved, not widened to bare years.
      expect(w.start).toEqual({ year: 2021, month: 3, day: null });
      expect(w.end).toEqual({ year: 2024, month: 11, day: null });
      expect(w.isCurrent).toBe(false);
      expect(w.confidence).toBe("high"); // range + company marker
    });

    it("proposes a year-month experience line even without a company marker", () => {
      const p = parseCvSections(
        "2018-05 - 2021-02 - Pagalbinis darbininkas, statybos objektai, Kaunas",
      );
      expect(p.workHistory).toHaveLength(1);
      const w = p.workHistory[0];
      expect(w.title).toBe("Pagalbinis darbininkas, statybos objektai, Kaunas");
      expect(w.startYear).toBe(2018);
      expect(w.endYear).toBe(2021);
    });

    it("parses month-first 'MM/YYYY – MM/YYYY' and dotted 'YYYY.MM' ranges", () => {
      const monthFirst = parseCvSections("03/2019 – 11/2022 Elektrikas, AB Testo energija");
      expect(monthFirst.workHistory).toHaveLength(1);
      expect(monthFirst.workHistory[0].startYear).toBe(2019);
      expect(monthFirst.workHistory[0].endYear).toBe(2022);
      expect(monthFirst.workHistory[0].start).toEqual({ year: 2019, month: 3, day: null });
      expect(monthFirst.workHistory[0].end).toEqual({ year: 2022, month: 11, day: null });
      expect(monthFirst.workHistory[0].title).toBe("Elektrikas, AB Testo energija");

      const dotted = parseCvSections("2020.06 - dabar - Suvirintojas, UAB Metalo testas");
      expect(dotted.workHistory).toHaveLength(1);
      expect(dotted.workHistory[0].startYear).toBe(2020);
      expect(dotted.workHistory[0].endYear).toBeNull();
      // Ongoing: start precision preserved, no end invented.
      expect(dotted.workHistory[0].start).toEqual({ year: 2020, month: 6, day: null });
      expect(dotted.workHistory[0].end).toBeNull();
      expect(dotted.workHistory[0].isCurrent).toBe(true);
      expect(dotted.workHistory[0].title).toBe("Suvirintojas, UAB Metalo testas");
    });

    it("keeps full-date precision (YYYY-MM-DD and DD.MM.YYYY) in the proposal", () => {
      const iso = parseCvSections(
        "2021-03-15 - 2024-11-20 - Murininkas, UAB Statybos testas, Vilnius",
      );
      expect(iso.workHistory[0].start).toEqual({ year: 2021, month: 3, day: 15 });
      expect(iso.workHistory[0].end).toEqual({ year: 2024, month: 11, day: 20 });

      const dayFirst = parseCvSections("15.03.2021 – 20.11.2024 Dažytojas, UAB Spalvos testas");
      expect(dayFirst.workHistory[0].start).toEqual({ year: 2021, month: 3, day: 15 });
      expect(dayFirst.workHistory[0].end).toEqual({ year: 2024, month: 11, day: 20 });
    });

    it("keeps bare-year ranges at year precision (month/day stay null)", () => {
      const p = parseCvSections("UAB Statyba — mūrininkas 2019–2022");
      expect(p.workHistory[0].start).toEqual({ year: 2019, month: null, day: null });
      expect(p.workHistory[0].end).toEqual({ year: 2022, month: null, day: null });
    });

    it("rejects calendar-invalid dates instead of silently normalising them", () => {
      // 2021-02-30 does not exist — the range must NOT yield dates and the
      // parser must NOT clamp it to 2021-02-28.
      const p = parseCvSections(
        "2021-02-30 - 2024-11-20 - Murininkas, UAB Statybos testas, Vilnius",
      );
      expect(p.workHistory).toHaveLength(1); // company marker still proposes it
      expect(p.workHistory[0].start ?? null).toBeNull();
      expect(p.workHistory[0].end ?? null).toBeNull();
      expect(p.workHistory[0].startYear).toBeNull();
      expect(p.workHistory[0].endYear).toBeNull();
    });

    it("keeps plain year ranges working exactly as before (regression)", () => {
      const p = parseCvSections("UAB Statyba — mūrininkas 2019–2022");
      expect(p.workHistory).toHaveLength(1);
      expect(p.workHistory[0].startYear).toBe(2019);
      expect(p.workHistory[0].endYear).toBe(2022);
      expect(p.workHistory[0].title).toBe("UAB Statyba — mūrininkas");
    });

    it("parses full-date ranges (YYYY-MM-DD and day-first DD.MM.YYYY)", () => {
      const iso = parseCvSections(
        "2021-03-15 - 2024-11-30 - Murininkas, UAB Statybos testas, Vilnius",
      );
      expect(iso.workHistory).toHaveLength(1);
      expect(iso.workHistory[0].startYear).toBe(2021);
      expect(iso.workHistory[0].endYear).toBe(2024);
      expect(iso.workHistory[0].title).toBe("Murininkas, UAB Statybos testas, Vilnius");

      const dayFirst = parseCvSections("15.03.2021 – 20.11.2024 Dažytojas, UAB Spalvos testas");
      expect(dayFirst.workHistory).toHaveLength(1);
      expect(dayFirst.workHistory[0].startYear).toBe(2021);
      expect(dayFirst.workHistory[0].endYear).toBe(2024);
      expect(dayFirst.workHistory[0].title).toBe("Dažytojas, UAB Spalvos testas");
    });

    it("never mistakes a plain 'YYYY-YYYY' range for a year-month token", () => {
      const p = parseCvSections("2019-2022 Mūrininkas, UAB Statybos testas");
      expect(p.workHistory).toHaveLength(1);
      expect(p.workHistory[0].startYear).toBe(2019);
      expect(p.workHistory[0].endYear).toBe(2022);
      expect(p.workHistory[0].title).toBe("Mūrininkas, UAB Statybos testas");
    });
  });
});
