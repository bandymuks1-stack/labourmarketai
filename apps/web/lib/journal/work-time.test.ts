import { describe, expect, it } from "vitest";

import {
  deriveEntryWorkTime,
  isWorkTimeUnit,
  resolveWorkDay,
  workTimeDurationLabel,
  workTimeHours,
  workTimeHoursByDay,
  type WorkTimeMetricRow,
} from "@/lib/journal/work-time";

/**
 * Canonical work-time derivation — the owner ruling of 2026-08-18.
 *
 * Every case the ruling named is covered here: hours/minutes/quantity
 * determinism, double counting, edits/recalculation, deleted and voided
 * entries, entries without hours, conflicting metrics, timezone/work-date
 * semantics, and several entries on one day.
 *
 * The three REAL production entries that exposed the ambiguity are reproduced
 * verbatim at the bottom — they are the reason the rule exists, so they are
 * the reason it must not silently change.
 */

let seq = 0;
function metric(row: Partial<WorkTimeMetricRow>): WorkTimeMetricRow {
  seq += 1;
  return {
    id: row.id ?? `m${seq}`,
    created_at: row.created_at ?? `2026-07-02T10:00:${String(seq).padStart(2, "0")}Z`,
    metric_slug: row.metric_slug ?? "quantity",
    value_text: row.value_text ?? null,
    value_numeric: row.value_numeric ?? null,
    unit_slug: row.unit_slug ?? null,
    source: row.source ?? "worker_input",
  };
}

const fragment = (index: number, phrase: string, value: number, unit: string, activity?: string) => [
  metric({ metric_slug: "parsed_fragment", value_text: `${index}|${phrase}` }),
  metric({ metric_slug: "fragment_time", value_text: String(index), value_numeric: value, unit_slug: unit }),
  ...(activity
    ? [metric({ metric_slug: "fragment_activity", value_text: `${index}|${activity}` })]
    : []),
];

const entryOf = (metrics: WorkTimeMetricRow[], over: Partial<Parameters<typeof deriveEntryWorkTime>[0]> = {}) =>
  deriveEntryWorkTime({
    entryId: "e1",
    createdAt: "2026-07-02T18:30:00Z",
    originalText: "Darbo diena",
    metrics,
    ...over,
  });

describe("unit handling is deterministic and never invents a workday", () => {
  it("hours stay hours, minutes convert at 1/60, days NEVER become hours", () => {
    expect(workTimeHours(5, "hours")).toBe(5);
    expect(workTimeHours(35, "minutes")).toBe(0.58);
    expect(workTimeHours(90, "minutes")).toBe(1.5);
    expect(workTimeHours(2, "days")).toBe(0);
  });

  it("day-unit work is totalled as day units, side by side with hours", () => {
    const e = entryOf([
      ...fragment(1, "kloju perdangą", 2, "days"),
      ...fragment(2, "programavau", 3, "hours"),
    ]);
    expect(e.totalHours).toBe(3);
    expect(e.totalDayUnits).toBe(2);
  });

  it("a NON-time unit is productivity output, never work time", () => {
    expect(isWorkTimeUnit("square_meters")).toBe(false);
    const e = entryOf([
      metric({ metric_slug: "quantity", value_numeric: 100, unit_slug: "square_meters" }),
    ]);
    expect(e.lines).toHaveLength(0);
    expect(e.totalHours).toBe(0);
  });
});

describe("double counting is structurally impossible", () => {
  it("fragments win and the entry-level duration is NEVER added to them", () => {
    const e = entryOf([
      ...fragment(1, "rinkome laikrodžius 5 h", 5, "hours"),
      ...fragment(2, "tvarkiau ofisą - 1 h", 1, "hours"),
      ...fragment(3, "programavimas - 3 h", 3, "hours"),
      metric({ metric_slug: "quantity", value_numeric: 5, unit_slug: "hours" }),
    ]);
    expect(e.totalHours).toBe(9);
    expect(e.lines).toHaveLength(3);
    expect(e.lines.every((l) => l.derivedFrom === "fragment_time")).toBe(true);
  });

  it("the ignored entry-level duration is REPORTED, never silently dropped", () => {
    const e = entryOf([
      ...fragment(1, "programavau", 3, "hours"),
      metric({ metric_slug: "quantity", value_numeric: 5, unit_slug: "hours" }),
    ]);
    expect(e.conflict).toEqual({
      reason: "entry_quantity_ignored_fragments_present",
      value: 5,
      unit: "hours",
    });
  });

  it("no conflict is reported when only one source exists", () => {
    expect(entryOf([...fragment(1, "programavau", 3, "hours")]).conflict).toBeNull();
    expect(
      entryOf([metric({ metric_slug: "quantity", value_numeric: 4, unit_slug: "hours" })]).conflict,
    ).toBeNull();
  });

  it("a duplicated fragment index contributes ONCE (first row wins)", () => {
    const e = entryOf([
      metric({ metric_slug: "fragment_time", value_text: "1", value_numeric: 3, unit_slug: "hours", created_at: "2026-07-02T10:00:00Z" }),
      metric({ metric_slug: "fragment_time", value_text: "1", value_numeric: 8, unit_slug: "hours", created_at: "2026-07-02T11:00:00Z" }),
    ]);
    expect(e.lines).toHaveLength(1);
    expect(e.totalHours).toBe(3);
  });

  it("a duplicated entry-level quantity contributes ONCE (latest row wins)", () => {
    const e = entryOf([
      metric({ metric_slug: "quantity", value_numeric: 4, unit_slug: "hours", created_at: "2026-07-02T10:00:00Z" }),
      metric({ metric_slug: "quantity", value_numeric: 6, unit_slug: "hours", created_at: "2026-07-02T12:00:00Z" }),
    ]);
    expect(e.lines).toHaveLength(1);
    expect(e.totalHours).toBe(6);
  });
});

describe("entries that record no hours", () => {
  it("an entry with no duration metric produces no line and no invented zero row", () => {
    const e = entryOf([metric({ metric_slug: "site_name", value_text: "Kaunas" })]);
    expect(e.lines).toEqual([]);
    expect(e.totalHours).toBe(0);
    expect(e.conflict).toBeNull();
  });

  it("zero and negative durations are not work time", () => {
    for (const value of [0, -3]) {
      const e = entryOf([metric({ metric_slug: "quantity", value_numeric: value, unit_slug: "hours" })]);
      expect(e.lines).toEqual([]);
    }
  });

  it("a malformed fragment index is skipped, never guessed into an association", () => {
    const e = entryOf([
      metric({ metric_slug: "fragment_time", value_text: "0", value_numeric: 3, unit_slug: "hours" }),
      metric({ metric_slug: "fragment_time", value_text: "x", value_numeric: 4, unit_slug: "hours" }),
    ]);
    expect(e.lines).toEqual([]);
  });
});

describe("work-date / timezone semantics", () => {
  it("the day the work HAPPENED wins over the day the row was typed", () => {
    const e = entryOf([
      metric({ metric_slug: "work_date", value_text: "2026-06-30" }),
      metric({ metric_slug: "quantity", value_numeric: 8, unit_slug: "hours" }),
    ], { createdAt: "2026-08-15T21:45:00Z" });
    expect(e.day).toBe("2026-06-30");
  });

  it("without a stated work_date the created UTC day is the fallback", () => {
    expect(entryOf([], { createdAt: "2026-08-15T21:45:00Z" }).day).toBe("2026-08-15");
  });

  it("a malformed work_date is ignored rather than guessed at", () => {
    const e = entryOf([metric({ metric_slug: "work_date", value_text: "2026-6-3" })], {
      createdAt: "2026-08-15T21:45:00Z",
    });
    expect(e.day).toBe("2026-08-15");
  });

  it("several work_date rows resolve to the LATEST stated day, deterministically", () => {
    const rows = [
      metric({ metric_slug: "work_date", value_text: "2026-06-01", created_at: "2026-06-02T09:00:00Z" }),
      metric({ metric_slug: "work_date", value_text: "2026-06-05", created_at: "2026-06-06T09:00:00Z" }),
    ];
    expect(resolveWorkDay(rows, "2026-08-15T00:00:00Z")).toBe("2026-06-05");
    expect(resolveWorkDay([...rows].reverse(), "2026-08-15T00:00:00Z")).toBe("2026-06-05");
  });

  it("a plain ISO day is passed through untouched — no timezone conversion", () => {
    const e = entryOf([metric({ metric_slug: "work_date", value_text: "2026-01-01" })], {
      createdAt: "2025-12-31T23:00:00Z",
    });
    expect(e.day).toBe("2026-01-01");
  });
});

describe("provenance and evidence are preserved", () => {
  it("each line carries its evidence phrase, activity, metric row and source", () => {
    const e = entryOf(fragment(1, "4 valandas glaisčiau sienas", 4, "hours", "plasterer"));
    const line = e.lines[0]!;
    expect(line.evidencePhrase).toBe("4 valandas glaisčiau sienas");
    expect(line.workTypeKey).toBe("plasterer");
    expect(line.title).toBe("4 valandas glaisčiau sienas");
    expect(line.derivedFrom).toBe("fragment_time");
    expect(line.metricSource).toBe("worker_input");
    expect(line.metricId).toBeTruthy();
  });

  it("line keys are stable and unique per fragment — re-deriving is idempotent", () => {
    const rows = [...fragment(1, "a", 1, "hours"), ...fragment(2, "b", 2, "hours")];
    const first = entryOf(rows).lines.map((l) => l.lineKey);
    const second = entryOf(rows).lines.map((l) => l.lineKey);
    expect(first).toEqual(["e1#f1", "e1#f2"]);
    expect(second).toEqual(first);
  });

  it("an entry-level line falls back to the entry's own first line as its title", () => {
    const e = entryOf([metric({ metric_slug: "quantity", value_numeric: 8, unit_slug: "hours" })], {
      originalText: "Dirbau objekte\nantras sakinys",
    });
    expect(e.lines[0]!.title).toBe("Dirbau objekte");
    expect(e.lines[0]!.lineKey).toBe("e1#entry");
  });

  it("a manager-corrected metric keeps its provenance on the derived line", () => {
    const e = entryOf([
      metric({ metric_slug: "quantity", value_numeric: 7, unit_slug: "hours", source: "manager_corrected" }),
    ]);
    expect(e.lines[0]!.metricSource).toBe("manager_corrected");
  });
});

describe("workload hours by day", () => {
  it("several entries on the SAME day add up — two shifts are not a duplicate", () => {
    const morning = deriveEntryWorkTime({
      entryId: "a",
      createdAt: "2026-07-02T09:00:00Z",
      metrics: [metric({ metric_slug: "quantity", value_numeric: 4, unit_slug: "hours" })],
    });
    const evening = deriveEntryWorkTime({
      entryId: "b",
      createdAt: "2026-07-02T20:00:00Z",
      metrics: [metric({ metric_slug: "quantity", value_numeric: 3, unit_slug: "hours" })],
    });
    expect(workTimeHoursByDay([morning, evening], "2026-07-01", "2026-07-07")).toEqual([
      { day: "2026-07-02", hours: 7 },
    ]);
  });

  it("days outside the range are excluded", () => {
    const e = deriveEntryWorkTime({
      entryId: "a",
      createdAt: "2026-05-02T09:00:00Z",
      metrics: [metric({ metric_slug: "quantity", value_numeric: 4, unit_slug: "hours" })],
    });
    expect(workTimeHoursByDay([e], "2026-07-01", "2026-07-07")).toEqual([]);
  });

  it("day-unit work never leaks into the hours strip", () => {
    const e = deriveEntryWorkTime({
      entryId: "a",
      createdAt: "2026-07-02T09:00:00Z",
      metrics: [metric({ metric_slug: "quantity", value_numeric: 2, unit_slug: "days" })],
    });
    expect(workTimeHoursByDay([e], "2026-07-01", "2026-07-07")).toEqual([]);
  });

  it("a malformed range answers nothing rather than guessing", () => {
    expect(workTimeHoursByDay([], "2026-7-1", "2026-07-07")).toEqual([]);
  });
});

describe("the calendar label uses the SAME rule as the timesheet", () => {
  it("a single recorded duration is labelled in its own recorded unit", () => {
    const e = entryOf([metric({ metric_slug: "quantity", value_numeric: 35, unit_slug: "minutes" })]);
    expect(workTimeDurationLabel(e)).toBe("35|minutes");
  });

  it("several fragments are labelled with their SUMMED hours, not one of them", () => {
    const e = entryOf([
      ...fragment(1, "a", 5, "hours"),
      ...fragment(2, "b", 1, "hours"),
      ...fragment(3, "c", 3, "hours"),
      metric({ metric_slug: "quantity", value_numeric: 5, unit_slug: "hours" }),
    ]);
    expect(workTimeDurationLabel(e)).toBe("9|hours");
  });

  it("an entry with no duration is labelled with nothing", () => {
    expect(workTimeDurationLabel(entryOf([]))).toBeNull();
  });
});

describe("the three REAL production entries that exposed the ambiguity", () => {
  // Reproduced from production `journal_entry_metrics` on 2026-08-18. Before
  // the ruling these produced 0 h on the timesheet (empty source table), 5 h /
  // 5 h / 4 h on the calendar (entry-level quantity only) and 9 h in the
  // reviewer note (re-parsed text). The canonical rule answers once.
  it("3c7d80e3 — 5 h + 1 h + 3 h fragments, entry quantity 5 h -> 9 h", () => {
    const e = entryOf([
      ...fragment(1, "Šiandien rinkome laikrodžius pasaulio lietuvių dainų šventei 5 h", 5, "hours", "event_organizer"),
      ...fragment(2, "Tvarkiau ofisą - 1 h", 1, "hours", "cleaner"),
      ...fragment(3, "tęsiau programavimą projekto labour market ai - 3 h", 3, "hours", "Programavimas"),
      metric({ metric_slug: "quantity", value_numeric: 5, unit_slug: "hours" }),
      metric({ metric_slug: "work_date", value_text: "2026-07-02" }),
    ]);
    expect(e.totalHours).toBe(9);
    expect(e.day).toBe("2026-07-02");
    expect(e.conflict?.value).toBe(5);
  });

  it("3d2bb255 — 1 h + 3 h fragments, entry quantity 5 h -> 4 h", () => {
    const e = entryOf([
      ...fragment(1, "Tvarkiau ofisą - 1 h", 1, "hours", "cleaner"),
      ...fragment(2, "tęsiau programavimą projekto labour market ai - 3 h", 3, "hours", "Programavimas"),
      metric({ metric_slug: "quantity", value_numeric: 5, unit_slug: "hours" }),
      metric({ metric_slug: "work_date", value_text: "2026-07-02" }),
    ]);
    expect(e.totalHours).toBe(4);
    expect(e.conflict?.value).toBe(5);
  });

  it("7d185907 — mixed minutes and hours, entry quantity 4 h -> 7.58 h", () => {
    const e = entryOf([
      ...fragment(1, "15 minučių atlikau programėlės patikrinimą", 15, "minutes"),
      ...fragment(2, "valandą dvidešimt minučių programavau pataisymus", 20, "minutes"),
      ...fragment(3, "4 valandas glaisčiau sienas", 4, "hours"),
      ...fragment(4, "dvi valandas prižiūrėjau žirgus", 2, "hours"),
      ...fragment(5, "valandą su puse dėsčiau paskaitą Vytauto didžiojo universitete", 1, "hours"),
      metric({ metric_slug: "quantity", value_numeric: 4, unit_slug: "hours" }),
      metric({ metric_slug: "work_date", value_text: "2026-05-25" }),
    ]);
    // 0.25 + 0.33 + 4 + 2 + 1 — every line rounded at the same place the SQL
    // rounds, so the two derivations cannot drift apart.
    expect(e.totalHours).toBe(7.58);
    expect(e.lines).toHaveLength(5);
    expect(e.conflict?.value).toBe(4);
  });
});
