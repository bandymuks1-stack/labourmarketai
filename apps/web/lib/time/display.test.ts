import { describe, expect, it, afterAll } from "vitest";
import {
  DISPLAY_TIME_ZONE,
  createUtcFormatter,
  formatUtcDate,
  formatUtcDateRange,
  formatUtcDateTime,
  toUtcDate,
  utcDayKey,
  utcTodayKey,
} from "./display";

/**
 * W12 timezone-consistency proof.
 *
 * The defect this module fixes is INVISIBLE when the process runs in UTC, so a
 * test suite that only runs in the ambient zone proves nothing. Every claim
 * below is re-asserted under a positive-offset zone (Europe/Vilnius, UTC+3 in
 * August) and a negative-offset zone (America/New_York, UTC-4 in August) — the
 * two directions a calendar day can slip.
 *
 * Node re-reads `process.env.TZ` for `Date`'s ambient-zone methods, so the rig
 * below genuinely changes the ambient zone. `ambientShiftsTheDay` asserts that
 * it does — without that control, "our output did not change" would be
 * satisfied by a rig that never changed anything.
 */

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const ZONES = ["UTC", "Europe/Vilnius", "America/New_York"] as const;

function withTz<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = prev;
  }
}

/** 23:30 UTC on the 7th — the 8th in Vilnius, still the 7th in New York. */
const LATE = "2026-08-07T23:30:00Z";
/** 00:30 UTC on the 7th — still the 7th in Vilnius, the 6th in New York. */
const EARLY = "2026-08-07T00:30:00Z";
/** A bare business date, the shape the planning projection passes around. */
const DATE_ONLY = "2026-08-07";

// Active locales (lib/i18n/config.ts `activeLocales`), so the proof covers what
// users can actually select rather than an arbitrary pair.
const LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

/**
 * The NUMBER a single-field rendering denotes. Locales legitimately differ on
 * padding and suffixes for `{ day: "numeric" }` — lt renders "07", de renders
 * "7." — and none of that is what these assertions are about. Comparing the
 * number keeps the proof on the calendar day itself.
 */
const num = (s: string | null): number => Number(String(s).replace(/\D/g, ""));

describe("the rig actually changes the ambient timezone", () => {
  it("ambient formatting DOES shift the day across zones (control)", () => {
    const vilnius = withTz("Europe/Vilnius", () =>
      new Date(LATE).toLocaleDateString("en", { day: "numeric" }),
    );
    const newYork = withTz("America/New_York", () =>
      new Date(LATE).toLocaleDateString("en", { day: "numeric" }),
    );
    // If this ever stops holding, every TZ-independence assertion below has
    // become vacuous and this suite must be fixed, not deleted.
    expect(vilnius).toBe("8");
    expect(newYork).toBe("7");
  });
});

describe("formatUtcDate pins the calendar day to UTC", () => {
  for (const tz of ZONES) {
    for (const locale of LOCALES) {
      it(`${locale} @ ${tz}: 23:30Z on the 7th renders as the 7th`, () => {
        withTz(tz, () => {
          expect(num(formatUtcDate(LATE, locale, { day: "numeric" }))).toBe(7);
          expect(num(formatUtcDate(LATE, locale, { month: "numeric" }))).toBe(8);
          expect(num(formatUtcDate(LATE, locale, { year: "numeric" }))).toBe(2026);
        });
      });

      it(`${locale} @ ${tz}: 00:30Z on the 7th renders as the 7th`, () => {
        withTz(tz, () => {
          expect(num(formatUtcDate(EARLY, locale, { day: "numeric" }))).toBe(7);
          expect(num(formatUtcDate(EARLY, locale, { month: "numeric" }))).toBe(8);
        });
      });

      it(`${locale} @ ${tz}: a bare YYYY-MM-DD keeps its own day`, () => {
        withTz(tz, () => {
          expect(num(formatUtcDate(DATE_ONLY, locale, { day: "numeric" }))).toBe(7);
          expect(num(formatUtcDate(DATE_ONLY, locale, { month: "numeric" }))).toBe(8);
        });
      });
    }
  }

  it("the full default rendering is byte-identical across all three zones", () => {
    for (const locale of LOCALES) {
      const rendered = ZONES.map((tz) => withTz(tz, () => formatUtcDate(LATE, locale)));
      expect(new Set(rendered).size, `${locale} must render one string, got ${rendered.join(" | ")}`).toBe(1);
    }
  });
});

describe("locale still changes the presentation", () => {
  it("lt and en disagree on ordering — the locale is honoured, only the zone is pinned", () => {
    expect(formatUtcDate(LATE, "lt")).not.toBe(formatUtcDate(LATE, "en"));
  });

  it("lt renders ISO-ordered, en renders month-first", () => {
    // Stable ICU forms for the numeric default shape.
    expect(formatUtcDate(DATE_ONLY, "lt")).toBe("2026-08-07");
    expect(formatUtcDate(DATE_ONLY, "en")).toBe("8/7/2026");
  });
});

describe("midnight and DST boundaries", () => {
  it("exact UTC midnight belongs to its own day, in every zone", () => {
    for (const tz of ZONES) {
      withTz(tz, () => {
        expect(num(formatUtcDate("2026-08-07T00:00:00Z", "en", { day: "numeric" }))).toBe(7);
      });
    }
  });

  it("23:59:59Z has not yet rolled over", () => {
    for (const tz of ZONES) {
      withTz(tz, () => {
        expect(num(formatUtcDate("2026-08-07T23:59:59Z", "en", { day: "numeric" }))).toBe(7);
      });
    }
  });

  it("the EU DST transition (2026-03-29) does not move the day", () => {
    // Europe/Vilnius jumps 03:00→04:00 local on this date; UTC does not.
    for (const tz of ZONES) {
      withTz(tz, () => {
        expect(num(formatUtcDate("2026-03-29T00:30:00Z", "lt", { day: "numeric" }))).toBe(29);
        expect(num(formatUtcDate("2026-03-29T23:30:00Z", "lt", { day: "numeric" }))).toBe(29);
      });
    }
  });

  it("the US DST transition (2026-03-08) does not move the day", () => {
    for (const tz of ZONES) {
      withTz(tz, () => {
        expect(num(formatUtcDate("2026-03-08T00:30:00Z", "en", { day: "numeric" }))).toBe(8);
        expect(num(formatUtcDate("2026-03-08T23:30:00Z", "en", { day: "numeric" }))).toBe(8);
      });
    }
  });
});

describe("formatUtcDateTime", () => {
  it("renders the UTC clock time, not the viewer's", () => {
    for (const tz of ZONES) {
      withTz(tz, () => {
        expect(formatUtcDateTime(LATE, "en", { hour: "2-digit", minute: "2-digit", hour12: false })).toBe(
          "23:30",
        );
      });
    }
  });

  it("the default shape keeps date AND time together", () => {
    const s = formatUtcDateTime(LATE, "lt") ?? "";
    expect(s).toContain("2026-08-07");
    expect(s).toMatch(/23:30/);
  });

  it("is byte-identical across zones", () => {
    const rendered = ZONES.map((tz) => withTz(tz, () => formatUtcDateTime(LATE, "lt")));
    expect(new Set(rendered).size).toBe(1);
  });
});

describe("null / invalid input is safe", () => {
  for (const bad of [null, undefined, "", "   ", "not-a-date", Number.NaN] as const) {
    it(`${JSON.stringify(bad)} → null, never a throw or "Invalid Date"`, () => {
      expect(formatUtcDate(bad, "lt")).toBeNull();
      expect(formatUtcDateTime(bad, "lt")).toBeNull();
      expect(utcDayKey(bad)).toBeNull();
      expect(toUtcDate(bad)).toBeNull();
    });
  }

  it("an invalid Date object is rejected too", () => {
    expect(formatUtcDate(new Date("nonsense"), "lt")).toBeNull();
  });
});

describe("utcDayKey is the grouping counterpart of the label", () => {
  it("agrees with the rendered day in every zone", () => {
    for (const tz of ZONES) {
      withTz(tz, () => {
        expect(utcDayKey(LATE)).toBe("2026-08-07");
        expect(utcDayKey(EARLY)).toBe("2026-08-07");
        expect(utcDayKey(DATE_ONLY)).toBe("2026-08-07");
      });
    }
  });

  it("round-trips through formatUtcDate without shifting", () => {
    const key = utcDayKey(LATE) as string;
    for (const tz of ZONES) {
      withTz(tz, () => {
        expect(num(formatUtcDate(key, "en", { day: "numeric" }))).toBe(7);
      });
    }
  });

  it("utcTodayKey takes an injectable clock", () => {
    expect(utcTodayKey(new Date(LATE))).toBe("2026-08-07");
  });
});

describe("formatUtcDateRange", () => {
  it("renders both ends", () => {
    const s = formatUtcDateRange("2026-08-07", "2026-08-09", "lt") ?? "";
    expect(s).toContain("07");
    expect(s).toContain("09");
  });

  it("an open end renders the single known date, never a closed range", () => {
    expect(formatUtcDateRange("2026-08-07", null, "lt")).toBe("2026-08-07");
    expect(formatUtcDateRange(null, "2026-08-09", "lt")).toBe("2026-08-09");
  });

  it("no dates at all → null", () => {
    expect(formatUtcDateRange(null, undefined, "lt")).toBeNull();
  });
});

describe("createUtcFormatter", () => {
  it("produces the same output as the one-shot helper", () => {
    const f = createUtcFormatter("lt", { day: "numeric", month: "short" });
    expect(f(LATE)).toBe(formatUtcDate(LATE, "lt", { day: "numeric", month: "short" }));
  });

  it("is null-safe", () => {
    expect(createUtcFormatter("lt")(null)).toBeNull();
  });

  it("cannot be tricked into another timezone", () => {
    // A caller passing `timeZone` is overridden — the module owns that option.
    const f = createUtcFormatter("en", {
      day: "numeric",
      timeZone: "America/New_York",
    } as Intl.DateTimeFormatOptions);
    expect(num(f(LATE))).toBe(7);
    expect(DISPLAY_TIME_ZONE).toBe("UTC");
  });
});
