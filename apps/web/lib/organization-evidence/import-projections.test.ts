import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/work-history-2025-part3.staged.json";
import {
  resolveRowContexts,
  sessionPlaces,
  type ImportPreview,
  type PreviewRow,
} from "./import-core";
import { WEEK_CONFLICT_METHOD, isoWeekOf } from "./parse-tabular";
import { classifyTimeSemantics, timeSemanticsOpen, type TimeSemantics } from "./time-semantics";
import { projectImport } from "./import-projections";

/**
 * The pre-commit projections over the owner's real (anonymised) import,
 * against an empty organization — production's state on 2026-09-16. The
 * rows are assembled exactly as `buildPreview` assembles them: every
 * person unmatched and covered by the plan, every place resolved by
 * `resolveRowContexts`, the time semantics classified from the source's
 * words, the parser's `calendarWeek` on the rows that carry it.
 */

type Staged = {
  readonly row_index: number;
  readonly person_label: string;
  readonly context_label: string | null;
  readonly activity_date: string;
  readonly hours: number | null;
  readonly activity_text: string;
  readonly week_conflict: boolean;
};

type Decide = (ts: TimeSemantics) => TimeSemantics;

function buildPreview(decide?: Decide): ImportPreview {
  const staged = fixture as readonly Staged[];
  const { canonical, knownAll } = sessionPlaces(staged as unknown as Record<string, unknown>[], []);
  const rows: PreviewRow[] = staged.map((s) => {
    const contexts = resolveRowContexts({
      contextLabel: s.context_label, activityText: s.activity_text, hours: s.hours,
      prior: null, rowChosenObjectId: null, objects: [], knownAll, canonical,
    });
    const derived: Record<string, unknown> = {};
    let ts = classifyTimeSemantics({ hours: s.hours, hasSingleDate: true, workText: s.activity_text, contextLabel: s.context_label });
    if (ts && decide) ts = decide(ts);
    if (ts) derived.timeSemantics = ts;
    if (s.week_conflict) derived.calendarWeek = { value: isoWeekOf(s.activity_date), method: WEEK_CONFLICT_METHOD, confidence: 1, note: "source_week=50" };
    const open = timeSemanticsOpen(ts);
    const ambiguous = contexts?.segments.some((x) => x.state === "ambiguous") ?? false;
    return {
      id: `row-${s.row_index}`, rowIndex: s.row_index,
      personLabel: s.person_label, personState: "unmatched", personId: null, personName: null,
      personConfidence: null, personCandidates: [],
      contextLabel: s.context_label,
      contextState: !contexts || contexts.segments.every((x) => x.kind !== "place") ? "absent" : ambiguous ? "ambiguous" : "unmatched",
      workObjectId: null, workObjectName: null, contextCandidates: [],
      activityDate: s.activity_date, periodStart: null, periodEnd: null, hours: s.hours,
      activityText: s.activity_text, factFields: ["personLabel", "workDate", "hours", "workText"], derived,
      duplicateState: "new", duplicateOfRecordId: null,
      ready: false,
      readyWithPlan: !open && !ambiguous,
      contextWillCreate: contexts?.segments.some((x) => x.state === "new") ?? false,
      contexts,
      timeSemantics: ts,
      timeSemanticsOpen: open,
      problem: open ? "time_semantics_open" : "person_not_on_roster",
    };
  });
  const people = new Map<string, number>();
  for (const r of rows) people.set(r.personLabel!, (people.get(r.personLabel!) ?? 0) + 1);
  return {
    sessionId: "s", organizationId: "o", persisted: false, rows,
    plan: {
      people: [...people.entries()].map(([label, n]) => ({ label, rows: n })),
      objects: canonical.filter((c) => c.existing === null).map((c) => ({ label: c.name, rows: c.rows, spellings: c.spellings.map((x) => x.label), origin: "cell" as const })),
    },
    source: { kind: "xlsx", filename: "work_history_2025_part3.xlsx", supplierRole: "employer", language: "en" },
    counts: {
      total: rows.length, ready: 0, needsPerson: 0, needsContext: 0, duplicates: 0, conflicts: 0,
      willCreatePeople: people.size, willCreateObjects: canonical.length, weekConflicts: 4,
      timeSemanticsOpen: rows.filter((r) => r.timeSemanticsOpen).length, siteUnknown: 6, unallocatedMultiPlace: 0, ambiguousPlaces: 0,
    },
  };
}

describe("what the owner sees before commit — the real file, projected", () => {
  const projection = projectImport(buildPreview());

  it("seven people as evidence: span, days, daily hours, places with dates, words — and no score, no current state", () => {
    expect(projection.people).toHaveLength(7);
    for (const p of projection.people) {
      expect(p.state).toBe("new");
      expect(p.firstDate ?? p.aggregateRows).toBeTruthy();
      expect(Object.keys(p)).not.toEqual(expect.arrayContaining(["score", "rating", "rank", "level", "available", "employed", "wage"]));
      for (const pl of p.places) if (pl.rows > 0 && p.days > 0) expect(pl.firstDate).not.toBeNull();
    }
    const top = projection.people[0];
    expect(top.rows).toBe(40);
    expect(top.places.length).toBeGreaterThan(3);
    expect(top.weeks.length).toBeGreaterThan(3);
    expect(top.evidenceSamples.length).toBeGreaterThan(0);
    expect(top.interpretations.some((i) => i.method === "site_from_work_text" || i.method === "typo_same_house_number")).toBe(true);
  });

  it("period aggregates are kept apart from daily hours everywhere — person, company, calendar", () => {
    const withAggregate = projection.people.filter((p) => p.aggregateRows > 0);
    expect(withAggregate.map((p) => p.aggregateHours).sort((a, b) => a - b)).toEqual([165, 800]);
    for (const p of withAggregate) expect(p.hours).toBeLessThan(400);
    expect(projection.company.aggregateHours).toBe(965);
    expect(projection.company.aggregateRows).toBe(2);
    expect(projection.company.statedHours).toBeLessThan(1500);
    expect(projection.company.statedHours).toBeGreaterThan(1000);
    // On no day, in no week total; listed apart with period UNKNOWN.
    const nov17 = projection.calendar.weeks.flatMap((w) => w.days).find((d) => d.date === "2025-11-17")!;
    expect(nov17.people.every((p) => (p.hours ?? 0) <= 24)).toBe(true);
    expect(projection.calendar.weeks.find((w) => w.isoWeek === 47)!.hours).toBeLessThan(400);
    expect(projection.calendar.aggregates).toHaveLength(2);
    for (const a of projection.calendar.aggregates) {
      expect(a.periodStart).toBeNull();
      expect(a.open).toBe(true);
      expect([165, 800]).toContain(a.sourceHours);
    }
    expect(projection.company.unknown).toContain("aggregate_period");
  });

  it("places are the real ones, with their spellings shown and shared rows counted apart", () => {
    const names = projection.places.map((p) => p.name);
    expect(names.length).toBeGreaterThanOrEqual(15);
    expect(names.length).toBeLessThanOrEqual(19);
    for (const n of names) expect(n).not.toContain(";");
    const h13 = projection.places.find((p) => p.name === "Testgracht 13")!;
    expect(h13.spellings).toEqual(expect.arrayContaining(["Testgraht 13"]));
    expect(h13.sharedRows).toBeGreaterThan(0);
    expect(h13.statedHours).toBeGreaterThan(0);
    expect(h13.people).toBeGreaterThanOrEqual(3);
  });

  it("the calendar carries every place of a day with its explicit hours or null — never a divided guess", () => {
    const c = projection.calendar;
    expect(c.firstDate).toBe("2025-10-22");
    expect(c.lastDate).toBe("2025-12-15");
    expect(c.weeks.map((w) => w.isoWeek)).toEqual([43, 44, 45, 46, 47, 48, 49, 50, 51]);
    const multi = c.weeks.flatMap((w) => w.days).flatMap((d) => d.people).filter((p) => p.places.length > 1);
    expect(multi.length).toBeGreaterThan(30);
    const explicit = multi.find((p) => p.places.every((pl) => pl.hours !== null));
    expect(explicit).toBeDefined();
    expect(explicit!.places.reduce((s, pl) => s + (pl.hours ?? 0), 0)).toBeLessThanOrEqual(explicit!.hours ?? 0 + 0.01);
    const unknownSplit = multi.find((p) => p.places.every((pl) => pl.hours === null));
    expect(unknownSplit).toBeDefined();
    expect(unknownSplit!.hours).not.toBeNull();
  });

  it("the field shows who is evidenced where, by week and overall — a projection, not a team", () => {
    const f = projection.field;
    expect(f.weeks.map((w) => w.isoWeek)).toEqual([43, 44, 45, 46, 47, 48, 49, 50, 51]);
    const w49 = f.weeks.find((w) => w.isoWeek === 49)!;
    expect(w49.people.length).toBeGreaterThanOrEqual(3);
    expect(w49.places.length).toBeGreaterThanOrEqual(2);
    for (const pl of w49.places) expect(pl.people.length).toBeGreaterThan(0);
    const h3 = f.places.find((p) => p.name === "Testgracht 3")!;
    expect(h3.people.length).toBeGreaterThanOrEqual(3);
    expect(h3.days).toBeGreaterThan(20);
    expect(Object.keys(f)).toEqual(["weeks", "places"]);
    expect(JSON.stringify(f)).not.toMatch(/team|brigade|member/i);
  });

  it("the issues are genuine: the two figures are ONE blocking question, listed with the source's words", () => {
    const kinds = Object.fromEntries(projection.issues.map((i) => [i.kind, i]));
    expect(kinds.time_semantics.count).toBe(2);
    expect(kinds.time_semantics.blocking).toBe(true);
    expect(kinds.time_semantics.timeRows.map((r) => r.sourceHours).sort((a, b) => a - b)).toEqual([165, 800]);
    expect(kinds.time_semantics.timeRows.every((r) => r.machineReading === "period_aggregate")).toBe(true);
    expect(kinds.time_semantics.timeRows.every((r) => r.periodWords === "month")).toBe(true);
    expect(kinds.week_conflicts.count).toBe(4);
    expect(kinds.week_conflicts.blocking).toBe(false);
    expect(kinds.site_unknown.count).toBe(6);
    expect(kinds.allocation_unknown.count).toBeGreaterThanOrEqual(25);
    expect(projection.issues.filter((i) => i.blocking)).toHaveLength(1);
    const fromText = projection.issues.filter((i) => i.kind === "place_from_text");
    expect(fromText.map((i) => i.label)).toEqual(["Testdienst 13"]);
  });

  it("what commit would create: 156 daily records now, 2 held; then the human's decision changes the SHAPE, never the figure", () => {
    expect(projection.commit.records).toBe(156);
    expect(projection.commit.dailyRecords).toBe(156);
    expect(projection.commit.notWritten).toBe(2);
    expect(projection.commit.createPeople).toBe(7);

    // Decided as an aggregate with the period UNKNOWN: dated facts without duration.
    const unknownPeriod = projectImport(buildPreview((ts) => ({ ...ts, method: "human_choice", remote: true })));
    expect(unknownPeriod.commit.records).toBe(158);
    expect(unknownPeriod.commit.dailyRecords).toBe(156);
    expect(unknownPeriod.commit.undatedDurationRecords).toBe(2);
    expect(unknownPeriod.commit.periodRecords).toBe(0);
    expect(unknownPeriod.company.statedHours).toBe(projection.company.statedHours);
    expect(unknownPeriod.company.remoteRows).toBe(2);
    expect(unknownPeriod.issues.find((i) => i.kind === "time_semantics")).toBeUndefined();

    // Decided with a period the human knows: period records — still not a day.
    const known = projectImport(buildPreview((ts) => ({ ...ts, method: "human_choice", periodStart: "2024-07-01", periodEnd: "2025-10-31" })));
    expect(known.commit.periodRecords).toBe(2);
    expect(known.commit.undatedDurationRecords).toBe(0);
    expect(known.calendar.aggregates.every((a) => a.periodStart === "2024-07-01" && !a.open)).toBe(true);
    expect(known.company.unknown).not.toContain("aggregate_period");
    expect(known.company.statedHours).toBe(projection.company.statedHours);
  });
});
