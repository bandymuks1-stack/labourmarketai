import { describe, expect, it } from "vitest";

import { deriveEntryWorkTime, type WorkTimeMetricRow } from "./work-time";
import {
  deriveWorkTimeChecks,
  formatWorkTimeOverride,
  HOURS_IN_A_DAY,
  LONG_DAY_HOURS,
  normalizeOverrideReason,
  openDayCheckFor,
  parseWorkTimeOverride,
  WORK_TIME_OVERRIDE_METRIC_SLUG,
  type PlausibilityEntryInput,
} from "./work-time-plausibility";

const hours = (value: number, extra: Partial<WorkTimeMetricRow> = {}): WorkTimeMetricRow => ({
  metric_slug: "quantity",
  value_text: null,
  value_numeric: value,
  unit_slug: "hours",
  source: "worker_input",
  ...extra,
});
const fragment = (index: number, value: number): WorkTimeMetricRow => ({
  metric_slug: "fragment_time",
  value_text: String(index),
  value_numeric: value,
  unit_slug: "hours",
  source: "ai_extracted",
});
const workDate = (day: string): WorkTimeMetricRow => ({
  metric_slug: "work_date",
  value_text: day,
  value_numeric: null,
  unit_slug: null,
  source: "worker_input",
});
const override = (value: string, source = "worker_input"): WorkTimeMetricRow => ({
  metric_slug: WORK_TIME_OVERRIDE_METRIC_SLUG,
  value_text: value,
  value_numeric: null,
  unit_slug: null,
  source,
});

function entry(
  id: string,
  day: string,
  metrics: WorkTimeMetricRow[],
): PlausibilityEntryInput {
  const all = [workDate(day), ...metrics];
  return {
    time: deriveEntryWorkTime({
      entryId: id,
      createdAt: `${day}T08:00:00.000Z`,
      originalText: `record ${id}`,
      metrics: all,
    }),
    metrics: all,
  };
}

describe("override value format", () => {
  it("round-trips `<code>|<day>|<reason>` and refuses anything malformed", () => {
    const v = formatWorkTimeOverride({ code: "long_day", day: "2026-09-10", reason: "two shifts" });
    expect(v).toBe("long_day|2026-09-10|two shifts");
    expect(parseWorkTimeOverride(v)).toEqual({ code: "long_day", day: "2026-09-10", reason: "two shifts" });
    // a reason may itself contain the separator
    expect(parseWorkTimeOverride("day_over_24h|2026-09-10|day | night")?.reason).toBe("day | night");
    expect(parseWorkTimeOverride("not_a_code|2026-09-10|x")).toBeNull();
    expect(parseWorkTimeOverride("long_day|10.09.2026|x")).toBeNull();
    expect(parseWorkTimeOverride("long_day|2026-09-10|")).toBeNull();
    expect(parseWorkTimeOverride("long_day|2026-09-10")).toBeNull();
    expect(parseWorkTimeOverride(null)).toBeNull();
  });

  it("bounds the reason and collapses whitespace", () => {
    expect(normalizeOverrideReason("  two   shifts \n today ")).toBe("two shifts today");
    expect(normalizeOverrideReason("ok")).toBeNull();
    expect(normalizeOverrideReason("x".repeat(301))).toBeNull();
    expect(normalizeOverrideReason(42)).toBeNull();
  });
});

describe("deriveWorkTimeChecks", () => {
  it("a normal day raises nothing", () => {
    expect(
      deriveWorkTimeChecks([
        entry("a", "2026-09-10", [hours(8)]),
        entry("b", "2026-09-10", [hours(4)]),
        entry("c", "2026-09-11", [fragment(1, 6), fragment(2, 2)]),
      ]),
    ).toEqual([]);
  });

  it("names the day whose records add up to more than 24 h, and every record involved", () => {
    const checks = deriveWorkTimeChecks([
      entry("b", "2026-09-10", [hours(10)]),
      entry("a", "2026-09-10", [hours(9)]),
      entry("c", "2026-09-10", [hours(8)]),
      entry("d", "2026-09-09", [hours(8)]),
    ]);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      code: "day_over_24h",
      key: "day_over_24h|2026-09-10",
      day: "2026-09-10",
      hours: 27,
      entryIds: ["a", "b", "c"],
      acknowledged: null,
    });
  });

  it("a long day within 24 h is a prompt to look again, not an impossibility", () => {
    const checks = deriveWorkTimeChecks([
      entry("a", "2026-09-10", [hours(LONG_DAY_HOURS)]),
      entry("b", "2026-09-10", [hours(0.5)]),
    ]);
    expect(checks.map((c) => c.code)).toEqual(["long_day"]);
    expect(checks[0]!.hours).toBe(16.5);
    // exactly the threshold is fine
    expect(deriveWorkTimeChecks([entry("a", "2026-09-10", [hours(LONG_DAY_HOURS)])])).toEqual([]);
    expect(deriveWorkTimeChecks([entry("a", "2026-09-10", [hours(HOURS_IN_A_DAY)])]).map((c) => c.code)).toEqual(["long_day"]);
  });

  it("a single duration longer than a day is named with the phrase it was recorded against", () => {
    const e = entry("a", "2026-09-10", [
      { metric_slug: "parsed_fragment", value_text: "1|dirbau objekte", value_numeric: null, unit_slug: null, source: "ai_extracted" },
      fragment(1, 30),
    ]);
    const checks = deriveWorkTimeChecks([e]);
    expect(checks.map((c) => c.code)).toEqual(["day_over_24h", "line_over_24h"]);
    expect(checks[1]).toMatchObject({ hours: 30, title: "dirbau objekte", entryIds: ["a"] });
  });

  it("surfaces the entry-level duration the canonical rule set aside (was recorded, shown to nobody)", () => {
    const e = entry("a", "2026-09-10", [fragment(1, 6), fragment(2, 2), hours(9)]);
    expect(e.time.conflict).not.toBeNull();
    const checks = deriveWorkTimeChecks([e]);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      code: "entry_duration_ignored",
      hours: 8,
      ignored: { value: 9, unit: "hours" },
      entryIds: ["a"],
    });
  });

  it("days-unit and non-time quantities never trip an hours check", () => {
    expect(
      deriveWorkTimeChecks([
        entry("a", "2026-09-10", [hours(40, { unit_slug: "days" })]),
        entry("b", "2026-09-10", [hours(500, { unit_slug: "square_meters" })]),
      ]),
    ).toEqual([]);
  });

  it("never changes a figure: the hours on a flagged day are exactly what was recorded", () => {
    const rows = [entry("a", "2026-09-10", [hours(20)]), entry("b", "2026-09-10", [hours(20)])];
    const checks = deriveWorkTimeChecks(rows);
    expect(checks[0]!.hours).toBe(40);
    expect(rows.map((r) => r.time.totalHours)).toEqual([20, 20]);
  });

  it("an acknowledgement on any involved entry is returned WITH its reason — never hidden", () => {
    const checks = deriveWorkTimeChecks([
      entry("a", "2026-09-10", [hours(14)]),
      entry("b", "2026-09-10", [hours(14), override("day_over_24h|2026-09-10|day and night shift, both real")]),
    ]);
    expect(checks).toHaveLength(1);
    expect(checks[0]!.acknowledged).toEqual({ reason: "day and night shift, both real", entryId: "b" });
  });

  it("only the worker's own row acknowledges; a wrong code, day or source does not", () => {
    const open = (rows: WorkTimeMetricRow[]) =>
      deriveWorkTimeChecks([entry("a", "2026-09-10", [hours(30), ...rows])]).find(
        (c) => c.code === "day_over_24h",
      )!.acknowledged;
    expect(open([override("day_over_24h|2026-09-10|ok", "ai_extracted")])).toBeNull();
    expect(open([override("day_over_24h|2026-09-11|ok")])).toBeNull();
    expect(open([override("long_day|2026-09-10|ok")])).toBeNull();
    expect(open([override("day_over_24h|2026-09-10|ok")])).not.toBeNull();
  });

  it("orders open checks first, newest day first, then by severity — independent of input order", () => {
    const rows = [
      entry("old", "2026-09-01", [hours(30), override("day_over_24h|2026-09-01|imported and live, both kept")]),
      entry("mid", "2026-09-05", [hours(17)]),
      entry("new", "2026-09-10", [hours(30)]),
    ];
    const keys = (r: PlausibilityEntryInput[]) => deriveWorkTimeChecks(r).map((c) => c.key);
    expect(keys(rows)).toEqual([
      "day_over_24h|2026-09-10",
      "line_over_24h|new",
      "long_day|2026-09-05",
      // the old entry's line check was not acknowledged — still open
      "line_over_24h|old",
      "day_over_24h|2026-09-01",
    ]);
    expect(keys([...rows].reverse())).toEqual(keys(rows));
  });

  it("openDayCheckFor hands an intake surface the saved entry's open day check only", () => {
    const checks = deriveWorkTimeChecks([
      entry("a", "2026-09-10", [hours(20)]),
      entry("b", "2026-09-10", [hours(20)]),
      entry("c", "2026-09-09", [hours(30)]),
      entry("d", "2026-09-08", [hours(20), override("long_day|2026-09-08|two shifts")]),
    ]);
    expect(openDayCheckFor(checks, "b")?.code).toBe("day_over_24h");
    expect(openDayCheckFor(checks, "c")?.code).toBe("day_over_24h");
    expect(openDayCheckFor(checks, "d")).toBeNull();
    expect(openDayCheckFor(checks, "zzz")).toBeNull();
  });
});
