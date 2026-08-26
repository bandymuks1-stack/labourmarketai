import { describe, expect, it } from "vitest";

import { buildEuFormatCv, resolveEuFormatDocument } from "./eu-format";
import type { VerifiedCvData } from "./verified-cv";

/**
 * EU-format CV — the honesty rules, pinned.
 *
 * The point of this export is that a person can hand a European reader the
 * layout they expect WITHOUT the product inventing the fields Europass has and
 * this product does not hold. These tests exist to stop a future "let's fill
 * that empty slot" change from doing exactly that.
 */

const EMPTY: VerifiedCvData = {
  personName: "—",
  professionalSummary: null,
  professionSlugs: [],
  tiers: { confirmed: [], evidence: [], declared: [] },
  skillFacts: [],
  declaredClaims: [],
  workHistory: [],
  languages: [],
  certificateDocs: [],
  drivingLicenceCategories: [],
  declaredCertificates: [],
  education: [],
  achievements: [],
  projects: [],
  privateDetails: {
    salaryMinEur: null,
    salaryMaxEur: null,
    availabilityStatus: null,
    availableFrom: null,
    willingToRelocate: null,
    hasTransport: null,
  },
  signals: {
    verifiedSkills: 0,
    managerConfirmations: 0,
    journalEntries: 0,
  } as VerifiedCvData["signals"],
  proof: [],
};

const R = {
  relationship: (s: string) => `rel:${s}`,
  educationType: (s: string) => `edu:${s}`,
  skill: (s: string) => `skill:${s}`,
  profession: (s: string) => `prof:${s}`,
  language: (s: string) => `lang:${s}`,
  certificateType: (s: string) => `cert:${s}`,
  date: (iso: string | null) => iso,
  present: "present",
};

describe("nothing is invented to fill a Europass slot", () => {
  it("an empty profile produces no sections at all", () => {
    const eu = buildEuFormatCv(EMPTY);
    expect(eu.present.workExperience).toBe(false);
    expect(eu.present.educationAndTraining).toBe(false);
    expect(eu.present.personalSkills).toBe(false);
    expect(eu.present.additionalInformation).toBe(false);
  });

  it("an unnamed person is null, never a placeholder name", () => {
    // buildVerifiedCv uses "—" when there is no name; that is not a name.
    expect(buildEuFormatCv(EMPTY).personName).toBeNull();
    expect(buildEuFormatCv({ ...EMPTY, personName: "  " }).personName).toBeNull();
  });

  it("does not carry a mother tongue — the data does not record one", () => {
    const eu = buildEuFormatCv({
      ...EMPTY,
      languages: [
        { lang: "lt", level: "C2" },
        { lang: "en", level: "B1" },
      ],
    });
    // One flat list at the stated level. A C2 is NOT promoted to mother tongue.
    expect(eu.languages).toEqual([
      { lang: "lt", level: "C2" },
      { lang: "en", level: "B1" },
    ]);
    expect(JSON.stringify(eu)).not.toMatch(/mother|native/i);
  });
});

describe("evidence strength survives the translation", () => {
  it("keeps skills in their tiers instead of flattening them", () => {
    const eu = buildEuFormatCv({
      ...EMPTY,
      tiers: {
        confirmed: ["welding"],
        evidence: ["tiling"],
        declared: ["driving"],
      },
    });
    expect(eu.skillGroups).toEqual([
      { tier: "confirmed", slugs: ["welding"] },
      { tier: "evidence", slugs: ["tiling"] },
      { tier: "declared", slugs: ["driving"] },
    ]);
  });

  it("drops an empty tier rather than printing an empty group", () => {
    const eu = buildEuFormatCv({
      ...EMPTY,
      tiers: { confirmed: [], evidence: ["tiling"], declared: [] },
    });
    expect(eu.skillGroups).toEqual([{ tier: "evidence", slugs: ["tiling"] }]);
  });
});

describe("periods state only what was recorded", () => {
  const entry = (startedAt: string | null, endedAt: string | null) =>
    resolveEuFormatDocument(
      buildEuFormatCv({
        ...EMPTY,
        workHistory: [
          {
            orgName: "UAB Statyba",
            organizationType: "company",
            relationship: "employee",
            title: "Mūrininkas",
            startedAt,
            endedAt,
          },
        ],
      }),
      R,
    ).workExperience[0];

  it("a closed period shows both real endpoints", () => {
    expect(entry("2019-01-01", "2022-01-01").period).toBe(
      "2019-01-01 – 2022-01-01",
    );
  });

  it("an open period says present — it is genuinely ongoing", () => {
    expect(entry("2019-01-01", null).period).toBe("2019-01-01 – present");
  });

  it("no dates at all means no period, never today", () => {
    expect(entry(null, null).period).toBeNull();
  });
});

describe("the document is a view, not a second person", () => {
  it("leads a work entry with the position held, org underneath", () => {
    const doc = resolveEuFormatDocument(
      buildEuFormatCv({
        ...EMPTY,
        workHistory: [
          {
            orgName: "UAB Statyba",
            organizationType: "company",
            relationship: "student",
            title: "Praktikantas",
            startedAt: "2026-02-01",
            endedAt: "2026-05-31",
          },
        ],
      }),
      R,
    );
    expect(doc.workExperience[0].heading).toBe("Praktikantas");
    expect(doc.workExperience[0].subheading).toBe("UAB Statyba");
    // The relationship is still stated — a placement is not silently upgraded.
    expect(doc.workExperience[0].note).toBe("rel:student");
  });

  it("falls back to the relationship when no title was recorded", () => {
    const doc = resolveEuFormatDocument(
      buildEuFormatCv({
        ...EMPTY,
        workHistory: [
          {
            orgName: "UAB Statyba",
            organizationType: "company",
            relationship: "employee",
            title: null,
            startedAt: null,
            endedAt: null,
          },
        ],
      }),
      R,
    );
    expect(doc.workExperience[0].heading).toBe("rel:employee");
    expect(doc.workExperience[0].note).toBeNull();
  });

  it("carries no field the Living CV does not already hold", () => {
    const eu = buildEuFormatCv({
      ...EMPTY,
      personName: "Jonas",
      professionSlugs: [{ slug: "bricklayer", isPrimary: true }],
      education: [
        {
          institutionName: "VGTU",
          programOrField: "Statyba",
          educationTypeSlug: "university_bachelor",
          startYear: 2020,
          endYear: 2024,
          isCurrent: false,
        },
      ],
    });
    // No address, no date of birth, no nationality, no digital-skills score.
    const flat = JSON.stringify(eu);
    for (const absent of ["address", "dateOfBirth", "nationality", "digitalSkills"]) {
      expect(flat).not.toContain(absent);
    }
    expect(eu.present.educationAndTraining).toBe(true);
  });
});
