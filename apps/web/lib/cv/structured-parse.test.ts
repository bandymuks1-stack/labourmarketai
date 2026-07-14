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
});
