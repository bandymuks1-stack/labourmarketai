import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/work-history-2025-part3.staged.json";
import {
  resolveRowContexts,
  sessionPlaces,
  type ImportPreview,
  type PreviewRow,
} from "./import-core";
import { HOURS_EXCEED_DAY_METHOD, WEEK_CONFLICT_METHOD, isoWeekOf } from "./parse-tabular";
import { projectImport } from "./import-projections";

/**
 * The pre-commit projections over the owner's real (anonymised) import,
 * against an empty organization — production's state on 2026-09-16. The
 * rows are assembled exactly as `buildPreview` assembles them: every
 * person unmatched and covered by the plan, every place resolved by
 * `resolveRowContexts`, the parser's `hoursPlausibility` and
 * `calendarWeek` on the rows that carry them.
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

function buildPreview(acknowledgeImpossible = false): ImportPreview {
  const staged = fixture as readonly Staged[];
  const { canonical, knownAll } = sessionPlaces(staged as unknown as Record<string, unknown>[], []);
  const rows: PreviewRow[] = staged.map((s) => {
    const contexts = resolveRowContexts({
      contextLabel: s.context_label, activityText: s.activity_text, hours: s.hours,
      prior: null, rowChosenObjectId: null, objects: [], knownAll, canonical,
    });
    const derived: Record<string, unknown> = {};
    if (s.hours !== null && s.hours > 24) derived.hoursPlausibility = { value: s.hours, method: HOURS_EXCEED_DAY_METHOD, confidence: 1 };
    if (s.week_conflict) derived.calendarWeek = { value: isoWeekOf(s.activity_date), method: WEEK_CONFLICT_METHOD, confidence: 1, note: "source_week=50" };
    const impossible = "hoursPlausibility" in derived && !acknowledgeImpossible;
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
      readyWithPlan: !impossible && !ambiguous,
      contextWillCreate: contexts?.segments.some((x) => x.state === "new") ?? false,
      contexts,
      acknowledged: acknowledgeImpossible && "hoursPlausibility" in derived,
      problem: impossible ? "hours_exceed_day" : "person_not_on_roster",
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
      impossibleHours: 2, siteUnknown: 6, unallocatedMultiPlace: 0, ambiguousPlaces: 0,
    },
  };
}

describe("what the owner sees before commit — the real file, projected", () => {
  const projection = projectImport(buildPreview());

  it("seven people, each with their real span, days and stated hours — no score anywhere", () => {
    expect(projection.people).toHaveLength(7);
    for (const p of projection.people) {
      expect(p.state).toBe("new");
      expect(p.days).toBeGreaterThan(0);
      expect(p.days).toBeLessThanOrEqual(p.rows);
      expect(p.firstDate).toMatch(/^2025-1[0-2]-/);
      expect(Object.keys(p)).not.toEqual(expect.arrayContaining(["score", "rating", "rank", "level"]));
    }
    const top = projection.people[0];
    expect(top.rows).toBe(40);
    expect(top.places.length).toBeGreaterThan(3);
  });

  it("flagged hours are kept apart from stated hours, never summed in", () => {
    const flagged = projection.people.filter((p) => p.flaggedHours > 0);
    expect(flagged.map((p) => p.flaggedHours).sort((a, b) => a - b)).toEqual([165, 800]);
    for (const p of flagged) expect(p.hours).toBeLessThan(400);
    expect(projection.company.flaggedHours).toBe(965);
    expect(projection.company.statedHours).toBeLessThan(1500);
    expect(projection.company.statedHours).toBeGreaterThan(1000);
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
    expect(projection.places.every((p) => p.state === "new")).toBe(true);
  });

  it("the calendar spans source weeks 43–51 with one row per person-day", () => {
    const c = projection.calendar;
    expect(c.firstDate).toBe("2025-10-22");
    expect(c.lastDate).toBe("2025-12-15");
    expect(c.weeks.map((w) => w.isoWeek)).toEqual([43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(c.people).toHaveLength(7);
    expect(c.personDays).toBeLessThanOrEqual(158);
    expect(c.personDays).toBeGreaterThan(140);
    // The impossible day is on the calendar, flagged, and counted in no week total.
    const nov17 = c.weeks.flatMap((w) => w.days).find((d) => d.date === "2025-11-17")!;
    expect(nov17.people.filter((p) => p.flagged)).toHaveLength(2);
    const w47 = c.weeks.find((w) => w.isoWeek === 47)!;
    expect(w47.hours).toBeLessThan(400);
  });

  it("the issues are the genuine ones, and only the impossible figures block", () => {
    const kinds = Object.fromEntries(projection.issues.map((i) => [i.kind, i]));
    expect(kinds.impossible_hours.count).toBe(2);
    expect(kinds.impossible_hours.blocking).toBe(true);
    expect(kinds.impossible_hours.sample).toMatch(/800 h|165 h/);
    expect(kinds.week_conflicts.count).toBe(4);
    expect(kinds.week_conflicts.blocking).toBe(false);
    // Three rows name no site at all (a bare name, a town nobody else names)
    // and three name only an activity or a duration note — six without a place.
    expect(kinds.site_unknown.count).toBe(6);
    expect(kinds.allocation_unknown.count).toBeGreaterThan(30);
    expect(kinds.ambiguous_place).toBeUndefined();
    expect(kinds.ambiguous_person).toBeUndefined();
    expect(projection.issues.filter((i) => i.blocking)).toHaveLength(1);
  });

  it("the company view names what the source does NOT say", () => {
    expect(projection.company.unknown).toEqual(expect.arrayContaining(["client", "project", "wage", "team"]));
    expect(projection.company.activities).toEqual(["Administraciniai/koordinavimo darbai"]);
    expect(projection.company.people).toBe(7);
  });

  it("what commit would create: 156 records now, 2 held until acknowledged; 7 people; the real places", () => {
    expect(projection.commit.records).toBe(156);
    expect(projection.commit.notWritten).toBe(2);
    expect(projection.commit.createPeople).toBe(7);
    expect(projection.commit.createObjects).toBeGreaterThanOrEqual(15);
    expect(projection.commit.evidenceState).toBe("ORGANIZATION_REPORTED");
    const after = projectImport(buildPreview(true));
    expect(after.commit.records).toBe(158);
    expect(after.issues.find((i) => i.kind === "impossible_hours")).toBeUndefined();
  });
});
