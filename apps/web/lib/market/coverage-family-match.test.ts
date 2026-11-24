/**
 * COVERAGE-FAMILY MATCHING VALUE — proof the taxonomy-coverage fix produces
 * useful worker matching, not merely better statistics (readiness loop §5).
 *
 * For each newly reachable Swedish family (warehouse, cleaning, care, retail,
 * kitchen, production) a representative profile is matched against a
 * representative categorized ad through the real chain
 * (`buildNeedFromVacancy` → `matchWorkerToNeed`) with the family's REAL
 * profession→skill expansion slugs (lib/taxonomy/profession-skills.ts).
 *
 * Pinned per case:
 *   - the relevant ad yields a real match with attributable matched skills;
 *   - a cross-family ad is NOT improved (irrelevant rejected);
 *   - unknown criteria stay unknown — no invented salary/language/location.
 */
import { describe, it, expect } from "vitest";

import { matchWorkerToNeed, type MatchSubject } from "./match-v1";
import { buildNeedFromVacancy } from "@/lib/vacancy-sources/vacancy-need";
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";

function ad(
  over: Partial<PublicVacancyV1> & { externalId: string },
): PublicVacancyV1 {
  return {
    providerKey: "arbetsformedlingen",
    contentHash: "h",
    lifecycle: "published",
    channel: "snapshot",
    titleRaw: "Annons",
    descriptionRaw: "Beskrivning",
    sourceLanguage: "sv",
    employer: { name: "AB", externalOrgId: null, homepage: null },
    location: {
      country: "SE",
      region: null,
      city: "Stockholm",
      lat: null,
      lng: null,
    },
    compensation: { currency: null, min: null, max: null, description: null },
    employmentForm: "permanent",
    workingTime: "full_time",
    positions: 1,
    startDate: null,
    publishedAt: "2026-08-13T00:00:00.000Z",
    expiresAt: null,
    capturedAt: "2026-08-14T00:00:00.000Z",
    occupationRaw: null,
    occupationConceptId: null,
    professionSlug: null,
    skillSlugs: [],
    categorizationOrigin: "derived",
    requiredLanguages: [],
    applicationUrl: "https://arbetsformedlingen.se/ad",
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    transformVersion: "vacancy-arbetsformedlingen-v2",
    requestRef: "test",
    ...over,
  } as PublicVacancyV1;
}

/** family → [profession, worker-held skills (real expansion slugs), ad skills] */
const FAMILIES: readonly {
  name: string;
  profession: string;
  workerSkills: string[];
  adSkills: string[];
}[] = [
  {
    name: "warehouse/logistics",
    profession: "warehouse_worker",
    workerSkills: ["forklift-operation", "order-picking"],
    adSkills: ["forklift-operation", "order-picking"],
  },
  {
    name: "cleaning/service",
    profession: "cleaner",
    workerSkills: ["cleaning-services", "housekeeping"],
    adSkills: ["cleaning-services", "housekeeping"],
  },
  {
    name: "care",
    profession: "caregiver",
    workerSkills: ["elderly-care", "first-aid"],
    adSkills: ["elderly-care", "first-aid"],
  },
  {
    name: "retail",
    profession: "sales_assistant",
    workerSkills: ["cashier", "customer-service"],
    adSkills: ["cashier", "customer-service"],
  },
  {
    name: "kitchen/restaurant",
    profession: "kitchen_helper",
    workerSkills: ["dishwashing", "kitchen-help"],
    adSkills: ["dishwashing", "kitchen-help"],
  },
  {
    name: "production",
    profession: "production_worker",
    workerSkills: ["assembly-work", "production-line"],
    adSkills: ["assembly-work", "production-line"],
  },
];

/** A deliberately unrelated ad — no family's skills overlap software work. */
const UNRELATED = buildNeedFromVacancy(
  ad({
    externalId: "ad-dev",
    professionSlug: "software_developer",
    skillSlugs: ["software-development"],
  }),
  "recognized_from_text",
).need;

describe.each(FAMILIES)("$name", ({ profession, workerSkills, adSkills }) => {
  const need = buildNeedFromVacancy(
    ad({
      externalId: `ad-${profession}`,
      professionSlug: profession,
      skillSlugs: adSkills,
    }),
    "recognized_from_text",
  ).need;

  const subject: MatchSubject = {
    skills: workerSkills.map((uri) => ({
      uri,
      evidence: "self_declared" as const,
    })),
    professionSlug: profession,
    country: "SE",
    preferredCountries: ["SE"],
  };

  it("the relevant categorized ad is a real, attributable match", () => {
    const r = matchWorkerToNeed(need, subject);
    expect(r.status).toBe("strong");
    expect(r.eligible).toBe(true);
    expect(r.skillFit?.matchedTotal).toBe(workerSkills.length);
    for (const s of workerSkills) expect(r.skillFit?.matchedUris).toContain(s);
  });

  it("a cross-family ad is rejected, not inflated", () => {
    const r = matchWorkerToNeed(UNRELATED, subject);
    expect(["weak", "insufficient_data"]).toContain(r.status);
    expect(r.skillFit?.matchedTotal ?? 0).toBe(0);
  });

  it("what the ad does not state stays unknown — nothing invented", () => {
    const r = matchWorkerToNeed(need, subject);
    // The fixture ad states no salary, no languages, no start date — the
    // result must carry missing-data notes, never satisfied criteria.
    expect(r.missingData.length).toBeGreaterThan(0);
    const satisfiedSources = [...r.matchedHard, ...r.strengths].map(
      (c) => c.criterion,
    );
    expect(satisfiedSources).not.toContain("compensation");
    expect(satisfiedSources).not.toContain("language");
  });
});
