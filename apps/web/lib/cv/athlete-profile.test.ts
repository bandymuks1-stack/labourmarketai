import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AthleteProfileView, type AthleteProfileCopy, type AthleteTranslator } from "@/components/app/cv/athlete-profile-view";
import { CV_TEMPLATES, isCvProfileTemplate, parseCvTemplateId } from "@/lib/cv-export/templates";

import {
  ATHLETE_PHOTO_PROJECTS_MAX,
  buildAthleteProfile,
  seasonPeriodLabel,
  seasonPhotoProjects,
  withSeasonPhotos,
  type AthleteCvInput,
  type AthleteNames,
  type AthleteStat,
} from "./athlete-profile";

vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, className, children }: { href: string; className?: string; children: unknown }) =>
    createElement("a", { href, className }, children as never),
}));

const NAMES: AthleteNames = {
  skill: (s) => `skill:${s}`,
  profession: (s) => (s === "unknown-slug" ? null : `prof:${s}`),
  relationship: (s) => `rel:${s}`,
  documentType: (s) => `doc:${s}`,
  language: (c) => `lang:${c}`,
};

/** A person who has only just arrived: every source read, nothing in it. */
const blank = (patch: Partial<AthleteCvInput> = {}): AthleteCvInput => ({
  personName: "Rasa Petraitė",
  professionSlugs: [],
  tiers: { confirmed: [], evidence: [], declared: [] },
  declaredClaims: [],
  skillPractice: {},
  growthAdjacent: [],
  journalCoverage: { entriesRead: 0, truncated: false },
  workHistory: [],
  languages: [],
  certificateDocs: [],
  declaredCertificates: [],
  recordedHoursTotal: 0,
  recordedHoursConfirmed: 0,
  organizationRecordedHours: {
    hours: 0,
    days: 0,
    importedHours: 0,
    approvedHours: 0,
    periodHours: 0,
    periodRecords: 0,
    totalHours: 0,
    from: null,
    to: null,
  },
  organizationHistory: [],
  professionalExperience: null,
  privateDetails: {
    salaryMinEur: null,
    salaryMaxEur: null,
    availabilityStatus: null,
    availableFrom: null,
    willingToRelocate: null,
    hasTransport: null,
  },
  proof: [],
  ...patch,
});

const build = (cv: AthleteCvInput, patch: Partial<Parameters<typeof buildAthleteProfile>[0]> = {}) =>
  buildAthleteProfile({
    cv,
    names: NAMES,
    place: null,
    portraitUrl: null,
    todayIso: "2026-11-07",
    readerIsThePerson: true,
    ...patch,
  });

const stat = (stats: readonly AthleteStat[], key: AthleteStat["key"]) => stats.find((s) => s.key === key);

type Pe = NonNullable<AthleteCvInput["professionalExperience"]>;
const experience = (patch: {
  total?: number;
  confirmed?: number;
  orgPeriods?: number;
  lines?: Partial<Pe["lines"][number]>[];
  projects?: number;
  organizations?: Pe["organizations"];
  roles?: Pe["roles"];
}): Pe =>
  ({
    hours: {
      total: patch.total ?? 0,
      journal: 0,
      journalConfirmed: 0,
      organizationDays: 0,
      organizationPeriods: patch.orgPeriods ?? 0,
      notCounted: 0,
      capacityExcess: 0,
      organizationUnknown: false,
    },
    from: null,
    to: null,
    lines: (patch.lines ?? []).map((l) => ({ counted: true, confirmedHours: 0, ...l })),
    organizations: patch.organizations ?? [],
    projects: Array.from({ length: patch.projects ?? 0 }, (_, i) => ({ projectId: `p${i}` })),
    roles: patch.roles ?? [],
    ledger: { byState: { actual: 0, reported: 0, estimated: 0, confirmed: patch.confirmed ?? 0 } },
    durationPending: [],
  }) as unknown as Pe;

const engagement = (patch: Partial<AthleteCvInput["workHistory"][number]>): AthleteCvInput["workHistory"][number] => ({
  orgName: "Statyba UAB",
  organizationType: "company",
  relationship: "employee",
  kind: "employment",
  title: "Stogdengys",
  startedAt: "2021-03-01",
  endedAt: "2024-06-30",
  id: "e1",
  description: null,
  operationsRole: null,
  projectName: null,
  recorded: { hours: 100, confirmedHours: 40, entries: 12 },
  ...patch,
});

const proofRow = (patch: Partial<AthleteCvInput["proof"][number]>): AthleteCvInput["proof"][number] => ({
  confirmedAt: "2024-01-02",
  entryDate: "2024-01-01",
  projectTitle: null,
  confirmerRole: "manager",
  automatic: false,
  selfConfirmed: false,
  engagementId: "e1",
  ...patch,
});

const orgRecord = (
  patch: Partial<NonNullable<AthleteCvInput["organizationHistory"]>[number]>,
): NonNullable<AthleteCvInput["organizationHistory"]>[number] => ({
  key: "o1",
  organizationName: "Nonstop",
  project: "Mokykla",
  place: null,
  clients: [],
  relationshipKind: "employee",
  sourceKind: null,
  sourceLabel: null,
  reconstructed: false,
  dayHours: null,
  dayRecords: 0,
  periodHours: 800,
  periodRecords: 1,
  from: "2019-01-01",
  to: "2020-12-31",
  proof: [],
  attestedByRole: null,
  contested: false,
  ...patch,
});

describe("buildAthleteProfile: a person with almost nothing", () => {
  const p = build(blank());

  it("returns a whole structure with honest empties, and no figure of 0", () => {
    expect(p.hero.name).toBe("Rasa Petraitė");
    expect(p.hero.portraitUrl).toBeNull();
    expect(p.seasons).toEqual([]);
    expect(p.skills).toEqual([]);
    expect(p.nextMove).toEqual({ state: "none" });
    expect(stat(p.stats, "confirmed")).toEqual({ key: "confirmed", state: "none" });
    expect(stat(p.stats, "journal")).toEqual({ key: "journal", state: "none" });
    expect(JSON.stringify(p.stats)).not.toContain('"value":0');
  });

  it("gives no stat to a source that has nothing to count", () => {
    expect(stat(p.stats, "total")).toBeUndefined();
    expect(stat(p.stats, "organization")).toBeUndefined();
    expect(stat(p.stats, "projects")).toBeUndefined();
  });

  it("says no name was given instead of showing a dash as a name", () => {
    expect(build(blank({ personName: "—" })).hero.name).toBeNull();
    expect(build(blank({ personName: "  " })).hero.name).toBeNull();
  });
});

describe("stats: UNKNOWN is never zero", () => {
  const p = build(
    blank({
      recordedHoursTotal: null,
      recordedHoursConfirmed: null,
      organizationRecordedHours: null,
      organizationHistory: null,
      skillPractice: null,
      growthAdjacent: null,
      journalCoverage: null,
    }),
  );

  it("an unread source is unknown and carries no number", () => {
    expect(stat(p.stats, "confirmed")).toEqual({ key: "confirmed", state: "unknown" });
    expect(stat(p.stats, "journal")).toEqual({ key: "journal", state: "unknown" });
    expect(stat(p.stats, "organization")).toEqual({ key: "organization", state: "unknown" });
  });

  it("an unread journal also makes the next move and skill time unknown", () => {
    expect(p.nextMove).toEqual({ state: "unknown" });
    expect(p.skillTimeUnknown).toBe(true);
  });

  it("a truncated journal read is said", () => {
    expect(build(blank({ journalCoverage: { entriesRead: 5, truncated: true } })).journalTruncated).toBe(true);
  });
});

describe("stats: every number names who stands behind it", () => {
  it("names the organizations and confirmer roles, from the ONE ledger", () => {
    const p = build(
      blank({
        recordedHoursConfirmed: 999,
        recordedHoursTotal: 100,
        professionalExperience: experience({
          total: 100,
          confirmed: 40,
          lines: [
            { organizationName: "Statyba UAB", confirmedHours: 40 },
            { organizationName: "Ignored UAB", confirmedHours: 0 },
            { organizationName: "Not counted UAB", confirmedHours: 9, counted: false },
          ],
        }),
        proof: [proofRow({ confirmerRole: "manager" }), proofRow({ confirmerRole: "owner", automatic: true })],
      }),
    );
    const confirmed = stat(p.stats, "confirmed");
    expect(confirmed).toMatchObject({ state: "value", value: 40 });
    if (confirmed?.state !== "value") throw new Error("expected a value");
    expect(confirmed.behind).toEqual({
      organizations: ["Statyba UAB"],
      roles: ["rel:manager", "rel:owner"],
      selfConfirmed: false,
      automatic: true,
      selfOnly: false,
    });
  });

  it("a person confirming their own work is said, and never reads as somebody else (EVID-2)", () => {
    const p = build(
      blank({
        recordedHoursConfirmed: 10,
        proof: [proofRow({ selfConfirmed: true, confirmerRole: "owner" })],
      }),
    );
    const confirmed = stat(p.stats, "confirmed");
    if (confirmed?.state !== "value") throw new Error("expected a value");
    expect(confirmed.behind?.selfOnly).toBe(true);
    expect(confirmed.behind?.roles).toEqual([]);
  });

  it("an organization's attested hours are a second party even beside a self-confirmation", () => {
    const p = build(
      blank({
        professionalExperience: experience({
          total: 90,
          confirmed: 90,
          orgPeriods: 90,
          lines: [{ organizationName: "Nonstop", attestedHours: 90 }],
        }),
        proof: [proofRow({ selfConfirmed: true })],
      }),
    );
    const confirmed = stat(p.stats, "confirmed");
    if (confirmed?.state !== "value") throw new Error("expected a value");
    expect(confirmed.behind?.selfOnly).toBe(false);
    expect(confirmed.behind?.selfConfirmed).toBe(true);
  });

  it("the total is its own stat only when an organization's records add to the journal", () => {
    const journalOnly = build(blank({ recordedHoursTotal: 25, professionalExperience: experience({ total: 25 }) }));
    expect(stat(journalOnly.stats, "total")).toBeUndefined();

    const withOrg = build(
      blank({
        recordedHoursTotal: 25.58,
        organizationRecordedHours: { ...blank().organizationRecordedHours!, totalHours: 800 },
        organizationHistory: [orgRecord({})],
        professionalExperience: experience({ total: 825.58, orgPeriods: 800, projects: 2 }),
      }),
    );
    expect(stat(withOrg.stats, "total")).toMatchObject({ state: "value", value: 825.58 });
    expect(stat(withOrg.stats, "journal")).toMatchObject({ state: "value", value: 25.58 });
    expect(stat(withOrg.stats, "organization")).toMatchObject({ value: 800, organizations: ["Nonstop"] });
    expect(stat(withOrg.stats, "projects")).toMatchObject({ value: 2 });
  });

  it("has no countries stat, because no source carries work countries", () => {
    expect(build(blank()).stats.map((s) => s.key)).not.toContain("countries");
  });
});

describe("seasons: one history, newest first, evidence apart", () => {
  it("orders current first, then by end date, with undated last", () => {
    const p = build(
      blank({
        workHistory: [
          engagement({ id: "old", startedAt: "2015-01-01", endedAt: "2016-12-31" }),
          engagement({ id: "now", startedAt: "2024-07-01", endedAt: null }),
          engagement({ id: "undated", startedAt: null, endedAt: null }),
        ],
        organizationHistory: [orgRecord({ key: "mid", from: "2019-01-01", to: "2020-12-31" })],
      }),
    );
    expect(p.seasons.map((s) => s.key)).toEqual(["own:now", "org:mid", "own:old", "own:undated"]);
    expect(p.seasons[0]?.period.current).toBe(true);
    expect(p.seasons[3]?.period.current).toBe(false);
  });

  it("a second party's confirmation is 'confirmed'; hours keep both figures", () => {
    const p = build(blank({ workHistory: [engagement({})], proof: [proofRow({})] }));
    expect(p.seasons[0]).toMatchObject({
      evidence: "confirmed",
      confirmedByRoles: ["rel:manager"],
      hours: { kind: "journal", recorded: 100, confirmed: 40 },
    });
  });

  it("only the person's own confirmation stays their own record, and says so", () => {
    const p = build(blank({ workHistory: [engagement({})], proof: [proofRow({ selfConfirmed: true })] }));
    expect(p.seasons[0]).toMatchObject({
      evidence: "own_record",
      selfConfirmed: true,
      confirmedByRoles: [],
      hours: { kind: "journal", recorded: 100, confirmed: null },
    });
  });

  it("a job with no journal behind it is stated; an unread journal gives no hours and no zero", () => {
    const none = build(blank({ workHistory: [engagement({ recorded: { hours: 0, confirmedHours: 0, entries: 0 } })] }));
    expect(none.seasons[0]).toMatchObject({ evidence: "stated", hours: null });
    const unread = build(blank({ workHistory: [engagement({ recorded: null })] }));
    expect(unread.seasons[0]).toMatchObject({ evidence: "stated", hours: null });
  });

  it("a placement is never presented as a job", () => {
    const p = build(blank({ workHistory: [engagement({ kind: "practice", relationship: "student_placement" })] }));
    expect(p.seasons[0]?.placement).toBe(true);
  });

  it("a person's own job keeps stated precision; an organization's date is recorded", () => {
    const p = build(blank({ workHistory: [engagement({ orgName: null }), engagement({ id: "e2" })] }));
    expect(p.seasons.find((s) => s.key === "own:e1")?.period.precision).toBe("stated");
    expect(p.seasons.find((s) => s.key === "own:e2")?.period.precision).toBe("recorded");
  });

  it("an organization record keeps its own evidence and its own kinds of hours", () => {
    const confirmed = build(
      blank({
        organizationHistory: [
          orgRecord({ proof: ["EMPLOYER_CONFIRMED"], attestedByRole: "manager", dayHours: 12, dayRecords: 3, periodHours: 800 }),
        ],
      }),
    ).seasons[0];
    expect(confirmed).toMatchObject({
      evidence: "confirmed",
      confirmedByRoles: ["rel:manager"],
      hours: { kind: "organization", dayHours: 12, dayRecords: 3, periodHours: 800 },
      hoursNotStated: false,
    });
    const plain = build(blank({ organizationHistory: [orgRecord({})] })).seasons[0];
    expect(plain?.evidence).toBe("organization_record");
    expect(plain?.confirmedByRoles).toEqual([]);
    expect(build(blank({ organizationHistory: [orgRecord({ proof: ["CLIENT_ACCEPTED"] })] })).seasons[0]?.evidence).toBe(
      "client_accepted",
    );
    expect(build(blank({ organizationHistory: [orgRecord({ proof: ["SELF_DECLARED"] })] })).seasons[0]?.evidence).toBe(
      "own_record",
    );
  });

  it("an organization record with no duration says so, and has no zero", () => {
    const s = build(blank({ organizationHistory: [orgRecord({ periodHours: null, periodRecords: 0 })] })).seasons[0];
    expect(s).toMatchObject({ hours: null, hoursNotStated: true });
  });

  it("a dispute and a reconstruction stay visible", () => {
    const s = build(blank({ organizationHistory: [orgRecord({ contested: true, reconstructed: true })] })).seasons[0];
    expect(s).toMatchObject({ contested: true, reconstructed: true });
  });

  const organization = (patch: Partial<Pe["organizations"][number]>): Pe["organizations"][number] =>
    ({
      key: "org-1",
      kind: "organization",
      organizationId: "o1",
      organizationName: "Nonstop",
      roles: [],
      administeredBy: null,
      from: null,
      to: null,
      totalHours: 0,
      legalEntityRelation: null,
      ...patch,
    }) as unknown as Pe["organizations"][number];

  it("a leadership role is a season with its own dates and no hours (decision 0025)", () => {
    const p = build(
      blank({
        professionalExperience: experience({
          organizations: [
            organization({
              totalHours: 5000,
              roles: [
                {
                  relationship: "owner",
                  title: null,
                  startedAt: "2018-05-01",
                  endedAt: null,
                  current: true,
                  source: "membership",
                  engagementContextId: null,
                },
              ],
            }),
          ],
        }),
      }),
    );
    expect(p.seasons[0]).toMatchObject({
      source: "leadership",
      title: "Nonstop",
      role: "rel:owner",
      hours: null,
      hoursNotStated: false,
      evidence: "organization_record",
    });
    expect(p.seasons[0]?.period).toMatchObject({ from: "2018-05-01", current: true });
  });

  it("an earlier legal entity's work never reads twice beside its own records", () => {
    const period = {
      id: "per",
      label: "Vivat Rex",
      from: null,
      to: null,
      basis: "owner",
      legalEntityRelation: "sold_and_continued_by_new_entity",
      legalEntityLabel: "Vivat Rex",
      sourceLabels: ["Vivat Rex PL"],
    };
    const pe = experience({
      organizations: [
        organization({
          key: "entity",
          kind: "earlier_legal_entity",
          organizationName: "Vivat Rex",
          totalHours: 800,
          administeredBy: { organizationId: "o1", organizationName: "Nonstop" },
          roles: [],
        }),
      ],
      roles: [{ organizationName: "Nonstop", businessPeriods: [period] }] as unknown as Pe["roles"],
    });
    const alone = build(blank({ professionalExperience: pe })).seasons.find((s) => s.source === "earlier_entity");
    expect(alone?.hours).toEqual({ kind: "entity", hours: 800 });

    const both = build(
      blank({ professionalExperience: pe, organizationHistory: [orgRecord({ sourceLabel: "Vivat Rex PL" })] }),
    ).seasons;
    expect(both.find((s) => s.source === "earlier_entity")?.hours).toBeNull();
    expect(both.find((s) => s.source === "organization_record")?.band).toEqual({
      kind: "legal_entity",
      label: "Vivat Rex",
      administeredBy: "Nonstop",
    });
  });
});

describe("seasonPeriodLabel", () => {
  const stated = (from: string | null, to: string | null, current = false) =>
    ({ from, to, current, precision: "stated" }) as const;

  it("a stated year stays a year", () => {
    expect(seasonPeriodLabel(stated("2018-01-01", "2019-12-31"), "en", "now")).toBe("2018 – 2019");
    expect(seasonPeriodLabel(stated("2018-01-01", "2018-12-31"), "en", "now")).toBe("2018");
  });

  it("an organization's 1 January is a real date, not a stated year", () => {
    expect(seasonPeriodLabel({ ...stated("2018-01-01", "2019-12-31"), precision: "recorded" }, "en", "now")).toBe(
      "Jan 2018 – Dec 2019",
    );
  });

  it("a running season ends at the reader's word for now; no dates at all is null", () => {
    expect(seasonPeriodLabel(stated("2018-01-01", null, true), "en", "now")).toBe("2018 – now");
    expect(seasonPeriodLabel(stated(null, null), "en", "now")).toBeNull();
  });
});

describe("skills: each with its own state, never a rating", () => {
  it("keeps every state apart, in evidence order", () => {
    const p = build(
      blank({
        tiers: { confirmed: ["roofing"], evidence: ["site-supervision"], declared: ["welding"] },
        skillPractice: {
          roofing: {
            attributedHours: 40,
            confirmedHours: 20,
            sharedHours: 0,
            share: 1,
            entries: 4,
            days: 4,
            contexts: 1,
            lastWorkedDay: "2026-01-01",
          },
          "site-supervision": {
            attributedHours: 5,
            confirmedHours: 0,
            sharedHours: 0,
            share: 0.1,
            entries: 1,
            days: 1,
            contexts: 1,
            lastWorkedDay: "2026-01-01",
          },
        },
        declaredClaims: [{ label: "Komandos planavimas", origin: "profile" }],
        certificateDocs: [
          { typeSlug: "work-at-height", country: "LT", validUntil: "2027-01-01", reviewerVerified: true },
          { typeSlug: "first-aid", country: "LT", validUntil: null, reviewerVerified: false },
        ],
        declaredCertificates: [
          { title: "Saugos kursai", description: null, achievedAt: null, achievementTypeSlug: "declared_certificate", confirmedByManager: false },
        ],
        languages: [{ lang: "no", level: "B1" }],
      }),
    );
    const of = (state: string) => p.skills.filter((s) => s.state === state).map((s) => s.name);
    expect(of("confirmed")).toEqual(["skill:roofing"]);
    expect(of("certified")).toEqual(["doc:work-at-height"]);
    expect(of("recorded")).toEqual(["skill:site-supervision"]);
    expect(of("declared")).toEqual(["skill:welding", "Komandos planavimas", "doc:first-aid", "Saugos kursai", "lang:no"]);
    expect(of("potential")).toEqual(["skill:team-coordination", "skill:work-scheduling"]);
    expect(p.skills[0]?.time).toMatchObject({ kind: "attributed", attributedHours: 40, confirmedHours: 20 });
    expect(p.skills.find((s) => s.name === "doc:first-aid")?.unverifiedDocument).toBe(true);
    expect(p.skills.find((s) => s.state === "potential")?.from).toEqual(["skill:site-supervision"]);
    expect(p.skills.find((s) => s.name === "lang:no")?.level).toBe("B1");
  });

  it("a raw skill link with no live work behind it points at nothing potential", () => {
    const p = build(blank({ tiers: { confirmed: [], evidence: ["site-supervision"], declared: [] } }));
    expect(p.skills.filter((s) => s.state === "potential")).toEqual([]);
  });

  it("a document only counts as certified when a reviewer verified it", () => {
    const p = build(
      blank({ certificateDocs: [{ typeSlug: "x", country: null, validUntil: null, reviewerVerified: false }] }),
    );
    expect(p.skills[0]?.state).toBe("declared");
  });

  it("holds no score, percent or level of the person anywhere", () => {
    const p = build(
      blank({
        tiers: { confirmed: ["roofing"], evidence: [], declared: [] },
        workHistory: [engagement({})],
        proof: [proofRow({})],
      }),
    );
    expect(Object.keys(p)).toEqual([
      "hero",
      "stats",
      "journalTruncated",
      "seasons",
      "skills",
      "skillTimeUnknown",
      "nextMove",
    ]);
    expect(JSON.stringify(p)).not.toMatch(/score|percent|rating|overall|strength|ovr/i);
  });
});

describe("hero and what only the person sees", () => {
  const cv = blank({
    professionSlugs: [
      { slug: "roofer", label: null, isPrimary: true },
      { slug: null, label: "Brigadininkas", isPrimary: false },
    ],
    privateDetails: { ...blank().privateDetails, availabilityStatus: "available", availableFrom: "2027-03-01" },
    growthAdjacent: [{ professionId: "site-manager", sharedSkills: ["roofing", "planning"], missingSkills: ["safety"] }],
    tiers: { confirmed: ["roofing"], evidence: ["planning"], declared: [] },
  });

  it("names the roles, the place and the person's own portrait", () => {
    const p = build(cv, { place: "Lietuva", portraitUrl: "https://signed/one" });
    expect(p.hero).toMatchObject({
      roles: ["prof:roofer", "Brigadininkas"],
      place: "Lietuva",
      portraitUrl: "https://signed/one",
      availability: { status: "available", from: "2027-03-01" },
    });
  });

  it("a date already passed says nothing; an unknown status is no availability", () => {
    const past = { ...cv.privateDetails, availableFrom: "2026-01-01" };
    expect(build({ ...cv, privateDetails: past }).hero.availability).toEqual({ status: "available", from: null });
    const odd = { ...cv.privateDetails, availabilityStatus: "whatever" };
    expect(build({ ...cv, privateDetails: odd }).hero.availability).toBeNull();
  });

  it("the next move splits confirmed, in-records and missing, from the career journey", () => {
    expect(build(cv).nextMove).toEqual({
      state: "items",
      items: [
        {
          key: "site-manager",
          name: "prof:site-manager",
          confirmed: ["skill:roofing"],
          inRecords: ["skill:planning"],
          missing: ["skill:safety"],
        },
      ],
    });
  });

  it("anyone other than the person gets neither availability nor the next move", () => {
    const p = build(cv, { readerIsThePerson: false });
    expect(p.hero.availability).toBeNull();
    expect(p.nextMove).toBeNull();
  });
});

describe("season photos", () => {
  const cv = blank({
    workHistory: [engagement({})],
    professionalExperience: experience({
      lines: [{ engagementContextId: "e1", projectId: "pr1" }],
    }),
  });

  it("carries only the person's own photo, one per project", () => {
    const profile = build(cv);
    expect(seasonPhotoProjects(profile)).toEqual(["pr1"]);
    const photos = new Map([
      [
        "pr1",
        [
          { workerId: "someone-else", signedUrl: "https://signed/other" },
          { workerId: "me", signedUrl: "https://signed/mine" },
        ],
      ],
    ]);
    expect(withSeasonPhotos(profile, photos, "me").seasons[0]?.photoUrl).toBe("https://signed/mine");
  });

  it("no own photo, no URL or no known worker means no image, never a stand-in", () => {
    const profile = build(cv);
    const others = new Map([["pr1", [{ workerId: "someone-else", signedUrl: "https://signed/other" }]]]);
    expect(withSeasonPhotos(profile, others, "me").seasons[0]?.photoUrl).toBeNull();
    const unsigned = new Map([["pr1", [{ workerId: "me", signedUrl: null }]]]);
    expect(withSeasonPhotos(profile, unsigned, "me").seasons[0]?.photoUrl).toBeNull();
    const mine = new Map([["pr1", [{ workerId: "me", signedUrl: "https://signed/mine" }]]]);
    expect(withSeasonPhotos(profile, mine, null).seasons[0]?.photoUrl).toBeNull();
  });

  it("bounds the gallery reads", () => {
    const many = blank({
      workHistory: Array.from({ length: 8 }, (_, i) => engagement({ id: `e${i}`, endedAt: `201${i}-12-31` })),
      professionalExperience: experience({
        lines: Array.from({ length: 8 }, (_, i) => ({ engagementContextId: `e${i}`, projectId: `pr${i}` })),
      }),
    });
    expect(seasonPhotoProjects(build(many))).toHaveLength(ATHLETE_PHOTO_PROJECTS_MAX);
  });
});

describe("the route stays apart from the default CV", () => {
  it("only the exact query value reaches this form", () => {
    expect(isCvProfileTemplate("profile")).toBe(true);
    expect(isCvProfileTemplate(["profile"])).toBe(true);
    expect(isCvProfileTemplate(undefined)).toBe(false);
    expect(isCvProfileTemplate("eu")).toBe(false);
    expect(isCvProfileTemplate("Profile")).toBe(false);
  });

  it("is not a row of the template list, so the default CV draws no link to it", () => {
    expect(CV_TEMPLATES.map((t) => t.id)).toEqual(["standard", "compact", "eu"]);
    expect(parseCvTemplateId("profile")).toBe("standard");
  });
});

describe.each(["lt", "en", "ru", "nl", "de", "pl", "sv"])("the view in %s", (locale) => {
  const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")) as AbstractIntlMessages;
  const tr = (namespace: string): AthleteTranslator => {
    const t = createTranslator({ locale, messages, namespace: namespace as never });
    return ((key: string, values?: Record<string, string | number>) => (t as never as AthleteTranslator)(key, values)) as AthleteTranslator;
  };
  const copy: AthleteProfileCopy = {
    a: tr("cvExport.athlete"),
    cv: tr("cvExport"),
    premium: tr("cvExport.premium"),
    orgHistory: tr("cvOrganizationHistory"),
    tier: tr("evidenceTier"),
    journey: tr("careerJourney"),
    showAll: (count) => tr("common.disclosure")("showAll", { count }),
  };
  const render = (cv: AthleteCvInput, patch: Partial<Parameters<typeof buildAthleteProfile>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(AthleteProfileView, {
        profile: build(cv, patch),
        locale,
        formatHours: (h) => `${h} h`,
        copy,
      }),
    );

  it("a nearly empty person gets a whole page: initials, words, ways forward, no 0 and no image", () => {
    const html = render(blank());
    expect(html).toContain('data-testid="athlete-monogram"');
    expect(html).toContain("RP");
    expect(html).not.toContain("<img");
    expect(html).toContain("/dashboard/journal");
    expect(html).toContain("/dashboard/profile");
    expect(html).toContain('href="/cv"');
    expect(html).not.toMatch(/>0</);
    expect(html.match(/data-testid="athlete-stat-/g)).toHaveLength(2);
    expect(html).not.toContain("MISSING_MESSAGE");
  });

  it("every state, stat and qualifier has words, and no meter of the person exists", () => {
    const html = render(
      blank({
        professionSlugs: [{ slug: null, label: "Stogdengys", isPrimary: true }],
        recordedHoursTotal: 100,
        recordedHoursConfirmed: 40,
        organizationRecordedHours: { ...blank().organizationRecordedHours!, totalHours: 800 },
        professionalExperience: experience({ total: 900, confirmed: 40, orgPeriods: 800, projects: 2 }),
        workHistory: [
          engagement({}),
          engagement({ id: "e2", kind: "practice", orgName: null, recorded: null }),
          engagement({ id: "e3" }),
        ],
        proof: [proofRow({}), proofRow({ engagementId: "e3", selfConfirmed: true })],
        organizationHistory: [
          orgRecord({ dayHours: 5, dayRecords: 2, contested: true, reconstructed: true }),
          orgRecord({ key: "o2", proof: ["CLIENT_ACCEPTED"], periodHours: null, periodRecords: 0 }),
        ],
        tiers: { confirmed: ["roofing"], evidence: ["site-supervision"], declared: ["welding"] },
        certificateDocs: [
          { typeSlug: "a", country: null, validUntil: "2027-01-01", reviewerVerified: true },
          { typeSlug: "b", country: null, validUntil: null, reviewerVerified: false },
        ],
        languages: [{ lang: "no", level: "B1" }],
        growthAdjacent: [{ professionId: "x", sharedSkills: ["roofing", "site-supervision"], missingSkills: ["welding"] }],
        privateDetails: { ...blank().privateDetails, availabilityStatus: "busy", availableFrom: "2027-03-01" },
      }),
      { place: "Lietuva", portraitUrl: "https://signed/one" },
    );
    expect(html).toContain('data-testid="athlete-portrait"');
    expect(html).toContain('data-testid="athlete-availability"');
    expect(html).toContain('data-testid="athlete-seasons-note"');
    expect(html).not.toContain("MISSING_MESSAGE");
    expect(html).not.toContain("cvExport.");
    expect(html).not.toMatch(/role="img"|<progress|<meter/);
  });

  it("an unknown figure shows a dash and words, never a zero", () => {
    const html = render(
      blank({
        recordedHoursTotal: null,
        recordedHoursConfirmed: null,
        organizationRecordedHours: null,
        organizationHistory: null,
        skillPractice: null,
        growthAdjacent: null,
        journalCoverage: { entriesRead: 3, truncated: true },
        tiers: { confirmed: [], evidence: [], declared: ["welding"] },
      }),
    );
    expect(html.match(/data-state="unknown"/g)).toHaveLength(3);
    expect(html).toContain("—");
    expect(html).not.toMatch(/>0( |<)/);
    expect(html).toContain('data-testid="athlete-truncated"');
  });

  it("the private regions never print, and another reader never gets them", () => {
    const cv = blank({
      growthAdjacent: [{ professionId: "x", sharedSkills: [], missingSkills: ["welding"] }],
      privateDetails: { ...blank().privateDetails, availabilityStatus: "available" },
    });
    expect(render(cv)).toMatch(/print:hidden[^>]*data-testid="athlete-next"/);
    const other = render(cv, { readerIsThePerson: false });
    expect(other).not.toContain('data-testid="athlete-next"');
    expect(other).not.toContain('data-testid="athlete-availability"');
  });
});
