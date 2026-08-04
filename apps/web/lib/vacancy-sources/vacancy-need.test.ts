import { describe, it, expect } from "vitest";
import { buildNeedFromVacancy } from "./vacancy-need";
import { categorizeVacancy } from "./vacancy-categorization";
import { computeVacancyContentHash } from "./vacancy-hash";
import { computeContextFit } from "@/lib/market/fit";
import type { PublicVacancyV1 } from "./vacancy-contract";

function vacancy(over: Partial<PublicVacancyV1> = {}): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: "ad-1",
    titleRaw: "Snickare",
    descriptionRaw: "Vi söker en snickare.",
    sourceLanguage: "sv",
    employer: { name: "Bygg AB", externalOrgId: null, homepage: null },
    location: {
      country: "SE",
      region: "Stockholms län",
      city: "Stockholm",
      lat: 59.33,
      lng: 18.07,
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
    applicationUrl: null,
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    requestRef: "test",
    ...over,
  };
}

describe("the imported vacancy feeds the EXISTING matching engine", () => {
  it("produces a MatchNeed the canonical fit engine accepts", () => {
    const { need } = buildNeedFromVacancy(vacancy(), "recognized_from_text");
    // The bridge's output is a real input to the platform's own fit engine —
    // this is the whole point of the pipeline, so it is asserted directly.
    const fit = computeContextFit(need.skillIds ?? [], [
      { uri: "carpentry", verified: false },
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.matchedTotal).toBe(1);
    expect(fit!.needTotal).toBe(1);
    expect(fit!.pct).toBe(100);
    expect(fit!.matchedUris).toEqual(["carpentry"]);
  });

  it("carries geography, dates and languages through unchanged", () => {
    const { need } = buildNeedFromVacancy(vacancy(), "recognized_from_text");
    expect(need.country).toBe("SE");
    expect(need.city).toBe("Stockholm");
    expect(need.lat).toBe(59.33);
    expect(need.lng).toBe(18.07);
    expect(need.startDate).toBe("2026-09-01");
    expect(need.languages).toEqual(["sv"]);
  });

  it("labels the requirement set with its derivation tier — never as human-structured", () => {
    const { need, source } = buildNeedFromVacancy(
      vacancy(),
      "recognized_from_text",
    );
    expect(need.needSource).toBe("recognized_from_text");
    expect(source).toBe("recognized_from_text");
    expect(need.needSource).not.toBe("human_structured");
  });
});

describe("honesty rules the bridge enforces by construction", () => {
  it("a SEK salary is NOT converted to EUR — pay is reported as not comparable", () => {
    const { need, missingForMatching } = buildNeedFromVacancy(
      vacancy(),
      "recognized_from_text",
    );
    expect(need.payOfferedEurMax).toBeNull();
    expect(missingForMatching).toContain("pay_not_comparable");
  });

  it("an ad genuinely quoted in EUR IS comparable", () => {
    const { need, missingForMatching } = buildNeedFromVacancy(
      vacancy({
        compensation: {
          currency: "EUR",
          min: 2600,
          max: 3400,
          description: null,
        },
      }),
      "recognized_from_text",
    );
    expect(need.payOfferedEurMax).toBe(3400);
    expect(missingForMatching).not.toContain("pay_not_comparable");
  });

  it("never fabricates a structured_v2 cluster or a search radius", () => {
    const { need } = buildNeedFromVacancy(vacancy(), "recognized_from_text");
    expect(need.structuredV2).toBeNull();
    expect(need.radiusKm).toBeNull();
    expect(need.accommodationProvided).toBeNull();
    expect(need.escoSkillUris).toEqual([]);
  });

  it("reports every fact a platform demand would carry that this ad does not", () => {
    const bare = vacancy({
      professionSlug: null,
      skillSlugs: [],
      startDate: null,
      requiredLanguages: [],
      location: {
        country: "SE",
        region: null,
        city: null,
        lat: null,
        lng: null,
      },
    });
    const { missingForMatching } = buildNeedFromVacancy(bare, null);
    expect(missingForMatching).toEqual(
      expect.arrayContaining([
        "no_requirement_set",
        "no_profession",
        "no_city",
        "no_start_date",
        "no_language_requirement",
        "pay_not_comparable",
      ]),
    );
  });

  it("a fully-specified EUR ad reports no gaps", () => {
    const complete = vacancy({
      compensation: {
        currency: "EUR",
        min: 2600,
        max: 3400,
        description: null,
      },
    });
    const { missingForMatching } = buildNeedFromVacancy(
      complete,
      "recognized_from_text",
    );
    expect(missingForMatching).toEqual([]);
  });
});

describe("categorization reuses the platform recognizer and stays suggestion-grade", () => {
  it("is deterministic — same input, same output", () => {
    const input = {
      titleRaw: "Lagerarbetare sökes",
      descriptionRaw: "Du kommer att arbeta med truck och orderplock.",
      occupationRaw: "Lagerarbetare",
    };
    expect(categorizeVacancy(input)).toEqual(categorizeVacancy(input));
  });

  it("reports honest non-recognition instead of inventing a category", () => {
    const result = categorizeVacancy({
      titleRaw: "zzzz",
      descriptionRaw: "qqqq",
      occupationRaw: null,
    });
    expect(result.unrecognized).toBe(true);
    expect(result.professionSlug).toBeNull();
    expect(result.skillSlugs).toEqual([]);
    expect(result.skillSource).toBeNull();
  });

  it("marks the origin 'derived' whenever the profession did not come from the publisher", () => {
    const result = categorizeVacancy({
      titleRaw: "Vi söker någon",
      descriptionRaw: "",
      occupationRaw: null,
    });
    expect(result.origin).toBe("derived");
  });

  it("never returns more derived skills than the shared bound allows", () => {
    const result = categorizeVacancy({
      titleRaw: "Allt-i-allo",
      descriptionRaw: "truck orderplock städning målning svetsning ".repeat(40),
      occupationRaw: null,
    });
    expect(result.skillSlugs.length).toBeLessThanOrEqual(24);
  });
});
