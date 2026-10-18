import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * CAL-9 — utilisation without a fabricated denominator.
 *
 * THE MEASUREMENT THAT DECIDED THE DESIGN. "Utilisation" normally means
 * worked time ÷ AVAILABLE time. Checked across every migration on
 * 2026-09-14: this schema records no contracted hours, no FTE fraction and no
 * working pattern anywhere. There is no available time to divide by. Any
 * percentage against an assumed eight-hour day or five-day week would be a
 * number invented in code and read by a manager as a measurement.
 *
 * So the capability answers the narrower question it can measure — how many
 * days of a STATED window a person is already committed for — and names its
 * denominator so nobody can mistake "18 of 30 calendar days" for "60% FTE".
 *
 * This guard pins the three ways that could quietly rot: an invented working
 * pattern, a ratio issued on an incomplete numerator, and an unreadable
 * worker counted as a free one.
 */

const webRoot = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const MODEL = "lib/workforce/utilisation.ts";
const READER = "lib/planning/roster-utilisation.ts";
const PAGE = "app/[locale]/dashboard/company/planning/page.tsx";

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
}

describe("the denominator is measured, never assumed", () => {
  it("the model exports the denominator it used", () => {
    const src = read(MODEL);
    expect(src).toMatch(/export const UTILISATION_DENOMINATOR = "calendar_days" as const;/);
  });

  it("no working pattern is invented anywhere in the path", () => {
    // An 8, a 40 or a 5 appearing as a divisor here would be the whole defect.
    for (const rel of [MODEL, READER]) {
      const c = code(read(rel));
      expect(c, rel).not.toMatch(/HOURS_PER_DAY|WORKING_DAYS|WORK_WEEK|\/\s*8\b|\*\s*40\b|weekday|isWeekend/i);
    }
  });

  it("the schema still records no PERSON-side capacity denominator — the premise holds", () => {
    // Measured while writing this guard, and worth stating precisely because
    // the first version of it got the claim wrong: `hours_per_week` DOES
    // appear in the schema — twice, both times inside the DEMAND payload
    // projection (`p -> 'time' -> 'hours_per_week'`), i.e. how many hours an
    // opening asks for. That is not a person's capacity, and using it as one
    // would collapse SEP-4 (DEMAND ≠ SUPPLY): an employer's ask would become
    // the worker's availability.
    //
    // These two are therefore named, not ignored. Any THIRD occurrence — or
    // any worker-side contracted-hours column — fails here so CAL-9 gets
    // revisited rather than left quietly narrower than it needs to be.
    const DEMAND_SIDE_ONLY = [
      "20260711330000_worker_demand_structured_v2_exposure.sql",
      "20260903130000_opportunity_type_internship_apprenticeship_v1.sql",
    ];
    const migrations = join(webRoot, "..", "..", "supabase", "migrations");
    const found = readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /\b(hours_per_week|weekly_hours|contract_hours|fte_fraction|working_pattern)\b/i.test(
          readFileSync(join(migrations, f), "utf8"),
        ),
      );
    expect(
      found.sort(),
      "a capacity term appeared outside the known demand-payload projection — if it is a PERSON's capacity, CAL-9 can be widened beyond committed-day coverage; if it is demand-side, name it here",
    ).toEqual([...DEMAND_SIDE_ONLY].sort());

    for (const file of DEMAND_SIDE_ONLY) {
      const sql = readFileSync(join(migrations, file), "utf8");
      expect(
        sql,
        `${file} must still read hours_per_week from the DEMAND payload, not from a worker`,
      ).toMatch(/p -> 'time' -> 'hours_per_week'/);
    }
  });

  it("the rendered line always carries the denominator with the number", () => {
    const c = code(read(PAGE));
    expect(c).toMatch(/utilisation\.denominatorNote/);
    expect(c).toMatch(/utilisation\.committedDays/);
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      const u = JSON.parse(read(`messages/${loc}.json`)).workforcePlanning?.utilisation;
      expect(u?.committedDays, `${loc}.committedDays`).toBeTruthy();
      // Both halves of the fraction, always — never a bare percentage.
      expect(u.committedDays, `${loc} must render both numerator and denominator`).toContain(
        "{committed}",
      );
      expect(u.committedDays, loc).toContain("{counted}");
      expect(u.denominatorNote, `${loc}.denominatorNote`).toBeTruthy();
    }
  });
});

describe("a ratio is never issued on an incomplete numerator", () => {
  it("the per-worker ratio is withheld in the partial state", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/committedRatio: partial \? null :/);
  });

  it("the roster ratio requires every worker to be measured", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/const everyoneMeasured = rows\.length > 0 && measured === rows\.length;/);
    expect(c).toMatch(/committedRatio:\s*\n?\s*everyoneMeasured/);
  });

  it("days are a set, so overlapping commitments cannot exceed the window", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/new Set<number>\(\)/);
    expect(c).toMatch(/target\.add\(day\)/);
    // No summing of range lengths anywhere.
    expect(c).not.toMatch(/committedDays \+=|totalDays \+= .*end - .*start/);
  });
});

describe("unreadable is not free — SEP-7", () => {
  it("an unreadable source produces null counts, not zeroes", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/if \(gaps\.length > 0\) return empty\(input\.workerId, "unknown", gaps\);/);
    expect(c).toMatch(/committedDays: null/);
  });

  it("the roster summary excludes uncountable workers from the denominator", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/if \(row\.committedDays !== null\) \{/);
    expect(c).toMatch(/const countedWorkerDays = counted > 0 \? counted \* windowDays : null;/);
  });

  it("the page states the unknown and partial populations separately", () => {
    const c = code(read(PAGE));
    expect(c).toMatch(/roster-utilisation-unknown/);
    expect(c).toMatch(/roster-utilisation-partial/);
  });

  it("the reader derives unreadable sources from the read results", () => {
    const c = code(read(READER));
    expect(c).toMatch(/\} else \{\s*unreadableSources\.push\(\.\.\.COMMITMENT_SOURCES\);/);
    expect(c).toMatch(/\} else \{\s*unreadableSources\.push\("absence"\);/);
    expect(c).not.toMatch(/\.from\(/);
    expect(c).not.toMatch(/service[-_]?role/i);
  });
});

describe("one commitment vocabulary, read three ways", () => {
  it("utilisation reuses the CAL-7 held-time and gap types rather than restating them", () => {
    const src = read(MODEL);
    expect(src).toMatch(
      /import type \{[\s\S]*HeldTime[\s\S]*ReservationGap[\s\S]*ReservationSource[\s\S]*\} from "@\/lib\/workforce\/commitment-reservation"/,
    );
    expect(src).toMatch(/from "@\/lib\/planning\/planning-model"/);
  });

  it("absence never carries a reason through the roster read either", () => {
    const c = code(read(READER));
    const block = c.slice(c.indexOf('source: "absence"'), c.indexOf('source: "absence"') + 300);
    expect(block).toMatch(/label: null/);
    expect(c).not.toMatch(/absence_type/);
  });
});
