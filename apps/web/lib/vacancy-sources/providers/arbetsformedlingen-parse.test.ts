import { describe, it, expect } from "vitest";
import {
  parseArbetsformedlingenAd,
  parseArbetsformedlingenBatch,
} from "./arbetsformedlingen-parse";
import { getVacancyParser } from "./index";

const CAPTURED_AT = "2026-08-04T09:00:00.000Z";
const REQUEST_REF = "jobstream.api.jobtechdev.se/snapshot";

/** A realistically-shaped JobTech ad — nested objects, Swedish labels,
 *  `{value}`-wrapped booleans, a country label that is NOT an ISO code. */
function jobTechAd(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "29455779",
    headline: "Snickare till byggprojekt i Stockholm",
    publication_date: "2026-08-01T08:00:00+02:00",
    application_deadline: "2026-09-01T23:59:59+02:00",
    access: "2026-09-15T00:00:00+02:00",
    number_of_vacancies: 3,
    description: {
      text: "Vi söker en erfaren snickare.\n\n\n\nDu kommer att arbeta med montering av gips och trä.",
    },
    employer: {
      name: "Bygg & Montage AB",
      organization_number: "5566778899",
      url: "https://www.byggmontage.se/jobb",
    },
    workplace_address: {
      country: "Sverige",
      country_code: "SE",
      region: "Stockholms län",
      municipality: "Stockholm",
      coordinates_lat: 59.3293,
      coordinates_long: 18.0686,
    },
    occupation: { label: "Snickare", concept_id: "kJx8_Gt4_TUS" },
    employment_type: { label: "Tillsvidareanställning" },
    working_hours_type: { label: "Heltid" },
    salary_min: 32000,
    salary_max: 41000,
    salary_description: "Enligt kollektivavtal",
    must_have: { languages: [{ label: "Svenska" }] },
    nice_to_have: { languages: [{ label: "Engelska" }, { label: "Klingon" }] },
    application_details: { url: "https://arbetsformedlingen.se/ad/29455779" },
    removed: false,
    ...over,
  };
}

function parseOne(over: Record<string, unknown> = {}) {
  return parseArbetsformedlingenAd({
    item: jobTechAd(over),
    channel: "snapshot",
    capturedAt: CAPTURED_AT,
    requestRef: REQUEST_REF,
  });
}

describe("parses a real-shaped JobTech ad into the canonical contract", () => {
  const outcome = parseOne();

  it("produces a parsed record", () => {
    expect(outcome.kind).toBe("parsed");
  });

  it("carries publisher identity and text verbatim", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    const v = outcome.vacancy;
    expect(v.providerKey).toBe("arbetsformedlingen");
    expect(v.externalId).toBe("29455779");
    expect(v.titleRaw).toBe("Snickare till byggprojekt i Stockholm");
    expect(v.descriptionRaw).toContain("Vi söker en erfaren snickare.");
    // Blank-line runs collapse but paragraphs survive.
    expect(v.descriptionRaw).not.toContain("\n\n\n");
    expect(v.sourceLanguage).toBe("sv");
  });

  it("normalizes dates to UTC and start date to a calendar day", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    const v = outcome.vacancy;
    expect(v.publishedAt).toBe("2026-08-01T06:00:00.000Z");
    expect(v.expiresAt).toBe("2026-09-01T21:59:59.000Z");
    expect(v.startDate).toBe("2026-09-14");
    expect(v.capturedAt).toBe(CAPTURED_AT);
  });

  it("reads geography from the nested address and keeps real coordinates", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    const v = outcome.vacancy;
    expect(v.location.country).toBe("SE");
    expect(v.location.region).toBe("Stockholms län");
    expect(v.location.city).toBe("Stockholm");
    expect(v.location.lat).toBeCloseTo(59.3293);
    expect(v.location.lng).toBeCloseTo(18.0686);
  });

  it("keeps the employer external and the salary in its own currency", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    const v = outcome.vacancy;
    expect(v.employer.name).toBe("Bygg & Montage AB");
    expect(v.employer.externalOrgId).toBe("5566778899");
    expect(v.employer.homepage).toBe("byggmontage.se");
    // SEK is NOT converted to EUR — no FX rate exists in this pipeline.
    expect(v.compensation.currency).toBe("SEK");
    expect(v.compensation.min).toBe(32000);
    expect(v.compensation.max).toBe(41000);
  });

  it("maps the Swedish employment vocabulary and drops unknown languages", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    const v = outcome.vacancy;
    expect(v.employmentForm).toBe("permanent");
    expect(v.workingTime).toBe("full_time");
    expect(v.positions).toBe(3);
    expect(v.requiredLanguages).toEqual(["sv", "en"]);
  });

  it("carries attribution and the publisher's canonical ad URL", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    const v = outcome.vacancy;
    expect(v.attributionCode).toBe(
      "vacancySources.attribution.arbetsformedlingen",
    );
    expect(v.applicationUrl).toBe("https://arbetsformedlingen.se/ad/29455779");
  });

  it("has not been through the translation stage yet, and says so", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    expect(outcome.vacancy.translation).toBeNull();
  });

  it("categorizes from the publisher occupation label when the lexicon knows it", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    const v = outcome.vacancy;
    expect(v.occupationRaw).toBe("Snickare");
    expect(v.occupationConceptId).toBe("kJx8_Gt4_TUS");
    // Un-hedged 2026-08-14: the lexicon now carries Swedish occupation-label
    // needles, so "Snickare" MUST resolve — and as the publisher's own label.
    expect(v.professionSlug).toBe("carpenter");
    expect(v.categorizationOrigin).toBe("publisher");
  });

  it("pins transformVersion v2 — the re-tag lever must not silently revert", () => {
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    // v2 routes every re-seen ad through the update arm on the next refresh
    // (transformVersion is inside the content hash). Reverting to v1 would
    // make the categorizer improvement inert for all stored rows.
    expect(outcome.vacancy.transformVersion).toBe(
      "vacancy-arbetsformedlingen-v2",
    );
  });
});

describe("defensive parsing — a malformed ad is rejected, never guessed at", () => {
  it("rejects a non-object item", () => {
    const res = parseArbetsformedlingenAd({
      item: "not an ad",
      channel: "snapshot",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    expect(res).toEqual({ kind: "rejected", reason: "payload_not_an_object" });
  });

  it("rejects a missing id", () => {
    const res = parseOne({ id: null });
    expect(res).toEqual({ kind: "rejected", reason: "missing_external_id" });
  });

  it("rejects a missing headline on a published ad", () => {
    const res = parseOne({ headline: "  " });
    expect(res).toEqual({ kind: "rejected", reason: "missing_title" });
  });

  it("distinguishes an absent publication date from an unparseable one", () => {
    expect(parseOne({ publication_date: null })).toEqual({
      kind: "rejected",
      reason: "missing_published_at",
    });
    expect(parseOne({ publication_date: "sometime last week" })).toEqual({
      kind: "rejected",
      reason: "invalid_published_at",
    });
  });

  it("refuses a null-island coordinate rather than pinning the job at 0,0", () => {
    const res = parseOne({
      workplace_address: {
        country_code: "SE",
        region: null,
        municipality: null,
        coordinates_lat: 0,
        coordinates_long: 0,
      },
    });
    if (res.kind !== "parsed") throw new Error("expected parsed");
    expect(res.vacancy.location.lat).toBeNull();
    expect(res.vacancy.location.lng).toBeNull();
  });

  it("never invents a headcount", () => {
    const res = parseOne({ number_of_vacancies: undefined });
    if (res.kind !== "parsed") throw new Error("expected parsed");
    expect(res.vacancy.positions).toBeNull();
  });

  it("claims no currency when there is no amount to denominate", () => {
    const res = parseOne({
      salary_min: null,
      salary_max: null,
      currency: null,
    });
    if (res.kind !== "parsed") throw new Error("expected parsed");
    expect(res.vacancy.compensation.currency).toBeNull();
  });
});

describe("stream withdrawals", () => {
  it("a removal is parsed on the short path with lifecycle 'removed'", () => {
    const res = parseArbetsformedlingenAd({
      item: { id: "29455779", removed: true },
      channel: "stream",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    if (res.kind !== "parsed") throw new Error("expected parsed");
    expect(res.vacancy.lifecycle).toBe("removed");
    expect(res.vacancy.externalId).toBe("29455779");
    // With no publication date on the delta, capture time is the honest
    // ordering signal — recorded, not left blank.
    expect(res.vacancy.publishedAt).toBe(CAPTURED_AT);
  });

  it("accepts the {value:true} boolean wrapper JobTech sometimes uses", () => {
    const res = parseArbetsformedlingenAd({
      item: { id: "1", removed: { value: true } },
      channel: "stream",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    if (res.kind !== "parsed") throw new Error("expected parsed");
    expect(res.vacancy.lifecycle).toBe("removed");
  });
});

describe("batch shapes", () => {
  it("accepts a bare array (snapshot / stream)", () => {
    const res = parseArbetsformedlingenBatch({
      body: [jobTechAd(), jobTechAd({ id: "2" })],
      channel: "snapshot",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    expect(res.ok).toBe(true);
    expect(res.outcomes).toHaveLength(2);
  });

  it("accepts a { hits: [...] } wrapper (JobAd Links)", () => {
    const res = parseArbetsformedlingenBatch({
      body: { hits: [jobTechAd()] },
      channel: "links",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    expect(res.ok).toBe(true);
    expect(res.outcomes).toHaveLength(1);
  });

  it("a links record with no description body is still valid", () => {
    const res = parseArbetsformedlingenBatch({
      body: { hits: [jobTechAd({ description: undefined })] },
      channel: "links",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    const first = res.outcomes[0]!;
    if (first.kind !== "parsed") throw new Error("expected parsed");
    expect(first.vacancy.descriptionRaw).toBe("");
    expect(first.vacancy.channel).toBe("links");
  });

  it("refuses a body that is neither an array nor a hits wrapper", () => {
    const res = parseArbetsformedlingenBatch({
      body: { unexpected: true },
      channel: "snapshot",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    expect(res.ok).toBe(false);
    expect(res.bodyReason).toBe("body_not_a_list");
  });

  it("one malformed ad never aborts the batch", () => {
    const res = parseArbetsformedlingenBatch({
      body: [jobTechAd(), "junk", jobTechAd({ id: "3" })],
      channel: "snapshot",
      capturedAt: CAPTURED_AT,
      requestRef: REQUEST_REF,
    });
    expect(res.outcomes.map((o) => o.kind)).toEqual([
      "parsed",
      "rejected",
      "parsed",
    ]);
  });
});

describe("parser dispatch", () => {
  it("resolves the Swedish parser by provider key", () => {
    expect(getVacancyParser("arbetsformedlingen")).toBeTypeOf("function");
  });

  it("returns null for an unknown provider rather than a default", () => {
    expect(getVacancyParser("nowhere_employment_service")).toBeNull();
  });
});
