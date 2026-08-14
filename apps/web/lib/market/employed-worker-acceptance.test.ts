/**
 * EMPLOYED-WORKER ACCEPTANCE — the canonical product test.
 *
 * Doctrine (OPPORTUNITY_REALIZATION_LOCK_V1): LabourMarket.ai must be
 * demonstrably useful to a worker who ALREADY HAS A JOB. The worker
 * proposition is not "come here when unemployed" — it is: work, record
 * completed work and results, let the professional history grow, and let
 * opportunity discovery become more precise over time.
 *
 * PASS conditions pinned here (worker-acquisition readiness loop, §15/§16):
 *   1. Nothing in the match subject requires declaring unemployment —
 *      availability is optional, and UNKNOWN availability is an honest
 *      missing fact, never a penalty on match quality.
 *   2. A worker who is explicitly NOT available right now (employed, not
 *      seeking) still sees a relevant opportunity as a real "possible"
 *      match — informed, never excluded.
 *   3. Recording real work (the journal pipeline's enrichment shape) changes
 *      opportunity selection for the relevant ad while the worker stays
 *      employed — the compounding loop works without a job-seeking state.
 *   4. The improvement is visible as ranking: after enrichment the relevant
 *      Swedish ad outranks unrelated ads under the shared comparator.
 *
 * Pure: real engine, real vacancy-need builder, fixed data, no IO.
 */
import { describe, it, expect } from "vitest";

import {
  matchWorkerToNeed,
  compareMatches,
  type MatchSubject,
} from "./match-v1";
import { buildNeedFromVacancy } from "@/lib/vacancy-sources/vacancy-need";
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";

function vacancy(over: Partial<PublicVacancyV1>): PublicVacancyV1 {
  return {
    providerKey: "arbetsformedlingen",
    externalId: "ad-x",
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
    publishedAt: "2026-08-10T00:00:00.000Z",
    expiresAt: null,
    capturedAt: "2026-08-13T00:00:00.000Z",
    occupationRaw: null,
    occupationConceptId: null,
    professionSlug: null,
    skillSlugs: [],
    categorizationOrigin: "derived",
    requiredLanguages: [],
    applicationUrl: "https://arbetsformedlingen.se/ad/x",
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    transformVersion: "vacancy-arbetsformedlingen-v1",
    requestRef: "test",
    ...over,
  } as PublicVacancyV1;
}

const weldingNeed = buildNeedFromVacancy(
  vacancy({
    externalId: "ad-weld",
    titleRaw: "Svetsare",
    professionSlug: "welder",
    skillSlugs: ["welding"],
  }),
  "recognized_from_text",
).need;

const officeNeed = buildNeedFromVacancy(
  vacancy({
    externalId: "ad-office",
    titleRaw: "Kontorsassistent",
    professionSlug: "office_administrator",
    skillSlugs: ["document-administration"],
  }),
  "recognized_from_text",
).need;

/** PERSON A on day one: has a job, never states any job-seeking status. */
const EMPLOYED_DAY_ONE: MatchSubject = {
  skills: [],
  professionSlug: null,
  country: "SE",
  preferredCountries: ["SE"],
  // NOTE deliberately absent: availabilityStatus / availableFrom — being
  // employed is not a state the person must explain to use the product.
};

/** PERSON A after weeks of recording real welding work in the journal
 *  (exactly the enrichment shape the pipeline writes to worker_skills). */
const EMPLOYED_ENRICHED: MatchSubject = {
  ...EMPLOYED_DAY_ONE,
  professionSlug: "welder",
  skills: [{ uri: "welding", evidence: "work_journal" }],
};

describe("§15 PERSON A — already employed, never declares unemployment", () => {
  it("unknown availability is a missing fact, not a penalty", () => {
    const r = matchWorkerToNeed(weldingNeed, EMPLOYED_ENRICHED);
    expect(r.missingData).toContain("availability_unknown");
    // Match quality still comes from real capability coverage.
    expect(r.status).toBe("strong");
    expect(r.eligible).toBe(true);
  });

  it("recording real work changes opportunity selection while employed", () => {
    const before = matchWorkerToNeed(weldingNeed, EMPLOYED_DAY_ONE);
    const after = matchWorkerToNeed(weldingNeed, EMPLOYED_ENRICHED);
    expect(before.status).toBe("insufficient_data");
    expect(after.status).toBe("strong");
    // The evidence is journal-backed and stated beside the verdict.
    expect(after.evidence.matchedJournalSupported).toBe(1);
  });

  it("the enriched relevant ad outranks the unrelated ad (ranking changes)", () => {
    const relevant = matchWorkerToNeed(weldingNeed, EMPLOYED_ENRICHED);
    const unrelated = matchWorkerToNeed(officeNeed, EMPLOYED_ENRICHED);
    expect(compareMatches(relevant, unrelated)).toBeLessThan(0);
  });

  it("explicitly not-available-now (employed, not seeking) still sees a real possible match — informed, never excluded", () => {
    const r = matchWorkerToNeed(weldingNeed, {
      ...EMPLOYED_ENRICHED,
      availabilityStatus: "unavailable",
    } as MatchSubject);
    expect(r.status).toBe("possible");
    expect(r.eligible).toBe(true);
  });
});

describe("§16 PERSON B — campaign arrival with a declared profession", () => {
  it("a declared profession + one recorded capability yields a relevant, explained Swedish match with the real application route", () => {
    const arrival: MatchSubject = {
      skills: [{ uri: "welding", evidence: "self_declared" }],
      professionSlug: "welder",
      country: "SE",
      preferredCountries: ["SE"],
    };
    const r = matchWorkerToNeed(weldingNeed, arrival);
    expect(r.status).toBe("strong");
    // The explanation is factual: the matched capability is attributable.
    expect(r.skillFit?.matchedUris).toContain("welding");
    // What the ad does not state stays unknown — no invented facts.
    expect(r.missingData.length).toBeGreaterThan(0);
  });
});
