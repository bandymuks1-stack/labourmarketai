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
  professionalFacts: null,
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
  recordedHoursBySkill: null,
  skillPractice: null,
  journalCoverage: null,
  confirmedHoursBySkill: null,
  confirmedWorkTotals: null,
  clientAcceptedEntries: null,
  recordedHoursTotal: null,
  recordedHoursConfirmed: null,
  organizationRecordedHours: null,
  organizationHistory: null,
  professionalExperience: null,
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
            kind: "employment",
            title: "Mūrininkas",
            startedAt,
            endedAt,
            id: null,
            description: null,
            operationsRole: null,
            projectName: null,
            recorded: null,
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
            kind: "practice",
            title: "Praktikantas",
            startedAt: "2026-02-01",
            endedAt: "2026-05-31",
            id: null,
            description: null,
            operationsRole: null,
            projectName: null,
            recorded: null,
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
            kind: "employment",
            title: null,
            startedAt: null,
            endedAt: null,
            id: null,
            description: null,
            operationsRole: null,
            projectName: null,
            recorded: null,
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
      professionSlugs: [{ slug: "bricklayer", label: null, isPrimary: true }],
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

describe("organization-provided history in the EU export", () => {
  const entry = {
    key: "k",
    organizationName: "Acme",
    project: "Harbour Tower",
    place: null,
    clients: [],
    relationshipKind: "employee",
    sourceKind: "xlsx",
    reconstructed: false,
    dayHours: 14.5,
    dayRecords: 2,
    periodHours: null,
    periodRecords: 0,
    from: "2025-03-04",
    to: "2025-03-05",
    proof: ["EVIDENCE_SUPPORTED"],
    attestedByRole: null,
    contested: false,
  } as const;

  it("makes the Work experience block present on its own, without touching the person's own entries", () => {
    const eu = buildEuFormatCv({ ...EMPTY, organizationHistory: [entry as never] });
    expect(eu.present.workExperience).toBe(true);
    expect(eu.workExperience).toEqual([]);
    expect(eu.organizationHistory).toHaveLength(1);
  });

  it("an unreadable ledger (null) and a read-empty one both add nothing", () => {
    expect(buildEuFormatCv(EMPTY).organizationHistory).toEqual([]);
    expect(buildEuFormatCv({ ...EMPTY, organizationHistory: [] }).present.workExperience).toBe(false);
  });

  it("is resolved only by a caller that renders the group; otherwise it is omitted, not blank", () => {
    const eu = buildEuFormatCv({ ...EMPTY, organizationHistory: [entry as never] });
    expect(resolveEuFormatDocument(eu, R).organizationHistory).toEqual([]);
    const doc = resolveEuFormatDocument(eu, {
      ...R,
      organizationHistory: (e) => ({
        heading: e.project ?? "",
        subheading: e.organizationName,
        period: null,
        note: null,
      }),
    });
    expect(doc.organizationHistory[0].heading).toBe("Harbour Tower");
  });
});

describe("positions the engagement list cannot carry reach the EU CV (decision 0025, 2026-10-20)", () => {
  const pe = (organizations: unknown[]) =>
    ({ organizations, hours: null, roles: [], lines: [], projects: [] }) as unknown as NonNullable<
      Parameters<typeof buildEuFormatCv>[0]["professionalExperience"]
    >;
  const earlier = {
    key: "earlier:bp-vivat",
    kind: "earlier_legal_entity",
    organizationId: "org-lm",
    organizationName: "Vivat Rex",
    legalEntityLabel: "Vivat Rex",
    legalEntityRelation: "not_asserted",
    administeredBy: { organizationId: "org-lm", organizationName: "Labour market ai Sp. z o.o" },
    roles: [{ relationship: "owner", title: null, startedAt: "2022-01-01", endedAt: null, current: false, source: "engagement", engagementContextId: null, derived: true }],
    totalHours: 800,
    from: "2022-01-01",
    to: null,
  };
  const membership = {
    key: "org:org-nonstop",
    kind: "organization",
    organizationId: "org-nonstop",
    organizationName: "UAB Nonstop Group",
    legalEntityLabel: null,
    legalEntityRelation: null,
    administeredBy: null,
    roles: [{ relationship: "manager", title: null, startedAt: null, endedAt: null, current: true, source: "membership", engagementContextId: null }],
    totalHours: 0,
    from: null,
    to: null,
  };

  it("an earlier legal entity's role and a governing membership become work-experience lines", () => {
    const eu = buildEuFormatCv({ ...EMPTY, professionalExperience: pe([earlier, membership]) });
    expect(eu.workExperience.map((e) => [e.organization, e.relationship])).toEqual([
      ["UAB Nonstop Group", "manager"],
      ["Vivat Rex", "owner"],
    ]);
  });

  it("an UNKNOWN end never prints 'present'; a current role does", () => {
    const doc = resolveEuFormatDocument(
      buildEuFormatCv({ ...EMPTY, professionalExperience: pe([earlier, membership]) }),
      R,
    );
    const vivat = doc.workExperience.find((e) => e.subheading === "Vivat Rex");
    expect(vivat?.period).toBe("2022-01-01");
    const nonstop = doc.workExperience.find((e) => e.subheading === "UAB Nonstop Group");
    expect(nonstop?.period).toBeNull();
  });
});

describe("a declared certificate keeps its declared label on the EU CV", () => {
  it("text-declared certificates carry the note; document certificates do not", () => {
    const eu = buildEuFormatCv({
      ...EMPTY,
      certificateDocs: [{ typeSlug: "a1_form", country: "LT", validUntil: null }] as never,
      declaredCertificates: [
        {
          title: "Welding EN ISO 9606",
          description: null,
          achievedAt: "2021",
          achievementTypeSlug: "certificate",
          confirmedByManager: false,
        },
      ],
    });
    expect(eu.certifications.map((c) => c.declared === true)).toEqual([false, true]);
    const doc = resolveEuFormatDocument(eu, { ...R, declaredCertificate: "Listed by the worker" });
    const json = JSON.stringify(doc);
    expect(json).toContain("Welding EN ISO 9606");
    expect(json).toContain("Listed by the worker");
    expect(json.match(/Listed by the worker/g)).toHaveLength(1);
  });
});

describe("leadership lines on the EU CV carry their own role's dates", () => {
  it("one line per role, each with its own dates and state — never the organization's work span", () => {
    const eu = buildEuFormatCv({
      ...EMPTY,
      professionalExperience: {
        organizations: [
          {
            key: "org-1",
            kind: "organization",
            organizationId: "o1",
            organizationName: "Acme",
            legalEntityLabel: null,
            legalEntityRelation: null,
            from: "2025-03-01",
            to: "2025-09-30",
            totalHours: 400,
            administeredBy: null,
            roles: [
              { relationship: "manager", title: null, startedAt: "2020-01-01", endedAt: "2022-06-30", current: false, source: "engagement", engagementContextId: "e1" },
              { relationship: "owner", title: null, startedAt: null, endedAt: null, current: true, source: "membership", engagementContextId: null },
            ],
          },
        ],
      } as never,
    } as never);
    const lines = eu.workExperience.filter((w) => w.organization === "Acme");
    expect(lines.map((l) => [l.relationship, l.startedAt, l.endedAt, l.ongoing])).toEqual([
      ["manager", "2020-01-01", "2022-06-30", false],
      ["owner", null, null, true],
    ]);
  });
});
