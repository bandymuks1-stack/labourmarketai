import { describe, expect, it } from "vitest";

import { checkWorkDate } from "@/lib/journal/work-date";
import { deriveWorkIntelligence, type WorkIntelligenceEntry } from "@/lib/journal/work-intelligence";
import { personCalendarDay } from "./person-calendar-day";
import {
  isFutureWorkDay,
  isValidTimeZone,
  latestPlausibleWorkDay,
  localDayKey,
  resolveWorkToday,
} from "./local-day";

const ZONES = [
  "Europe/Vilnius",
  "UTC",
  "America/Los_Angeles",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
] as const;

/** A 2-hour entry whose stated work day is `day`. */
function entry(day: string): WorkIntelligenceEntry {
  return {
    entryId: `e-${day}`,
    createdAt: `${day}T12:00:00.000Z`,
    originalText: "x",
    metrics: [
      { metric_slug: "work_date", value_numeric: null, value_text: day, unit_slug: null },
      { metric_slug: "quantity", value_numeric: 2, value_text: null, unit_slug: "hours" },
    ],
    engagementContextId: null,
    reviewResult: "submitted",
    linkedSkillIds: [],
  } as unknown as WorkIntelligenceEntry;
}

const allHours = (day: string, instant: Date, tz: string | null) => {
  const t = resolveWorkToday({ now: instant, timeZone: tz });
  return deriveWorkIntelligence({
    entries: [entry(day)],
    skills: [],
    todayIso: t.todayIso,
    horizonIso: t.horizonIso,
    focus: "all",
  }).totalHours;
};

/** The instant at which `tz`'s wall clock reads `hhmm` on local day `day`. */
function instantAtLocal(tz: string, day: string, hhmm: string): Date {
  for (let m = -16 * 60; m <= 16 * 60; m += 30) {
    const c = new Date(Date.parse(`${day}T${hhmm}:00Z`) + m * 60_000);
    const wall = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(c);
    if (wall === hhmm && localDayKey(c, tz) === day) return c;
  }
  throw new Error(`no instant for ${tz} ${day} ${hhmm}`);
}

describe("localDayKey — fixed instants", () => {
  it("Vilnius is UTC+2 in winter and UTC+3 in summer (DST)", () => {
    expect(localDayKey(new Date("2026-01-14T22:30:00Z"), "Europe/Vilnius")).toBe("2026-01-15");
    expect(localDayKey(new Date("2026-01-14T21:30:00Z"), "Europe/Vilnius")).toBe("2026-01-14");
    expect(localDayKey(new Date("2026-07-14T21:30:00Z"), "Europe/Vilnius")).toBe("2026-07-15");
    expect(localDayKey(new Date("2026-07-14T20:30:00Z"), "Europe/Vilnius")).toBe("2026-07-14");
  });
  it("covers the extreme offsets", () => {
    const i = new Date("2026-03-10T10:30:00Z");
    expect(localDayKey(i, "Pacific/Kiritimati")).toBe("2026-03-11"); // UTC+14
    expect(localDayKey(i, "Pacific/Pago_Pago")).toBe("2026-03-09"); // UTC-11
    expect(localDayKey(i, "America/Los_Angeles")).toBe("2026-03-10");
    expect(localDayKey(i, "UTC")).toBe("2026-03-10");
  });
  it("DST boundaries keep one key per local day", () => {
    // Vilnius 2026-03-29 03:00 -> 04:00 (UTC+2 -> +3); 2026-10-25 04:00 -> 03:00
    expect(localDayKey(new Date("2026-03-29T20:59:00Z"), "Europe/Vilnius")).toBe("2026-03-29");
    expect(localDayKey(new Date("2026-03-29T21:00:00Z"), "Europe/Vilnius")).toBe("2026-03-30");
    expect(localDayKey(new Date("2026-10-24T21:00:00Z"), "Europe/Vilnius")).toBe("2026-10-25");
    expect(localDayKey(new Date("2026-10-25T21:59:00Z"), "Europe/Vilnius")).toBe("2026-10-25");
    expect(localDayKey(new Date("2026-10-25T22:00:00Z"), "Europe/Vilnius")).toBe("2026-10-26");
  });
  it("rejects bad zones", () => {
    expect(isValidTimeZone("Europe/Vilnius")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(localDayKey(new Date("2026-03-10T10:30:00Z"), "Not/AZone")).toBe("2026-03-10");
  });
});

describe("the not-future rule judges a work day in the person's own frame", () => {
  for (const tz of ZONES) {
    for (const hhmm of ["00:30", "23:30"]) {
      it(`${tz}: an entry stamped at local ${hhmm} counts at once`, () => {
        const day = localDayKey(new Date("2026-06-15T12:00:00Z"), tz);
        const instant = instantAtLocal(tz, day, hhmm);
        // what the composer stamps = the person's local day
        const stamped = localDayKey(instant, tz);
        expect(stamped).toBe(day);
        expect(allHours(stamped, instant, tz)).toBe(2); // zone known: exact
        expect(allHours(stamped, instant, null)).toBe(2); // zone unknown: UTC+1 horizon
        expect(checkWorkDate(stamped, { requireDate: true, rejectFuture: true }, instant)).toBeNull();
      });
    }
  }

  it("the reported defect: Vilnius 00:30 local, UTC still on the previous day", () => {
    const now = new Date("2026-10-05T21:30:00Z"); // 00:30 on the 6th in Vilnius (UTC+3)
    const stamped = localDayKey(now, "Europe/Vilnius");
    expect(stamped).toBe("2026-10-06");
    expect(stamped > localDayKey(now, "UTC")).toBe(true); // old UTC-judged rule dropped it
    expect(allHours(stamped, now, "Europe/Vilnius")).toBe(2);
    expect(allHours(stamped, now, null)).toBe(2);
  });

  for (const tz of ZONES) {
    it(`${tz}: a truly future day (local tomorrow) stays excluded`, () => {
      const now = new Date("2026-06-15T12:00:00Z");
      const t = resolveWorkToday({ now, timeZone: tz });
      const tom = new Date(`${t.todayIso}T00:00:00Z`);
      tom.setUTCDate(tom.getUTCDate() + 1);
      const tomorrow = tom.toISOString().slice(0, 10);
      expect(isFutureWorkDay(tomorrow, t)).toBe(true);
      expect(allHours(tomorrow, now, tz)).toBe(0);
      expect(isFutureWorkDay(t.todayIso, t)).toBe(false);
    });
  }

  it("unknown zone: horizon is UTC today + 1; two days ahead is future everywhere", () => {
    const now = new Date("2026-06-15T23:30:00Z");
    expect(latestPlausibleWorkDay(now)).toBe("2026-06-16");
    expect(allHours("2026-06-16", now, null)).toBe(2);
    expect(allHours("2026-06-17", now, null)).toBe(0);
    expect(checkWorkDate("2026-06-17", { requireDate: true, rejectFuture: true }, now)?.code).toBe(
      "work_date_invalid",
    );
  });

  it("UTC+14 is a day ahead of UTC and is accepted without a known zone", () => {
    const now = new Date("2026-03-10T10:30:00Z");
    const day = localDayKey(now, "Pacific/Kiritimati");
    expect(day).toBe("2026-03-11");
    expect(isFutureWorkDay(day, resolveWorkToday({ now, timeZone: null }))).toBe(false);
  });

  it("date-only values are calendar days: a past date is never shifted by a zone", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    for (const tz of ZONES) expect(allHours("2026-06-10", now, tz)).toBe(2);
  });

  it("the period anchor follows the viewer's zone", () => {
    const now = new Date("2026-10-05T21:30:00Z");
    expect(resolveWorkToday({ now, timeZone: "Europe/Vilnius" }).todayIso).toBe("2026-10-06");
    expect(resolveWorkToday({ now, timeZone: null }).todayIso).toBe("2026-10-05");
    expect(resolveWorkToday({ now, timeZone: "Pacific/Pago_Pago" }).todayIso).toBe("2026-10-05");
  });
});

describe("composer stamp is the person's local calendar day", () => {
  it("personCalendarDay reads the browser-local day", () => {
    expect(personCalendarDay(new Date(2026, 5, 15, 0, 30))).toBe("2026-06-15");
    expect(personCalendarDay(new Date(2026, 5, 15, 23, 30))).toBe("2026-06-15");
  });
});
