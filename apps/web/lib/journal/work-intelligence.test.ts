import { describe, expect, it } from "vitest";

import {
  attributedHoursBySlug,
  deriveWorkIntelligence,
  evidencedSkillSlugs,
  workPeriodBounds,
  type WorkIntelligenceEntry,
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
  o: Partial<WorkIntelligenceEntry> & { hours?: number; frags?: [number, string | null][] } = {},
): WorkIntelligenceEntry => {
  const metrics = [metric("work_date", { t: day })];
  if (o.hours !== undefined) metrics.push(metric("quantity", { n: o.hours, unit: "hours" }));
  (o.frags ?? []).forEach(([h, activity], i) => {
    metrics.push(metric("parsed_fragment", { t: `${i + 1}|phrase ${i + 1}` }));
    metrics.push(metric("fragment_time", { n: h, unit: "hours", t: String(i + 1) }));
    if (activity) metrics.push(metric("fragment_activity", { t: `${i + 1}|${activity}` }));
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
    expect(all.daysWorked).toBe(0);
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
    expect(wi.activities).toEqual([
      { key: "tiler", hours: 3, entries: 1, contexts: 1, lastWorkedDay: "2026-08-01", trend: "down" },
      { key: "painter", hours: 2, entries: 1, contexts: 1, lastWorkedDay: "2026-07-15", trend: "down" },
      { key: "plasterer", hours: 1, entries: 1, contexts: 1, lastWorkedDay: "2026-08-01", trend: "down" },
    ]);
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
      { unit: "square_meters", value: 40, entries: 2 },
      { unit: "pieces", value: 5, entries: 1 },
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

  it("produces no person-level score, rating, rank or tier", () => {
    const wi = deriveWorkIntelligence({ todayIso: TODAY, skills: SKILLS, entries });
    const keys = JSON.stringify(Object.keys(wi));
    expect(keys).not.toMatch(/score|rating|rank/i);
  });
});
