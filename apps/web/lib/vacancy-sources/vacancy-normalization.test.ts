import { describe, it, expect } from "vitest";
import {
  clampText,
  normalizeAmount,
  normalizeApplicationUrl,
  normalizeCoordinate,
  normalizeCountryIso,
  normalizeCurrency,
  normalizeDescription,
  normalizeEmploymentForm,
  normalizeHostname,
  normalizeIsoDate,
  normalizeIsoTimestamp,
  normalizeLanguageCode,
  normalizeLanguageList,
  normalizeOptionalText,
  normalizePositions,
  normalizeText,
  normalizeTitle,
  normalizeWorkingTime,
} from "./vacancy-normalization";
import { VACANCY_IMPORT_BOUNDS } from "./vacancy-contract";

describe("text normalization", () => {
  it("collapses whitespace and returns '' for a non-string", () => {
    expect(normalizeText("  a   b \n c ")).toBe("a b c");
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(42)).toBe("");
  });

  it("normalizeOptionalText returns null rather than an empty string", () => {
    expect(normalizeOptionalText("   ")).toBeNull();
    expect(normalizeOptionalText("Snickare")).toBe("Snickare");
  });

  it("clampText drops a partial word when the boundary is in the final 15%", () => {
    // 18 a's, a space, then more: the last space sits past 0.85 × 20, so the
    // dangling fragment is dropped instead of shown half-written.
    expect(clampText("aaaaaaaaaaaaaaaaaa bbbb", 20)).toBe("aaaaaaaaaaaaaaaaaa");
  });

  it("clampText hard-cuts when the boundary is too far back to be worth it", () => {
    // Keeping the boundary here would throw away a third of the budget.
    expect(clampText("alpha beta gamma delta", 16)).toBe("alpha beta gamma");
    expect(clampText("aaaaaaaaaaaaaaaaaaaa", 5)).toBe("aaaaa");
  });

  it("clampText never appends characters the publisher did not write", () => {
    const clamped = clampText("alpha beta gamma delta", 16);
    expect(clamped.length).toBeLessThanOrEqual(16);
    expect(clamped).not.toContain("…");
    expect(clamped).not.toContain("...");
    expect("alpha beta gamma delta").toContain(clamped);
  });

  it("clampText passes short text through and handles a zero budget", () => {
    expect(clampText("short", 50)).toBe("short");
    expect(clampText("anything", 0)).toBe("");
  });

  it("normalizeTitle enforces the shared title bound", () => {
    const long = "x".repeat(VACANCY_IMPORT_BOUNDS.maxTitleChars + 200);
    expect(normalizeTitle(long).length).toBe(
      VACANCY_IMPORT_BOUNDS.maxTitleChars,
    );
  });

  it("normalizeDescription keeps paragraphs but collapses blank-line runs", () => {
    const out = normalizeDescription("Rad ett\r\n\r\n\r\n\r\nRad två   här");
    expect(out).toBe("Rad ett\n\nRad två här");
  });
});

describe("scalar normalization refuses placeholders instead of guessing", () => {
  it("country must be ISO alpha-2", () => {
    expect(normalizeCountryIso("se")).toBe("SE");
    expect(normalizeCountryIso("Sverige")).toBeNull();
    expect(normalizeCountryIso(null)).toBeNull();
  });

  it("coordinates reject null island, out-of-range and non-numbers", () => {
    expect(normalizeCoordinate(59.33, "lat")).toBe(59.33);
    expect(normalizeCoordinate(0, "lat")).toBeNull();
    expect(normalizeCoordinate(91, "lat")).toBeNull();
    expect(normalizeCoordinate(181, "lng")).toBeNull();
    expect(normalizeCoordinate("abc", "lng")).toBeNull();
  });

  it("positions must be a positive integer — never defaulted to 1", () => {
    expect(normalizePositions(3)).toBe(3);
    expect(normalizePositions(0)).toBeNull();
    expect(normalizePositions(1.5)).toBeNull();
    expect(normalizePositions(undefined)).toBeNull();
  });

  it("timestamps and dates parse or return null", () => {
    expect(normalizeIsoTimestamp("2026-08-04T10:00:00+02:00")).toBe(
      "2026-08-04T08:00:00.000Z",
    );
    expect(normalizeIsoDate("2026-09-01T00:00:00Z")).toBe("2026-09-01");
    expect(normalizeIsoTimestamp("not a date")).toBeNull();
    expect(normalizeIsoDate(null)).toBeNull();
  });

  it("currency must be ISO-4217-shaped; amounts must be finite and non-negative", () => {
    expect(normalizeCurrency("sek")).toBe("SEK");
    expect(normalizeCurrency("kronor")).toBeNull();
    expect(normalizeAmount(31000)).toBe(31000);
    expect(normalizeAmount(-1)).toBeNull();
    expect(normalizeAmount("abc")).toBeNull();
  });

  it("an ABSENT number never coerces to zero (Number(null) === 0 trap)", () => {
    // A publisher sending `salary_min: null` must not acquire a published
    // salary of zero, and an empty string is not a headcount of nothing.
    for (const absent of [null, undefined, "", "   ", [], {}, true, false]) {
      expect(normalizeAmount(absent)).toBeNull();
      expect(normalizePositions(absent)).toBeNull();
      expect(normalizeCoordinate(absent, "lat")).toBeNull();
    }
  });

  it("a numeric string is still accepted", () => {
    expect(normalizeAmount("32000")).toBe(32000);
    expect(normalizePositions(" 3 ")).toBe(3);
    expect(normalizeCoordinate("59.33", "lat")).toBe(59.33);
  });

  it("hostname is extracted bare; a non-host is refused", () => {
    expect(normalizeHostname("https://www.Example.se/jobb?a=1")).toBe(
      "example.se",
    );
    expect(normalizeHostname("not a host")).toBeNull();
  });

  it("application URL accepts only absolute http(s)", () => {
    expect(normalizeApplicationUrl("https://arbetsformedlingen.se/ad/1")).toBe(
      "https://arbetsformedlingen.se/ad/1",
    );
    expect(normalizeApplicationUrl("/ad/1")).toBeNull();
    expect(normalizeApplicationUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeApplicationUrl("mailto:a@b.se")).toBeNull();
  });
});

describe("language mapping", () => {
  it("maps Swedish, English and ISO labels to platform codes", () => {
    expect(normalizeLanguageCode("Svenska")).toBe("sv");
    expect(normalizeLanguageCode("Engelska")).toBe("en");
    expect(normalizeLanguageCode("Litauiska")).toBe("lt");
    expect(normalizeLanguageCode("polish")).toBe("pl");
    expect(normalizeLanguageCode("nb")).toBe("no");
  });

  it("strips a trailing proficiency qualifier", () => {
    expect(normalizeLanguageCode("Svenska (flytande)")).toBe("sv");
  });

  it("DROPS an unrecognized label rather than inventing a requirement", () => {
    expect(normalizeLanguageCode("Klingon")).toBeNull();
    expect(normalizeLanguageList(["Svenska", "Klingon", "Engelska"])).toEqual([
      "sv",
      "en",
    ]);
  });

  it("dedupes and bounds the list", () => {
    expect(normalizeLanguageList(["sv", "Svenska", "svenska"])).toEqual(["sv"]);
    const many = Array.from({ length: 40 }, () => "Svenska");
    expect(normalizeLanguageList(many).length).toBeLessThanOrEqual(
      VACANCY_IMPORT_BOUNDS.maxRequiredLanguages,
    );
    expect(normalizeLanguageList(null)).toEqual([]);
  });
});

describe("employment form / working time mapping", () => {
  it("recognizes the Swedish publisher vocabulary", () => {
    expect(normalizeEmploymentForm("Tillsvidareanställning")).toBe("permanent");
    expect(normalizeEmploymentForm("Vikariat")).toBe("temporary");
    expect(normalizeEmploymentForm("Sommarjobb / feriejobb")).toBe("seasonal");
    expect(normalizeEmploymentForm("Uppdrag")).toBe("assignment");
    expect(normalizeWorkingTime("Heltid")).toBe("full_time");
    expect(normalizeWorkingTime("Deltid")).toBe("part_time");
  });

  it("recognizes English equivalents", () => {
    expect(normalizeEmploymentForm("Permanent position")).toBe("permanent");
    expect(normalizeEmploymentForm("Fixed-term")).toBe("temporary");
    expect(normalizeWorkingTime("Full-time")).toBe("full_time");
  });

  it("answers 'unknown' rather than guessing", () => {
    expect(normalizeEmploymentForm("Något helt annat")).toBe("unknown");
    expect(normalizeEmploymentForm("")).toBe("unknown");
    expect(normalizeWorkingTime(null)).toBe("unknown");
  });
});
