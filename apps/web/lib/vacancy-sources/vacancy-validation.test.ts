import { describe, it, expect } from "vitest";
import { validateVacancyRecord } from "./vacancy-validation";
import { computeVacancyContentHash } from "./vacancy-hash";
import type { PublicVacancyV1 } from "./vacancy-contract";

function record(over: Partial<PublicVacancyV1> = {}): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: "ad-1",
    titleRaw: "Snickare",
    descriptionRaw: "",
    sourceLanguage: "sv",
    employer: { name: null, externalOrgId: null, homepage: null },
    location: { country: "SE", region: null, city: null, lat: null, lng: null },
    compensation: { currency: null, min: null, max: null, description: null },
    employmentForm: "unknown" as const,
    workingTime: "unknown" as const,
    positions: null,
    startDate: null,
    publishedAt: "2026-08-04T08:00:00.000Z",
    expiresAt: null,
    transformVersion: "vacancy-arbetsformedlingen-v1",
  };
  return {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: "published",
    channel: "stream",
    capturedAt: "2026-08-04T09:00:00.000Z",
    occupationRaw: null,
    occupationConceptId: null,
    professionSlug: null,
    skillSlugs: [],
    categorizationOrigin: "none",
    requiredLanguages: [],
    applicationUrl: null,
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    requestRef: "test",
    ...over,
  } as PublicVacancyV1;
}

describe("the headline requirement and withdrawals", () => {
  it("requires a headline on a LIVE ad", () => {
    // A vacancy nobody can name is not a vacancy.
    expect(record({ titleRaw: "" })).toBeTruthy();
    expect(validateVacancyRecord(record({ titleRaw: "" }))).toContain(
      "missing_title",
    );
    expect(validateVacancyRecord(record({ titleRaw: "   " }))).toContain(
      "missing_title",
    );
  });

  it("does NOT require a headline on a withdrawal", () => {
    // A publisher retiring an ad sends identity plus "removed", not a fresh
    // copy of the headline. Requiring one here rejected every withdrawal we
    // ever received, so an ad taken down at the source stayed live in our
    // store forever.
    const problems = validateVacancyRecord(
      record({ titleRaw: "", lifecycle: "removed" }),
    );

    expect(problems).toEqual([]);
  });

  it("still requires IDENTITY on a withdrawal", () => {
    // Identity is the thing that actually protects the store: a withdrawal
    // without it could deactivate anything.
    const problems = validateVacancyRecord(
      record({ titleRaw: "", externalId: "", lifecycle: "removed" }),
    );

    expect(problems).toContain("missing_external_id");
  });

  it("does not otherwise relax the rules for a withdrawal", () => {
    const problems = validateVacancyRecord(
      record({
        titleRaw: "",
        lifecycle: "removed",
        expiresAt: "not-a-date",
      }),
    );

    expect(problems).toContain("invalid_expires_at");
    expect(problems).not.toContain("missing_title");
  });
});
