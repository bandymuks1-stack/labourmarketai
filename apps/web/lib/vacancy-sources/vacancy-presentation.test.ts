import { describe, it, expect } from "vitest";
import {
  opportunityCapabilities,
  toCanonicalOpportunityView,
} from "./vacancy-presentation";
import { computeVacancyContentHash } from "./vacancy-hash";
import type { PublicVacancyV1 } from "./vacancy-contract";

function vacancy(over: Partial<PublicVacancyV1> = {}): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: "ad-1",
    titleRaw: "Snickare",
    descriptionRaw: "Vi söker en snickare.",
    sourceLanguage: "sv",
    employer: { name: "Bygg AB", externalOrgId: "5566778899", homepage: null },
    location: {
      country: "SE",
      region: "Stockholms län",
      city: "Stockholm",
      lat: null,
      lng: null,
    },
    compensation: {
      currency: "SEK",
      min: 32000,
      max: 41000,
      description: null,
    },
    employmentForm: "permanent" as const,
    workingTime: "full_time" as const,
    positions: 2,
    startDate: "2026-09-01",
    publishedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: null,
    transformVersion: "vacancy-arbetsformedlingen-v1",
  };
  return {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: "published",
    channel: "snapshot",
    capturedAt: "2026-08-04T09:00:00.000Z",
    occupationRaw: "Snickare",
    occupationConceptId: null,
    professionSlug: "carpenter",
    skillSlugs: ["carpentry"],
    categorizationOrigin: "derived",
    requiredLanguages: ["sv"],
    applicationUrl: "https://arbetsformedlingen.se/ad/1",
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    requestRef: "test",
    ...over,
  };
}

describe("one canonical opportunity contract — not a second product", () => {
  it("carries the same canonical fields a direct opportunity carries", () => {
    const view = toCanonicalOpportunityView(vacancy());
    expect(Object.keys(view).sort()).toEqual(
      [
        "city",
        "country",
        "description",
        "employerName",
        "employmentForm",
        "languages",
        "payCurrency",
        "payMax",
        "payMin",
        "positions",
        "professionSlug",
        "provenance",
        "publishedAt",
        "skillSlugs",
        "startDate",
        "title",
        "workingTime",
      ].sort(),
    );
  });

  it("provenance is the ONLY axis on which it differs from a direct opportunity", () => {
    const view = toCanonicalOpportunityView(vacancy());
    expect(view.provenance.origin).toBe("external_public_source");
    expect(view.provenance.managementState).toBe("unclaimed_external");
  });

  it("never converts or estimates pay — SEK stays SEK", () => {
    const view = toCanonicalOpportunityView(vacancy());
    expect(view.payCurrency).toBe("SEK");
    expect(view.payMin).toBe(32000);
    expect(view.payMax).toBe(41000);
  });

  it("passes missing facts through as missing", () => {
    const view = toCanonicalOpportunityView(
      vacancy({
        positions: null,
        startDate: null,
        professionSlug: null,
        skillSlugs: [],
        requiredLanguages: [],
        compensation: { currency: null, min: null, max: null, description: null },
      }),
    );
    expect(view.positions).toBeNull();
    expect(view.startDate).toBeNull();
    expect(view.professionSlug).toBeNull();
    expect(view.skillSlugs).toEqual([]);
    expect(view.payCurrency).toBeNull();
  });

  it("exposes i18n CODES, never technical enum names, for the user-visible notes", () => {
    const p = toCanonicalOpportunityView(vacancy()).provenance;
    for (const code of [
      p.attributionCode,
      p.originNoteCode,
      p.managementNoteCode,
    ]) {
      expect(code).toMatch(/^[a-zA-Z]+(\.[a-zA-Z]+)+$/);
      expect(code).not.toContain("unclaimed_external");
      expect(code).not.toContain("external_public_source");
    }
  });
});

describe("application route before an employer claim", () => {
  it("an UNCLAIMED vacancy routes the worker to the publisher's own route", () => {
    const p = toCanonicalOpportunityView(vacancy()).provenance;
    expect(p.applicationRoute).toBe("source_original");
    expect(p.applicationUrl).toBe("https://arbetsformedlingen.se/ad/1");
  });

  it("no application URL means UNAVAILABLE — never a fabricated link", () => {
    const p = toCanonicalOpportunityView(
      vacancy({ applicationUrl: null }),
    ).provenance;
    expect(p.applicationRoute).toBe("unavailable");
    expect(p.applicationUrl).toBeNull();
  });

  it("only a real claim switches the route to the platform's own flow", () => {
    const p = toCanonicalOpportunityView(vacancy(), {
      employerHasClaimed: true,
    }).provenance;
    expect(p.applicationRoute).toBe("platform_internal");
    expect(p.managementState).toBe("claimed");
  });

  it("claim must be exactly true — no truthy value flips the route", () => {
    for (const value of [undefined, false, null, 1, "yes", {}] as unknown[]) {
      const p = toCanonicalOpportunityView(vacancy(), {
        employerHasClaimed: value as boolean | undefined,
      }).provenance;
      expect(p.applicationRoute, String(value)).toBe("source_original");
    }
  });
});

describe("an unclaimed external vacancy offers no fake employer-side controls", () => {
  it("grants none of the internal employer capabilities", () => {
    const caps = opportunityCapabilities(
      toCanonicalOpportunityView(vacancy()).provenance,
    );
    expect(caps).toMatchObject({
      canApplyInternally: false,
      canShortlistForEmployer: false,
      canBookThroughPlatform: false,
      canMessageEmployerInbox: false,
    });
  });

  it("requires source attribution — before AND after a claim", () => {
    for (const claimed of [false, true]) {
      const caps = opportunityCapabilities(
        toCanonicalOpportunityView(vacancy(), { employerHasClaimed: claimed })
          .provenance,
      );
      expect(caps.mustShowSourceAttribution, `claimed=${claimed}`).toBe(true);
    }
  });

  it("a verified claim is what unlocks the internal capabilities", () => {
    const caps = opportunityCapabilities(
      toCanonicalOpportunityView(vacancy(), { employerHasClaimed: true })
        .provenance,
    );
    expect(caps.canApplyInternally).toBe(true);
    expect(caps.canBookThroughPlatform).toBe(true);
  });
});
