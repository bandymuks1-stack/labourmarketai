import { describe, expect, it } from "vitest";

import {
  attributedHoursBySlug,
  confirmedHoursBySlug,
  deriveWorkIntelligence,
  evidencedSkillSlugs,
  workPeriodBounds,
  type WorkIntelligenceEntry,
  type WorkIntelligenceOrganizationRecord,
  type WorkIntelligenceSkillRow,
} from "./work-intelligence";

const TODAY = "2026-09-11";

const metric = (
  slug: string,
  v: { n?: number; t?: string; unit?: string; source?: string; created?: string },
) => ({
  metric_slug: slug,
  value_numeric: v.n ?? null,
  value_text: v.t ?? null,
  unit_slug: v.unit ?? null,
  source: v.source ?? "worker_input",
  created_at: v.created ?? "2026-09-01T00:00:00Z",
});

const entry = (
  id: string,
  day: string,
  o: Partial<WorkIntelligenceEntry> & {
    hours?: number;
    /** [hours, activity label, skill slugs the link was recognised ON this fragment] */
    frags?: [number, string | null, string[]?][];
  } = {},
): WorkIntelligenceEntry => {
  const metrics = [metric("work_date", { t: day })];
  if (o.hours !== undefined) metrics.push(metric("quantity", { n: o.hours, unit: "hours" }));
  (o.frags ?? []).forEach(([h, activity, fragmentSkills], i) => {
    metrics.push(metric("parsed_fragment", { t: `${i + 1}|phrase ${i + 1}` }));
    metrics.push(metric("fragment_time", { n: h, unit: "hours", t: String(i + 1) }));
    if (activity) metrics.push(metric("fragment_activity", { t: `${i + 1}|${activity}` }));
    for (const slug of fragmentSkills ?? []) metrics.push(metric("fragment_skill", { t: `${i + 1}|${slug}` }));
  });
  return {
    entryId: id,
    createdAt: `${day}T18:00:00Z`,
    originalText: `entry ${id}`,
    metrics: [...metrics, ...(o.metrics ?? [])],
    engagementContextId: o.engagementContextId === undefined ? "ctx-a" : o.engagementContextId,
    reviewResult: o.reviewResult ?? "submitted",
    linkedSkillIds: o.linkedSkillIds ?? [],
    linkProvenance: o.linkProvenance,
    photoCount: o.photoCount,
  };
};

const SKILLS: WorkIntelligenceSkillRow[] = [
  { skillId: "s-tiling", slug: "tiling", verified: true, source: "manager_confirmed" },
  { skillId: "s-plaster", slug: "plastering", verified: false, source: "work_journal" },
  { skillId: "s-paint", slug: "painting", verified: false, source: "self_declared" },
];

describe("workPeriodBounds", () => {
  it("is inclusive UTC calendar days ending today", () => {
    expect(workPeriodBounds("today", TODAY)).toEqual({ startIso: TODAY, endIso: TODAY });
    expect(workPeriodBounds("week", TODAY)).toEqual({ startIso: "2026-09-05", endIso: TODAY });
    expect(workPeriodBounds("year", TODAY)).toEqual({ startIso: "2025-09-12", endIso: TODAY });
    expect(workPeriodBounds("month", TODAY)).toEqual({ startIso: "2026-08-13", endIso: TODAY });
    expect(workPeriodBounds("all", TODAY)).toEqual({ startIso: null, endIso: TODAY });
  });
});

describe("deriveWorkIntelligence — totals never double count", () => {
  it("counts each entry ONCE: fragments win over an entry-level quantity", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        // 5 h of fragments AND a 9 h entry quantity → 5 h, never 14.
        entry("e1", "2026-09-10", { hours: 9, frags: [[3, "tiler"], [2, null]], linkedSkillIds: ["s-tiling"] }),
      ],
    });
    expect(wi.totalHours).toBe(5);
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(5);
    expect(all.entries).toBe(1);
    expect(all.daysWorked).toBe(1);
  });

  it("the sum of attributed + shared + unattributed equals the total", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("a", "2026-09-10", { hours: 8, linkedSkillIds: ["s-tiling"] }),
        entry("b", "2026-09-09", { hours: 6, linkedSkillIds: ["s-tiling", "s-plaster"] }),
        entry("c", "2026-09-08", { hours: 4 }),
      ],
    });
    expect(wi.totalHours).toBe(18);
    expect(wi.attributedHours).toBe(8);
    expect(wi.sharedHours).toBe(6);
    expect(wi.unattributedHours).toBe(4);
    expect(wi.attributedHours + wi.sharedHours + wi.unattributedHours).toBe(wi.totalHours);
  });

  it("shared hours are listed under each skill but never added to attributed", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("a", "2026-09-10", { hours: 8, linkedSkillIds: ["s-tiling"] }),
        entry("b", "2026-09-09", { hours: 6, linkedSkillIds: ["s-tiling", "s-plaster"] }),
      ],
    });
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    const plaster = wi.skills.find((s) => s.slug === "plastering")!;
    expect(tiling.attributedHours).toBe(8);
    expect(tiling.sharedHours).toBe(6);
    expect(plaster.attributedHours).toBe(0);
    expect(plaster.sharedHours).toBe(6);
    // frequency counts the shared entry for both
    expect(tiling.entries).toBe(2);
    expect(plaster.entries).toBe(1);
    expect(wi.sharedEntries).toBe(1);
    // share is a fraction of ATTRIBUTED hours only
    expect(tiling.share).toBe(1);
    expect(plaster.share).toBe(0);
  });

  it("days-unit durations stay in day units and never become hours", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("d", "2026-09-10", {
          metrics: [metric("quantity", { n: 2, unit: "days" })],
          linkedSkillIds: ["s-tiling"],
        }),
      ],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(0);
    expect(all.dayUnits).toBe(2);
    // A day recorded in DAYS is still a day that carries a duration line —
    // "0 days worked" beside "2 days" was the contradictory copy of F5. The
    // day units themselves are never converted into hours.
    expect(all.daysWorked).toBe(1);
    expect(wi.skills.find((s) => s.slug === "tiling")!.attributedHours).toBe(0);
  });

  it("one linked skill but SEVERAL kinds of work in the fragments → involvement, split by activity only", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [entry("m", "2026-09-10", { frags: [[6, "tiler"], [2, "plasterer"]], linkedSkillIds: ["s-tiling"] })],
    });
    expect(wi.totalHours).toBe(8);
    expect(wi.attributedHours).toBe(0);
    expect(wi.multiActivityHours).toBe(8);
    expect(wi.multiActivityEntries).toBe(1);
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    expect(tiling.attributedHours).toBe(0);
    expect(tiling.sharedHours).toBe(8);
    expect(tiling.entries).toBe(1);
    expect(wi.activities.map((a) => [a.key, a.hours])).toEqual([["tiler", 6], ["plasterer", 2]]);
    // one kind of work in the fragments → attributed as before
    const one = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [entry("o", "2026-09-10", { frags: [[6, "tiler"], [2, "tiler"]], linkedSkillIds: ["s-tiling"] })],
    });
    expect(one.skills.find((s) => s.slug === "tiling")!.attributedHours).toBe(8);
  });

  it("FRAGMENT EVIDENCE: '6 h tiles, 2 h plaster' with both skills linked ON their fragments → 6 h tiling, 2 h plastering, nothing shared", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("f", "2026-09-10", {
          frags: [[6, "tiler", ["tiling"]], [2, "plasterer", ["plastering"]]],
          linkedSkillIds: ["s-tiling", "s-plaster"],
          reviewResult: "approved",
        }),
      ],
    });
    expect(wi.totalHours).toBe(8);
    expect(wi.attributedHours).toBe(8);
    expect(wi.sharedHours).toBe(0);
    expect(wi.sharedEntries).toBe(0);
    expect(wi.multiActivityHours).toBe(0);
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    const plaster = wi.skills.find((s) => s.slug === "plastering")!;
    expect([tiling.attributedHours, tiling.confirmedHours, tiling.sharedHours]).toEqual([6, 6, 0]);
    expect([plaster.attributedHours, plaster.confirmedHours, plaster.sharedHours]).toEqual([2, 2, 0]);
    expect(tiling.share).toBe(0.75);
    expect(plaster.share).toBe(0.25);
    expect(wi.attributedHours + wi.sharedHours + wi.multiActivityHours + wi.unattributedHours).toBe(wi.totalHours);
  });

  it("FRAGMENT EVIDENCE: one linked skill on one of two fragments → that fragment attributed, the other stays multi-activity", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("g", "2026-09-10", {
          frags: [[6, "tiler", ["tiling"]], [2, "Sienų glaistymas"]],
          linkedSkillIds: ["s-tiling"],
        }),
      ],
    });
    expect(wi.totalHours).toBe(8);
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    expect(tiling.attributedHours).toBe(6);
    expect(tiling.sharedHours).toBe(2);
    expect(wi.attributedHours).toBe(6);
    expect(wi.multiActivityHours).toBe(2);
    expect(wi.multiActivityEntries).toBe(1);
    expect(wi.attributedHours + wi.sharedHours + wi.multiActivityHours + wi.unattributedHours).toBe(wi.totalHours);
  });

  it("FRAGMENT EVIDENCE never guesses: two linked skills on the SAME fragment, an unlinked skill's row, or an entry-level duration all stay involvement", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        // both skills recognised on fragment 1 → nobody can claim it
        entry("h1", "2026-09-10", {
          frags: [[5, "tiler", ["tiling", "plastering"]]],
          linkedSkillIds: ["s-tiling", "s-plaster"],
        }),
        // the row names painting, which the worker UNLINKED → inert
        entry("h2", "2026-09-09", {
          frags: [[3, "painter", ["painting"]], [1, "tiler", ["tiling"]]],
          linkedSkillIds: ["s-tiling", "s-plaster"],
        }),
        // entry-level duration, two skills, a stray row → the row has no fragment to sit on
        entry("h3", "2026-09-08", {
          hours: 4,
          linkedSkillIds: ["s-tiling", "s-plaster"],
          metrics: [metric("fragment_skill", { t: "1|tiling" })],
        }),
      ],
    });
    expect(wi.totalHours).toBe(13);
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    const plaster = wi.skills.find((s) => s.slug === "plastering")!;
    // only h2's fragment 2 (1 h, tiling alone) is attributable
    expect(tiling.attributedHours).toBe(1);
    expect(plaster.attributedHours).toBe(0);
    expect(wi.attributedHours).toBe(1);
    expect(wi.sharedHours).toBe(12);
    expect(wi.sharedEntries).toBe(3);
    expect(tiling.sharedHours).toBe(12);
    expect(plaster.sharedHours).toBe(12);
    expect(wi.attributedHours + wi.sharedHours + wi.multiActivityHours + wi.unattributedHours).toBe(wi.totalHours);
  });

  it("a non-time quantity is not time, and counts as an entry without duration", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("m", "2026-09-10", {
          metrics: [metric("quantity", { n: 40, unit: "square_meters" })],
          linkedSkillIds: ["s-tiling"],
        }),
      ],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(0);
    expect(all.entries).toBe(1);
    expect(all.entriesWithoutDuration).toBe(1);
    // the link still counts as frequency evidence
    expect(wi.skills.find((s) => s.slug === "tiling")!.entries).toBe(1);
  });
});

describe("deriveWorkIntelligence — periods", () => {
  it("week / month / all windows are inclusive on the day WORKED, not created", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("w", "2026-09-05", { hours: 2 }), // week boundary (7 days incl.)
        entry("x", "2026-09-04", { hours: 3 }), // outside week, inside month
        entry("y", "2026-08-13", { hours: 4 }), // month boundary (30 days incl.)
        entry("z", "2026-08-12", { hours: 5 }), // outside month
        // created today but WORKED last year
        { ...entry("old", "2025-01-01", { hours: 1 }), createdAt: `${TODAY}T10:00:00Z` },
      ],
    });
    const by = Object.fromEntries(wi.periods.map((p) => [p.key, p]));
    expect(by.week!.hours).toBe(2);
    expect(by.month!.hours).toBe(9);
    expect(by.all!.hours).toBe(15);
    expect(by.all!.daysWorked).toBe(5);
  });

  it("confirmed hours come ONLY from approved entries", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("ok", "2026-09-10", { hours: 8, reviewResult: "approved", linkedSkillIds: ["s-tiling"] }),
        entry("cr", "2026-09-09", { hours: 8, reviewResult: "changes_requested", linkedSkillIds: ["s-tiling"] }),
        entry("rj", "2026-09-08", { hours: 8, reviewResult: "rejected", linkedSkillIds: ["s-tiling"] }),
        entry("sb", "2026-09-07", { hours: 8, linkedSkillIds: ["s-tiling"] }),
      ],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(32);
    expect(all.confirmedHours).toBe(8);
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    expect(tiling.attributedHours).toBe(32);
    expect(tiling.confirmedHours).toBe(8);
  });
});

/**
 * COVERAGE SEMANTICS (re-audit 2026-09-11, F2/F3/F4/F5).
 *
 * Every share the product prints must name the base it is a share OF, and no
 * recorded hour may vanish from the reading it belongs to. These cases are
 * the ones the audit constructed against the real model.
 */
describe("deriveWorkIntelligence — coverage semantics", () => {
  it("F4 · several TIMED parts brake the single-skill claim even when no kind of work is named", () => {
    // The owner's own sentence: "5 h programming, 2 h testing, 2 h partners",
    // one linked skill, two of the three parts with no recognised activity.
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("f4", "2026-09-10", {
          frags: [
            [5, null],
            [2, null],
            [2, null],
          ],
          linkedSkillIds: ["s-tiling"],
        }),
      ],
    });
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    expect(tiling.attributedHours).toBe(0);
    expect(tiling.sharedHours).toBe(9);
    expect(wi.multiActivityHours).toBe(9);
    expect(wi.attributedHours).toBe(0);
  });

  it("F4 · the brake lifts when every timed part names the SAME kind of work", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("f4b", "2026-09-10", {
          frags: [
            [5, "tiler"],
            [3, "tiler"],
          ],
          linkedSkillIds: ["s-tiling"],
        }),
      ],
    });
    expect(wi.skills.find((s) => s.slug === "tiling")!.attributedHours).toBe(8);
    expect(wi.multiActivityHours).toBe(0);
  });

  it("F4 · a `fragment_skill` row still says WHERE, so that part is claimed and the rest stays involvement", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("f4c", "2026-09-10", {
          frags: [
            [5, null, ["tiling"]],
            [2, null],
            [2, null],
          ],
          linkedSkillIds: ["s-tiling"],
        }),
      ],
    });
    expect(wi.skills.find((s) => s.slug === "tiling")!.attributedHours).toBe(5);
    expect(wi.multiActivityHours).toBe(4);
    // every hour is still counted exactly once
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(wi.attributedHours + wi.sharedHours + wi.multiActivityHours + wi.unattributedHours).toBe(all.hours);
  });

  it("F2 · timed parts with no kind of work stay in the denominator and are named", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("f2", "2026-09-10", {
          frags: [
            [6, "tiler"],
            [4, null],
          ],
          linkedSkillIds: ["s-tiling"],
        }),
      ],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(10);
    expect(wi.activityHours).toBe(6);
    expect(wi.unlabelledHours).toBe(4);
    expect(wi.unlabelledEntries).toBe(1);
    // nothing vanishes from "kinds of work"
    expect(wi.activityHours + wi.unlabelledHours).toBe(all.hours);
    // 6 of 10 h — NOT 6 of 6 h, which would read as a 100 % main activity
    expect(wi.activities).toEqual([
      { key: "tiler", hours: 6, share: 0.6, entries: 1, contexts: 1, lastWorkedDay: "2026-09-10", trend: "new" },
    ]);
  });

  it("F3 · a skill share is a share of the ATTRIBUTED hours, and the model exposes that base", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        // 95 h nobody linked + 5 h of tiling → "5 h · 100 %" is only honest
        // when the 5 h base is visible beside it.
        entry("f3a", "2026-09-10", { hours: 95 }),
        entry("f3b", "2026-09-10", { hours: 5, linkedSkillIds: ["s-tiling"] }),
      ],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(100);
    expect(wi.attributedHours).toBe(5);
    expect(wi.unattributedHours).toBe(95);
    expect(wi.skills.find((s) => s.slug === "tiling")!.share).toBe(1);
  });

  it("F5 · work recorded in DAYS has its own confirmed figure and counts as a worked day", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("f5a", "2026-09-10", {
          metrics: [metric("quantity", { n: 2, unit: "days" })],
          reviewResult: "approved",
        }),
        entry("f5b", "2026-09-09", {
          metrics: [metric("quantity", { n: 1, unit: "days" })],
        }),
      ],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(0);
    expect(all.confirmedHours).toBe(0);
    expect(all.dayUnits).toBe(3);
    // the approved entry's days are confirmed days — never converted to hours
    expect(all.confirmedDayUnits).toBe(2);
    expect(all.daysWorked).toBe(2);
    expect(all.entriesWithoutDuration).toBe(0);
  });
});

describe("deriveWorkIntelligence — skills, activities, contexts, months", () => {
  const entries = [
    entry("a", "2026-09-10", { hours: 8, linkedSkillIds: ["s-tiling"], linkProvenance: new Map([["s-tiling", "recognized" as const]]) }),
    entry("b", "2026-08-20", { hours: 4, linkedSkillIds: ["s-tiling"], engagementContextId: "ctx-b", linkProvenance: new Map([["s-tiling", "manual" as const]]) }),
    entry("c", "2026-08-01", { frags: [[3, "tiler"], [1, "plasterer"]], linkedSkillIds: ["s-plaster"], engagementContextId: null }),
    entry("d", "2026-07-15", { metrics: [metric("work_direction", { t: "painter" }), metric("quantity", { n: 2, unit: "hours" })] }),
  ];

  it("recency, frequency and tier per skill; declared-only skills stay at zero", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    expect(tiling.attributedHours).toBe(12);
    expect(tiling.entries).toBe(2);
    expect(tiling.days).toBe(2);
    expect(tiling.lastWorkedDay).toBe("2026-09-10");
    expect(tiling.tier).toBe("manager_confirmed");
    expect(tiling.provenance).toEqual({ recognized: 1, manual: 1, confirmed: 0, unrecorded: 0 });
    const plaster = wi.skills.find((s) => s.slug === "plastering")!;
    // entry "c" names two kinds of work (tiler 3 h + plasterer 1 h) with one
    // linked skill → involvement, never 4 h of plastering
    expect(plaster.attributedHours).toBe(0);
    expect(plaster.sharedHours).toBe(4);
    expect(plaster.lastWorkedDay).toBe("2026-08-01");
    expect(plaster.tier).toBe("work_journal");
    expect(plaster.provenance.unrecorded).toBe(1);
    const paint = wi.skills.find((s) => s.slug === "painting")!;
    expect(paint.attributedHours).toBe(0);
    expect(paint.entries).toBe(0);
    expect(paint.lastWorkedDay).toBeNull();
    expect(paint.tier).toBe("self_declared");
    // ordered by hours desc
    expect(wi.skills.map((s) => s.slug)).toEqual(["tiling", "plastering", "painting"]);
    expect(tiling.share).toBe(1);
    expect(plaster.share).toBe(0);
    expect(wi.multiActivityHours).toBe(4);
  });

  it("activities come from the SAME fragment as the duration, or the entry direction", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    // `share` is of ALL 18 recorded hours of the focus period, not of the
    // 6 labelled ones — the coverage denominator of F2.
    expect(wi.activities).toEqual([
      { key: "tiler", hours: 3, share: 0.17, entries: 1, contexts: 1, lastWorkedDay: "2026-08-01", trend: "down" },
      { key: "painter", hours: 2, share: 0.11, entries: 1, contexts: 1, lastWorkedDay: "2026-07-15", trend: "down" },
      { key: "plasterer", hours: 1, share: 0.06, entries: 1, contexts: 1, lastWorkedDay: "2026-08-01", trend: "down" },
    ]);
    const allHours = wi.periods.find((p) => p.key === "all")!.hours;
    expect(wi.activityHours + wi.unlabelledHours).toBe(allHours);
  });

  it("contexts split hours per engagement, the personal (null) context included", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    expect(wi.contexts.map((c) => [c.engagementContextId, c.hours, c.entries])).toEqual([
      ["ctx-a", 10, 2],
      [null, 4, 1],
      ["ctx-b", 4, 1],
    ]);
  });

  it("months are oldest → newest and carry only months with entries", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    expect(wi.months.map((m) => [m.month, m.hours, m.entries])).toEqual([
      ["2026-07", 2, 1],
      ["2026-08", 8, 2],
      ["2026-09", 8, 1],
    ]);
  });

  it("hour provenance follows the metric row's own source", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("p1", "2026-09-10", { metrics: [metric("quantity", { n: 2, unit: "hours", source: "ai_extracted" })] }),
        entry("p2", "2026-09-10", { metrics: [metric("quantity", { n: 3, unit: "hours", source: "manager_corrected" })] }),
        entry("p3", "2026-09-10", { hours: 4 }),
      ],
    });
    expect(wi.provenance).toEqual({ workerInput: 4, aiExtracted: 2, managerCorrected: 3, unknown: 0 });
  });

  it("today and year periods, and context diversity per skill", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("t1", TODAY, { hours: 7.5, linkedSkillIds: ["s-tiling"] }),
        entry("t2", "2026-09-10", { hours: 8, linkedSkillIds: ["s-tiling"], engagementContextId: "ctx-b" }),
        entry("t3", "2025-09-11", { hours: 8, linkedSkillIds: ["s-tiling"] }), // outside the 365-day year
      ],
    });
    const by = Object.fromEntries(wi.periods.map((p) => [p.key, p]));
    expect(by.today!.hours).toBe(7.5);
    expect(by.week!.hours).toBe(15.5);
    expect(by.year!.hours).toBe(15.5);
    expect(by.all!.hours).toBe(23.5);
    expect(wi.skills.find((s) => s.slug === "tiling")!.contexts).toBe(2);
  });

  it("an 8-hour entry with four linked skills is 8 hours, four involvements and ZERO attributed each", () => {
    const four = [
      { skillId: "a", slug: "formwork", verified: false, source: null },
      { skillId: "b", slug: "measurement", verified: false, source: null },
      { skillId: "c", slug: "drawing", verified: false, source: null },
      { skillId: "d", slug: "power-tools", verified: false, source: null },
    ];
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: four,
      entries: [entry("x", TODAY, { hours: 8, linkedSkillIds: ["a", "b", "c", "d"] })],
    });
    expect(wi.totalHours).toBe(8);
    expect(wi.attributedHours).toBe(0);
    expect(wi.sharedHours).toBe(8);
    for (const s of wi.skills) {
      expect(s.attributedHours).toBe(0);
      expect(s.sharedHours).toBe(8);
      expect(s.entries).toBe(1);
    }
    // the sum of per-skill involvement is NOT a total anywhere in the model
    expect(wi.skills.reduce((n, s) => n + s.attributedHours, 0)).toBe(0);
  });

  it("outputs keep their recorded unit and never mix with time", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("o1", TODAY, { metrics: [metric("quantity", { n: 32, unit: "square_meters" })] }),
        entry("o2", "2026-09-10", { metrics: [metric("quantity", { n: 8, unit: "square_meters" })] }),
        entry("o3", "2026-09-09", { metrics: [metric("quantity", { n: 5, unit: "pieces" })] }),
        entry("o4", "2026-09-08", { hours: 6 }),
      ],
    });
    expect(wi.outputs).toEqual([
      { unit: "square_meters", activity: null, value: 40, entries: 2 },
      { unit: "pieces", activity: null, value: 5, entries: 1 },
    ]);
    expect(wi.totalHours).toBe(6);
  });

  it("evidence strength counts confirmations, photos and original documents; the rest is self-only", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("c", TODAY, { hours: 1, reviewResult: "approved" }),
        entry("p", TODAY, { hours: 1, photoCount: 2 }),
        entry("d", TODAY, { hours: 1, metrics: [metric("source_document_file", { t: "file-1" })] }),
        entry("s", TODAY, { hours: 1 }),
      ],
    });
    expect(wi.evidence).toEqual({ entries: 4, confirmed: 1, withPhotos: 1, fromDocument: 1, selfOnly: 1 });
  });

  it("trend compares the last 30 days of the focus window with the 30 before", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("r1", "2026-09-01", { frags: [[8, "tiler"], [1, "painter"]] }),
        entry("r2", "2026-08-01", { frags: [[4, "tiler"], [4, "painter"]] }),
        entry("r3", "2026-09-05", { frags: [[2, "roofer"]] }),
      ],
    });
    const by = Object.fromEntries(wi.activities.map((a) => [a.key, a.trend]));
    expect(by.tiler).toBe("up");
    expect(by.painter).toBe("down");
    expect(by.roofer).toBe("new");
  });

  it("is deterministic — input order does not change any figure", () => {
    const a = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    const b = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: [...SKILLS].reverse(),
      entries: [...entries].reverse(),
    });
    expect(b).toEqual(a);
  });

  it("evidenced slugs exclude declared-only skills; hours-by-slug carries attributed only", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    expect(evidencedSkillSlugs(wi)).toEqual(["tiling", "plastering"]);
    expect([...attributedHoursBySlug(wi).entries()]).toEqual([["tiling", 12]]);
  });

  it("focus scopes the skill / activity / context sections; periods and months never", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries, focus: "week" });
    expect(wi.focus).toBe("week");
    const tiling = wi.skills.find((s) => s.slug === "tiling")!;
    expect(tiling.attributedHours).toBe(8); // only entry "a" (2026-09-10)
    expect(tiling.entries).toBe(1);
    expect(wi.activities).toEqual([]);
    expect(wi.contexts).toEqual([{ engagementContextId: "ctx-a", hours: 8, confirmedHours: 0, entries: 1 }]);
    expect(wi.months).toHaveLength(3);
    expect(wi.periods.find((p) => p.key === "all")!.hours).toBe(18);
    expect(wi.totalHours).toBe(18);
    expect(wi.periods.map((p) => p.key)).toEqual(["today", "week", "month", "year", "all"]);
  });

  it("plausibility checks (owner §13) ride along, scoped to the focus, and change NO figure", () => {
    const entries = [
      entry("a", "2026-09-10", { hours: 20 }),
      entry("b", "2026-09-10", { hours: 20 }),
      entry("c", "2026-08-01", { hours: 17 }),
    ];
    const all = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    expect(all.checks.map((c) => c.key)).toEqual(["day_over_24h|2026-09-10", "long_day|2026-08-01"]);
    // warned, not corrected: every recorded hour is still counted
    expect(all.totalHours).toBe(57);
    expect(all.periods.find((p) => p.key === "week")!.hours).toBe(40);
    const week = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries, focus: "week" });
    expect(week.checks.map((c) => c.key)).toEqual(["day_over_24h|2026-09-10"]);
    // an acknowledged check stays listed, with the worker's reason
    const acked = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        ...entries.slice(0, 1),
        entry("b", "2026-09-10", {
          hours: 20,
          metrics: [metric("work_time_override", { t: "day_over_24h|2026-09-10|two shifts, both real" })],
        }),
      ],
    });
    expect(acked.checks[0]!.acknowledged).toEqual({ reason: "two shifts, both real", entryId: "b" });
    expect(acked.totalHours).toBe(40);
  });

  it("produces no person-level score, rating, rank or tier", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    const keys = JSON.stringify(Object.keys(wi));
    expect(keys).not.toMatch(/score|rating|rank/i);
  });
});

describe("the organization's hour records — a ledger beside the journal, never inside it (owner §19, re-audit F7)", () => {
  const rec = (
    id: string,
    workDate: string,
    hours: number,
    o: Partial<WorkIntelligenceOrganizationRecord> = {},
  ): WorkIntelligenceOrganizationRecord => ({
    id,
    workDate,
    hours,
    source: o.source ?? "manual",
    status: o.status ?? "recorded",
    organizationId: o.organizationId ?? "org-a",
    journalEntryId: o.journalEntryId ?? null,
  });
  // the production shape: five imported rows, 38 h, one organization
  const imported = [
    rec("r1", "2026-09-01", 8, { source: "import" }),
    rec("r2", "2026-09-02", 8, { source: "import" }),
    rec("r3", "2026-09-03", 6, { source: "import" }),
    rec("r4", "2026-09-04", 8, { source: "import" }),
    rec("r5", "2026-09-07", 8, { source: "import" }),
  ];
  const journal = [
    entry("e1", "2026-09-10", { frags: [[6, "tiler", ["tiling"]]], linkedSkillIds: ["s-tiling"] }),
    entry("e2", "2026-09-02", { hours: 8, linkedSkillIds: ["s-tiling"] }),
  ];

  it("is read beside the journal: every journal figure is byte-identical with and without the ledger", () => {
    const without = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries: journal });
    const withLedger = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: journal,
      organizationRecords: imported,
    });
    const { organizationRecords: a, checks: ca, ...restA } = without;
    const { organizationRecords: b, checks: cb, ...restB } = withLedger;
    expect(restB).toEqual(restA);
    expect(a).toBeNull();
    expect(withLedger.totalHours).toBe(14);
    expect(withLedger.periods.find((p) => p.key === "all")!.hours).toBe(14);
    // the skill reading is untouched: 38 recorded hours reach no skill
    expect(withLedger.skills.find((s) => s.slug === "tiling")!.attributedHours).toBe(14);
    expect(withLedger.attributedHours).toBe(14);
    expect(withLedger.activities.map((x) => x.hours)).toEqual(without.activities.map((x) => x.hours));
    // no check fired: 8 h journaled + 8 h recorded on 09-02 is 16 h, within a day
    expect(ca).toEqual([]);
    expect(cb).toEqual([]);
    expect(b!.find((p) => p.key === "all")).toMatchObject({
      hours: 38,
      rows: 5,
      daysWorked: 5,
      importedHours: 38,
      approvedHours: 0,
      linkedHours: 0,
      rejectedHours: 0,
      organizations: 1,
    });
  });

  it("per period, by the organization's stated work day; provenance named, never summed into the journal", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: journal,
      organizationRecords: [
        ...imported,
        rec("r6", "2026-09-11", 4, { status: "approved", organizationId: "org-b" }),
        rec("r7", "2026-09-10", 6, { journalEntryId: "e1" }),
        rec("r8", "2026-09-09", 5, { status: "rejected" }),
        rec("r9", "2026-09-09", 3, { journalEntryId: "gone-entry" }),
      ],
    });
    const week = wi.organizationRecords!.find((p) => p.key === "week")!;
    // 09-05..09-11: r5 (8) + r6 (4) + r7 (6) + r9 (3) = 21; r8 rejected apart
    expect(week).toMatchObject({
      hours: 21,
      rows: 4,
      daysWorked: 4,
      importedHours: 8,
      approvedHours: 4,
      linkedHours: 6,
      rejectedHours: 5,
      organizations: 2,
    });
    expect(wi.organizationRecords!.find((p) => p.key === "today")).toMatchObject({ hours: 4, rows: 1, approvedHours: 4 });
    expect(wi.organizationRecords!.find((p) => p.key === "all")!.hours).toBe(51);
    // the journal total is still the journal's
    expect(wi.totalHours).toBe(14);
    expect(wi.periods.find((p) => p.key === "week")!.hours).toBe(6);
  });

  it("feeds the DAY check: an imported timesheet on top of a live record is arithmetic, and the ledger is named", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [entry("e1", "2026-09-10", { hours: 9 })],
      organizationRecords: [
        rec("r1", "2026-09-10", 8, { source: "import" }),
        rec("r2", "2026-09-10", 5, { status: "rejected" }), // rejected: not on the day
        rec("r3", "2026-09-09", 30), // no journal line that day: no check
      ],
    });
    expect(wi.checks.map((c) => c.key)).toEqual(["long_day|2026-09-10"]);
    expect(wi.checks[0]).toMatchObject({ hours: 17, organizationHours: 8, entryIds: ["e1"] });
    // warned, not corrected
    expect(wi.totalHours).toBe(9);
    // the focus scopes the day check like every other check
    const month = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [entry("e1", "2026-07-10", { hours: 9 })],
      organizationRecords: [rec("r1", "2026-07-10", 8)],
      focus: "month",
    });
    expect(month.checks).toEqual([]);
  });

  it("UNKNOWN ≠ ZERO: an unread ledger is null, an empty one is every period at zero; malformed rows are skipped", () => {
    const unread = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries: journal, organizationRecords: null });
    expect(unread.organizationRecords).toBeNull();
    const empty = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries: journal, organizationRecords: [] });
    expect(empty.organizationRecords!.map((p) => p.hours)).toEqual([0, 0, 0, 0, 0]);
    const odd = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: journal,
      organizationRecords: [rec("x", "not-a-day", 8), rec("y", "2026-09-10", Number.NaN), rec("z", "2026-09-10", 0)],
    });
    expect(odd.organizationRecords!.find((p) => p.key === "all")!.hours).toBe(0);
    expect(odd.checks).toEqual([]);
  });

  it("is deterministic — record order changes no figure", () => {
    const a = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries: journal, organizationRecords: imported });
    const b = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: journal,
      organizationRecords: [...imported].reverse(),
    });
    expect(b.organizationRecords).toEqual(a.organizationRecords);
  });
});

describe("the five rules the re-audit pinned (2026-09-11, F8–F12)", () => {
  it("F8 · involvement is never a total: five skills on one 8 h entry each show 8 h, the person's shared figure is 8, and every hour is still counted once", () => {
    const five: WorkIntelligenceSkillRow[] = ["a", "b", "c", "d", "e"].map((k) => ({
      skillId: `s-${k}`,
      slug: `skill-${k}`,
      verified: false,
      source: "work_journal",
    }));
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: five,
      entries: [entry("x", "2026-09-10", { hours: 8, linkedSkillIds: five.map((s) => s.skillId) })],
    });
    for (const s of wi.skills) {
      expect(s.sharedHours).toBe(8);
      expect(s.attributedHours).toBe(0);
    }
    // the naive sum a consumer must never make
    expect(wi.skills.reduce((n, s) => n + s.sharedHours, 0)).toBe(40);
    expect(wi.sharedHours).toBe(8);
    expect(wi.totalHours).toBe(8);
    expect(wi.attributedHours + wi.sharedHours + wi.multiActivityHours + wi.unattributedHours).toBe(wi.totalHours);
    expect(attributedHoursBySlug(wi).size).toBe(0);
  });

  it("F9 · every output an entry recorded counts, one per unit: 40 m² and 12 m are two outputs, not \"12 m\"", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("o1", TODAY, {
          metrics: [
            metric("area_done", { n: 40, unit: "square_meters", created: "2026-09-11T08:00:00Z" }),
            metric("quantity", { n: 12, unit: "meters", created: "2026-09-11T08:00:01Z" }),
          ],
        }),
      ],
    });
    expect(wi.outputs).toEqual([
      { unit: "meters", activity: null, value: 12, entries: 1 },
      { unit: "square_meters", activity: null, value: 40, entries: 1 },
    ]);
  });

  it("F9 · a figure sent twice in the same unit is counted once (the latest row for that unit)", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("o1", TODAY, {
          metrics: [
            metric("quantity", { n: 40, unit: "square_meters", created: "2026-09-11T08:00:00Z" }),
            metric("area_done", { n: 42, unit: "square_meters", created: "2026-09-11T08:05:00Z" }),
          ],
        }),
      ],
    });
    expect(wi.outputs).toEqual([{ unit: "square_meters", activity: null, value: 42, entries: 1 }]);
  });

  it("F9 · a unit is totalled only inside one kind of work: km driven and km of cable never add up to 320 km", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("d1", TODAY, {
          metrics: [metric("work_direction", { t: "driver" }), metric("quantity", { n: 300, unit: "kilometers" })],
        }),
        entry("c1", "2026-09-10", {
          metrics: [metric("work_direction", { t: "electrician" }), metric("quantity", { n: 20, unit: "kilometers" })],
        }),
        entry("d2", "2026-09-09", {
          metrics: [metric("work_direction", { t: "driver" }), metric("quantity", { n: 50, unit: "kilometers" })],
        }),
        entry("n1", "2026-09-08", { metrics: [metric("quantity", { n: 7, unit: "kilometers" })] }),
      ],
    });
    expect(wi.outputs).toEqual([
      { unit: "kilometers", activity: "driver", value: 350, entries: 2 },
      { unit: "kilometers", activity: null, value: 7, entries: 1 },
      { unit: "kilometers", activity: "electrician", value: 20, entries: 1 },
    ]);
    expect(wi.outputs.some((o) => o.value === 320 || o.value === 377)).toBe(false);
  });

  it("F10 · an entry without a stated work day is placed by its UTC save day and COUNTED as placed, not silently a fact", () => {
    const late: WorkIntelligenceEntry = {
      ...entry("late", "2026-09-10", { hours: 3 }),
      // no work_date row at all — only the duration
      metrics: [metric("quantity", { n: 3, unit: "hours" })],
      createdAt: "2026-09-10T22:30:00Z",
    };
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [entry("stated", "2026-09-10", { hours: 5 }), late],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(8);
    expect(all.entries).toBe(2);
    expect(all.entriesDayInferred).toBe(1);
    // a stated day is never "inferred", whatever the save time
    const onlyStated = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [{ ...entry("s", "2026-09-10", { hours: 5 }), createdAt: "2026-09-09T23:59:00Z" }],
    });
    expect(onlyStated.periods.find((p) => p.key === "all")!.entriesDayInferred).toBe(0);
  });

  it("F11 · two skill rows for one slug are ONE skill: strongest real tier, listed once, and a link to either id never demotes the entry to shared", () => {
    const twoRows: WorkIntelligenceSkillRow[] = [
      { skillId: "s-tiling-2", slug: "tiling", verified: false, source: "self_declared" },
      { skillId: "s-tiling", slug: "tiling", verified: true, source: "manager_confirmed" },
      { skillId: "s-plaster", slug: "plastering", verified: false, source: "work_journal" },
    ];
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: twoRows,
      entries: [
        entry("a", "2026-09-10", { hours: 8, linkedSkillIds: ["s-tiling", "s-tiling-2"], reviewResult: "approved" }),
        entry("b", "2026-09-09", { hours: 4, linkedSkillIds: ["s-tiling-2"] }),
      ],
    });
    const tiling = wi.skills.filter((s) => s.slug === "tiling");
    expect(tiling).toHaveLength(1);
    expect(tiling[0]!.tier).toBe("manager_confirmed");
    expect(tiling[0]!.attributedHours).toBe(12);
    expect(tiling[0]!.confirmedHours).toBe(8);
    expect(tiling[0]!.sharedHours).toBe(0);
    expect(tiling[0]!.entries).toBe(2);
    expect(wi.sharedHours).toBe(0);
    expect(wi.sharedEntries).toBe(0);
    expect(wi.skills).toHaveLength(2);
    // independent of the order the rows arrive in
    const reversed = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: [...twoRows].reverse(),
      entries: [
        entry("a", "2026-09-10", { hours: 8, linkedSkillIds: ["s-tiling-2", "s-tiling"], reviewResult: "approved" }),
        entry("b", "2026-09-09", { hours: 4, linkedSkillIds: ["s-tiling-2"] }),
      ],
    });
    expect(reversed.skills).toEqual(wi.skills);
    expect(attributedHoursBySlug(reversed).get("tiling")).toBe(12);
  });

  it("F12 · confirmed hours travel with attributed hours per slug — present at 0, never missing, never a hover-only qualifier", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: SKILLS,
      entries: [
        entry("a", "2026-09-10", { hours: 8, linkedSkillIds: ["s-tiling"], reviewResult: "approved" }),
        entry("b", "2026-09-09", { hours: 4, linkedSkillIds: ["s-tiling"] }),
        entry("c", "2026-09-08", { hours: 2, linkedSkillIds: ["s-plaster"] }),
      ],
    });
    expect([...attributedHoursBySlug(wi)]).toEqual([["tiling", 12], ["plastering", 2]]);
    expect([...confirmedHoursBySlug(wi)]).toEqual([["tiling", 8], ["plastering", 0]]);
    // the same slugs on both maps — a chip can always state its base
    expect([...confirmedHoursBySlug(wi).keys()]).toEqual([...attributedHoursBySlug(wi).keys()]);
  });
});
