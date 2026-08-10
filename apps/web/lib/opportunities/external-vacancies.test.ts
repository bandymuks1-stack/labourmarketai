/**
 * EXTERNAL VACANCIES ON THE BOARD — behaviour tests.
 *
 * Load-bearing claims:
 *   1. the unprovisioned store and the empty store stay DISTINGUISHABLE;
 *   2. an unclaimed external ad grants NO platform capability — the only
 *      route is the publisher's original advertisement;
 *   3. matching runs through the ONE engine, and what the ad does not state
 *      surfaces as explicit gaps, never as silent satisfaction.
 */
import { describe, it, expect } from "vitest";

import { loadExternalVacancyCards } from "./external-vacancies";
import { toPublicVacancyRow } from "@/lib/vacancy-store/vacancy-row";
import { computeVacancyContentHash } from "@/lib/vacancy-sources/vacancy-hash";
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";
import type { MatchSubject } from "@/lib/market/match-v1";

const NOW = "2026-08-09T18:00:00.000Z";

const SUBJECT: MatchSubject = {
  workerId: "w-1",
  skills: [{ uri: "formwork", tier: "self_declared" }],
  professionSlug: "carpenter",
  country: "SE",
  preferredCountries: null,
  city: null,
  lat: null,
  lng: null,
  availability: "available",
  languages: ["sv"],
  languageLevels: null,
  salaryMinEur: null,
  accommodationNeeded: null,
  experienceYears: null,
} as unknown as MatchSubject;

function vacancy(over: Partial<PublicVacancyV1> = {}): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: over.externalId ?? "ad-1",
    titleRaw: over.titleRaw ?? "Snickare",
    descriptionRaw: over.descriptionRaw ?? "Vi söker en snickare.",
    sourceLanguage: "sv",
    employer: over.employer ?? { name: "Bygg AB", externalOrgId: null, homepage: null },
    location: over.location ?? {
      country: "SE",
      region: null,
      city: "Stockholm",
      lat: null,
      lng: null,
    },
    compensation: over.compensation ?? {
      currency: "SEK",
      min: 30000,
      max: 40000,
      description: null,
    },
    employmentForm: over.employmentForm ?? ("permanent" as const),
    workingTime: over.workingTime ?? ("full_time" as const),
    positions: over.positions ?? 2,
    startDate: over.startDate ?? null,
    publishedAt: over.publishedAt ?? "2026-08-01T00:00:00.000Z",
    expiresAt: over.expiresAt ?? null,
    transformVersion: "vacancy-arbetsformedlingen-v1",
  };
  return {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: "published",
    channel: "snapshot",
    capturedAt: NOW,
    occupationRaw: null,
    occupationConceptId: null,
    professionSlug: over.professionSlug ?? null,
    skillSlugs: over.skillSlugs ?? [],
    categorizationOrigin: "derived",
    requiredLanguages: over.requiredLanguages ?? [],
    applicationUrl: over.applicationUrl ?? null,
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    requestRef: "test",
    ...over,
  } as PublicVacancyV1;
}

function clientWith(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.or = self;
  chain.order = self;
  chain.range = self;
  chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? [], error: result.error ?? null }).then(ok, err);
  return { from: () => chain as never } as never;
}

describe("store states stay distinguishable", () => {
  it("unprovisioned store -> available:false, no cards", async () => {
    const result = await loadExternalVacancyCards(
      clientWith({ error: { code: "42P01" }, data: null }),
      SUBJECT,
      { nowIso: NOW },
    );
    expect(result).toEqual({ available: false, cards: [] });
  });

  it("provisioned-but-empty store -> available:true, no cards", async () => {
    const result = await loadExternalVacancyCards(clientWith({ data: [] }), SUBJECT, {
      nowIso: NOW,
    });
    expect(result).toEqual({ available: true, cards: [] });
  });
});

describe("an unclaimed external ad", () => {
  it("grants NO platform capability — the only route is the original ad", async () => {
    const row = toPublicVacancyRow(
      vacancy({ applicationUrl: "arbetsformedlingen.se/ad/1" }),
      NOW,
      null,
    );
    const result = await loadExternalVacancyCards(
      clientWith({ data: [row] }),
      SUBJECT,
      { nowIso: NOW },
    );

    expect(result.cards).toHaveLength(1);
    const card = result.cards[0];
    expect(card.capabilities.canApplyInternally).toBe(false);
    expect(card.capabilities.canShortlistForEmployer).toBe(false);
    expect(card.capabilities.canBookThroughPlatform).toBe(false);
    expect(card.capabilities.canMessageEmployerInbox).toBe(false);
    expect(card.capabilities.mustShowSourceAttribution).toBe(true);
    expect(card.view.provenance.applicationRoute).toBe("source_original");
    expect(card.view.provenance.managementState).toBe("unclaimed_external");
  });

  it("carries per-card attribution and the honest provenance codes", async () => {
    const row = toPublicVacancyRow(vacancy(), NOW, null);
    const result = await loadExternalVacancyCards(
      clientWith({ data: [row] }),
      SUBJECT,
      { nowIso: NOW },
    );
    const provenance = result.cards[0].view.provenance;
    expect(provenance.attributionCode).toBe(
      "vacancySources.attribution.arbetsformedlingen",
    );
    expect(provenance.origin).toBe("external_public_source");
  });
});

describe("matching honesty", () => {
  it("an ad the recognizer could not read yields insufficient data, not a score", async () => {
    // skillSlugs empty -> no requirement set -> the ONE engine's honest answer.
    const row = toPublicVacancyRow(vacancy({ skillSlugs: [] }), NOW, null);
    const result = await loadExternalVacancyCards(
      clientWith({ data: [row] }),
      SUBJECT,
      { nowIso: NOW },
    );
    const card = result.cards[0];
    expect(card.match.status).toBe("insufficient_data");
    expect(card.matchingGaps).toContain("no_requirement_set");
  });

  it("what the ad does not state is an explicit gap, never silent satisfaction", async () => {
    const row = toPublicVacancyRow(
      vacancy({
        skillSlugs: ["formwork"],
        professionSlug: "carpenter",
        requiredLanguages: [],
        startDate: null,
        compensation: { currency: "SEK", min: 30000, max: 40000, description: null },
      }),
      NOW,
      null,
    );
    const result = await loadExternalVacancyCards(
      clientWith({ data: [row] }),
      SUBJECT,
      { nowIso: NOW },
    );
    const gaps = result.cards[0].matchingGaps;
    expect(gaps).toContain("no_language_requirement");
    expect(gaps).toContain("no_start_date");
    // SEK pay is real but NOT comparable to the platform's EUR pay logic —
    // an honest gap, never a converted number.
    expect(gaps).toContain("pay_not_comparable");
  });

  it("ranks with the shared comparator — a scoring ad above an unreadable one", async () => {
    const readable = toPublicVacancyRow(
      vacancy({ externalId: "readable", skillSlugs: ["formwork"], professionSlug: "carpenter" }),
      NOW,
      null,
    );
    const unreadable = toPublicVacancyRow(
      vacancy({ externalId: "unreadable", skillSlugs: [] }),
      NOW,
      null,
    );
    const result = await loadExternalVacancyCards(
      clientWith({ data: [unreadable, readable] }),
      SUBJECT,
      { nowIso: NOW },
    );
    expect(result.cards[0].key).toBe("arbetsformedlingen:readable");
  });
});
