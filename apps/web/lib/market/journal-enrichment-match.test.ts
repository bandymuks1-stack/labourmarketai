/**
 * JOURNAL ENRICHMENT → MATCHING — deterministic proof.
 *
 * Opportunity-realization doctrine (OPPORTUNITY_REALIZATION_LOCK_V1, TEST A):
 * information the person adds about real activity must be able to CHANGE
 * which opportunities the system selects — through the real chain the journal
 * pipeline feeds (`worker_skills` → MatchSubject.skills), against the real
 * need shape external Swedish ads produce (`buildNeedFromVacancy`).
 *
 * Pinned claims:
 *   1. RELEVANT enrichment changes the verdict for the relevant ad
 *      (insufficient_data → strong on full coverage).
 *   2. Enrichment NEVER improves an unrelated ad — no cross-contamination.
 *   3. Evidence tier changes evidenceConfidence, NEVER status — a
 *      journal-supported skill matches exactly as well as a self-declared
 *      one; the difference is stated beside the verdict, not multiplied in
 *      (owner directive 2026-08-09, match-v1 doctrine).
 *
 * Pure: no IO, fixed clocks, no fabricated source facts.
 */
import { describe, it, expect } from "vitest";

import { matchWorkerToNeed, type MatchSubject } from "./match-v1";
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

const electricianAd = vacancy({
  externalId: "ad-el",
  titleRaw: "Elektriker",
  professionSlug: "electrician",
  skillSlugs: ["electrical-installation"],
});

const cookAd = vacancy({
  externalId: "ad-cook",
  titleRaw: "Kock",
  professionSlug: "cook",
  skillSlugs: ["menu-planning"],
});

const electricianNeed = buildNeedFromVacancy(
  electricianAd,
  "recognized_from_text",
).need;
const cookNeed = buildNeedFromVacancy(cookAd, "recognized_from_text").need;

/** A fresh worker before any journal/profile enrichment. */
const BARE: MatchSubject = {
  skills: [],
  professionSlug: null,
  country: "SE",
  preferredCountries: ["SE"],
};

/** The same worker AFTER the journal pipeline recognized real electrical
 *  work and wrote the skill (`worker_skills` → subject.skills, exactly the
 *  shape `buildOwnWorkerContext` produces). */
const ENRICHED: MatchSubject = {
  ...BARE,
  professionSlug: "electrician",
  skills: [{ uri: "electrical-installation", evidence: "self_declared" }],
};

describe("relevant journal enrichment changes opportunity selection", () => {
  it("before enrichment the engine says it cannot evaluate — never a fake fit", () => {
    const before = matchWorkerToNeed(electricianNeed, BARE);
    expect(before.status).toBe("insufficient_data");
  });

  it("after enrichment the relevant ad becomes a real match", () => {
    const after = matchWorkerToNeed(electricianNeed, ENRICHED);
    expect(after.status).toBe("strong");
    expect(after.skillFit?.matchedTotal).toBe(1);
  });

  it("the improvement is attributable to the added skill, not decoration", () => {
    const before = matchWorkerToNeed(electricianNeed, BARE);
    const after = matchWorkerToNeed(electricianNeed, ENRICHED);
    expect(before.status).not.toBe(after.status);
    expect(after.evidence.matchedSelfDeclared).toBe(1);
  });
});

describe("enrichment never improves an unrelated opportunity", () => {
  it("the cook ad gains no matched skill and no better verdict", () => {
    const before = matchWorkerToNeed(cookNeed, BARE);
    const after = matchWorkerToNeed(cookNeed, ENRICHED);
    // "cannot evaluate" may become "does not fit" — both are non-fits.
    // What must NEVER happen is an unrelated ad improving to possible/strong.
    expect(["insufficient_data", "weak"]).toContain(before.status);
    expect(["insufficient_data", "weak"]).toContain(after.status);
    expect(after.skillFit?.matchedTotal ?? 0).toBe(0);
    expect(
      after.evidence.matchedManagerConfirmed +
        after.evidence.matchedJournalSupported +
        after.evidence.matchedSelfDeclared,
    ).toBe(0);
  });
});

describe("evidence tier is stated beside the verdict, never multiplied into it", () => {
  it("journal-supported and self-declared coverage give EQUAL status", () => {
    const selfDeclared = matchWorkerToNeed(electricianNeed, ENRICHED);
    const journalBacked = matchWorkerToNeed(electricianNeed, {
      ...ENRICHED,
      skills: [{ uri: "electrical-installation", evidence: "work_journal" }],
    });
    const managerConfirmed = matchWorkerToNeed(electricianNeed, {
      ...ENRICHED,
      skills: [
        { uri: "electrical-installation", evidence: "manager_confirmed" },
      ],
    });

    expect(journalBacked.status).toBe(selfDeclared.status);
    expect(managerConfirmed.status).toBe(selfDeclared.status);

    expect(selfDeclared.evidenceConfidence).toBe("unverified");
    expect(journalBacked.evidenceConfidence).toBe("mixed");
    expect(managerConfirmed.evidenceConfidence).toBe("confirmed");
  });
});
