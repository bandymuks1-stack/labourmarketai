import { describe, expect, it } from "vitest";

import { deriveGrowthReading } from "@/lib/journal/growth-reading";
import {
  deriveWorkIntelligence,
  type WorkIntelligenceEntry,
} from "@/lib/journal/work-intelligence";
import type { OpportunitiesResultView } from "@/lib/marketplace/worker-opportunities-contract";
import { deriveWorkCardState, type WorkCardSignals } from "@/lib/worker/work-card-state";

import {
  MAX_OPEN_ITEMS,
  WORK_CARD_EDITOR_HREF,
  deriveTodayGrowth,
  deriveTodayModel,
  deriveTodayNext,
  deriveTodayOpenItems,
  deriveTodayOpportunity,
  deriveTodayState,
  deriveTodayWork,
} from "./today-model";

/**
 * ŠIANDIEN composition model — behaviour over the REAL readers' models
 * (`deriveWorkIntelligence`, `deriveGrowthReading`, `deriveWorkCardState`),
 * never over hand-made figures. The two rules the screen exists to keep:
 * every figure is a reader's figure, and UNKNOWN is never rendered as ZERO.
 */

const TODAY = "2026-09-13";

type Row = { metric_slug: string; value_text: string | null; value_numeric: number | null; unit_slug: string | null };
const hours = (h: number): Row => ({ metric_slug: "quantity", value_text: null, value_numeric: h, unit_slug: "hours" });
const workDate = (iso: string): Row => ({ metric_slug: "work_date", value_text: iso, value_numeric: null, unit_slug: null });

function entry(
  id: string,
  day: string,
  h: number | null,
  linked: string[] = ["s-tile"],
): WorkIntelligenceEntry {
  const metrics: Row[] = h === null ? [workDate(day)] : [workDate(day), hours(h)];
  return {
    entryId: id,
    createdAt: `${day}T09:00:00.000Z`,
    originalText: "klijavau plyteles",
    metrics: metrics.map((m) => ({ ...m, created_at: `${day}T09:00:00.000Z` })),
    engagementContextId: "ctx-a",
    reviewResult: "submitted",
    linkedSkillIds: linked,
  };
}

/** An entry whose ONE timed fragment carries a kind-of-work label — the
 *  model then has nothing unlabelled to report about it. */
function labelled(id: string, day: string, h: number): WorkIntelligenceEntry {
  const at = `${day}T09:00:00.000Z`;
  const m = (metric_slug: string, value_text: string | null, value_numeric: number | null, unit_slug: string | null) =>
    ({ metric_slug, value_text, value_numeric, unit_slug, created_at: at });
  return {
    ...entry(id, day, null),
    metrics: [
      m("work_date", day, null, null),
      m("parsed_fragment", "1|klijavau plyteles", null, null),
      m("fragment_time", "1", h, "hours"),
      m("fragment_activity", "1|tiling", null, null),
    ],
  };
}

const SKILLS = [
  { skillId: "s-tile", slug: "tiling", verified: true, source: null },
  { skillId: "s-screed", slug: "floor-screeding", verified: false, source: null },
];

const SIGNALS: WorkCardSignals = {
  hasProfession: true,
  skillsCount: 2,
  availabilitySet: false,
  locationSet: false,
  paySet: false,
  evidenceCount: 3,
  confirmedAtMs: null,
};

describe("UNKNOWN ≠ ZERO — a reader that answered null is never a figure", () => {
  // NEGATIVE CONTROL for the rule the owner walk found broken elsewhere: a
  // failed journal read must not become "0 h today". Each block below says
  // `unknown`; none carries a number.
  it("a null work intelligence yields unknown state, work and open items", () => {
    expect(deriveTodayState(null)).toEqual({ kind: "unknown" });
    expect(deriveTodayWork(null)).toEqual({ kind: "unknown" });
    expect(deriveTodayOpenItems(null)).toEqual({ kind: "unknown" });
    expect(JSON.stringify(deriveTodayWork(null))).not.toMatch(/hours|entries/);
  });

  it("a null growth reading and a null opportunities read are unknown, not empty", () => {
    expect(deriveTodayGrowth(null)).toEqual({ kind: "unknown" });
    expect(deriveTodayOpportunity(null)).toEqual({ kind: "unknown" });
  });

  it("a null work card yields no next action rather than an invented one", () => {
    expect(deriveTodayNext(null)).toEqual({ kind: "unknown" });
  });

  it("an EMPTY journal (read, nothing recorded) is 'nothing', distinct from unknown", () => {
    const wi = deriveWorkIntelligence({ entries: [], skills: SKILLS, todayIso: TODAY, focus: "today" });
    expect(deriveTodayState(wi)).toEqual({ kind: "nothing" });
    const work = deriveTodayWork(wi);
    expect(work.kind).toBe("known");
    if (work.kind === "known") expect(work.today).toEqual({ hours: 0, entries: 0, untimed: 0 });
  });
});

describe("today and this week are the model's own period figures", () => {
  const wi = deriveWorkIntelligence({
    entries: [
      entry("e1", TODAY, 4),
      entry("e2", TODAY, null), // counted, not timed
      entry("e3", "2026-09-10", 6),
      entry("e4", "2026-08-01", 8), // outside the week
    ],
    skills: SKILLS,
    todayIso: TODAY,
    focus: "today",
  });

  it("header state carries today's entries and hours", () => {
    expect(deriveTodayState(wi)).toEqual({ kind: "recorded", entries: 2, hours: 4 });
  });

  it("work figures are lifted from periods.today / periods.week verbatim", () => {
    const today = wi.periods.find((p) => p.key === "today")!;
    const week = wi.periods.find((p) => p.key === "week")!;
    const work = deriveTodayWork(wi);
    expect(work).toEqual({
      kind: "known",
      today: { hours: today.hours, entries: today.entries, untimed: today.entriesWithoutDuration },
      week: { hours: week.hours, entries: week.entries, untimed: week.entriesWithoutDuration },
      truncated: false,
    });
    expect(week.entries).toBe(3);
    expect(week.hours).toBe(10);
  });

  it("a truncated read is named, never posed as a total", () => {
    const capped = deriveWorkIntelligence({
      entries: [entry("e1", TODAY, 4)],
      skills: SKILLS,
      todayIso: TODAY,
      coverage: { entriesRead: 1, truncated: true, linksTruncated: false },
    });
    const work = deriveTodayWork(capped);
    expect(work.kind === "known" && work.truncated).toBe(true);
  });
});

describe("open items — what still needs a figure, a name or a look", () => {
  it("lists the week's untimed entries first, then the unlabelled ones, then unexplained checks", () => {
    const wi = deriveWorkIntelligence({
      entries: [
        entry("e1", TODAY, null),
        entry("e2", TODAY, 30), // day over 24h → a plausibility check
        { ...entry("e3", TODAY, 2, []), originalText: "" }, // no work named
      ],
      skills: SKILLS,
      todayIso: TODAY,
      focus: "today",
    });
    const open = deriveTodayOpenItems(wi);
    expect(open.kind).toBe("known");
    if (open.kind !== "known") return;
    // e1 owes a figure; e2 and e3 carry hours with no kind of work named;
    // the 30 h day is a plausibility check nobody has explained.
    expect(open.items.map((i) => i.kind)).toEqual(["untimed", "unlabelled", "check"]);
    expect(open.items[0]).toEqual({ kind: "untimed", entries: 1 });
    expect(open.items[1]).toEqual({ kind: "unlabelled", entries: 2 });
    expect(open.items.length).toBeLessThanOrEqual(MAX_OPEN_ITEMS);
    // The check is the model's own object, untouched.
    const check = open.items.find((i) => i.kind === "check");
    expect(check && check.kind === "check" && wi.checks.includes(check.check)).toBe(true);
  });

  it("an acknowledged check is not an open item", () => {
    const wi = deriveWorkIntelligence({
      entries: [entry("e2", TODAY, 30)],
      skills: SKILLS,
      todayIso: TODAY,
      focus: "today",
    });
    const acked = {
      ...wi,
      checks: wi.checks.map((c) => ({ ...c, acknowledged: { reason: "dvi pamainos", entryId: "e2" } })),
    };
    const open = deriveTodayOpenItems(acked);
    expect(open.kind === "known" && open.items.filter((i) => i.kind === "check")).toEqual([]);
  });

  it("a clean week has no open items — an empty list, not an unknown", () => {
    const wi = deriveWorkIntelligence({ entries: [labelled("e1", TODAY, 4)], skills: SKILLS, todayIso: TODAY, focus: "today" });
    expect(deriveTodayOpenItems(wi)).toEqual({ kind: "known", items: [] });
  });
});

describe("the one next action is the work-card engine's, with a real route", () => {
  it("an inline dimension opens the editor's canonical home, not a null href", () => {
    const card = deriveWorkCardState(SIGNALS, Date.parse(`${TODAY}T12:00:00Z`));
    expect(card.next.dim).toBe("availability");
    expect(card.next.href).toBeNull();
    const next = deriveTodayNext(card);
    expect(next).toEqual({
      kind: "action",
      dim: "availability",
      href: WORK_CARD_EDITOR_HREF,
      whyKey: "why.availability",
      stale: false,
    });
  });

  it("a routed dimension keeps the engine's own route and why", () => {
    const card = deriveWorkCardState({ ...SIGNALS, hasProfession: false }, 0);
    const next = deriveTodayNext(card);
    expect(next.kind === "action" && next.href).toBe("/dashboard/profile");
    expect(next.kind === "action" && next.whyKey).toBe("why.work");
  });

  it("a stale card is flagged as stale — a calm confirm, not a restart", () => {
    const confirmedLongAgo = Date.parse("2026-01-01T00:00:00Z");
    const card = deriveWorkCardState(
      { ...SIGNALS, availabilitySet: true, locationSet: true, paySet: true, confirmedAtMs: confirmedLongAgo },
      Date.parse(`${TODAY}T12:00:00Z`),
    );
    expect(card.state).toBe("stale");
    expect(deriveTodayNext(card)).toMatchObject({ kind: "action", stale: true });
  });
});

describe("one growth sentence — the reading's first direction, with its why", () => {
  it("carries directions[0] untouched", () => {
    const wi = deriveWorkIntelligence({
      entries: [
        entry("e1", TODAY, 4, ["s-tile"]),
        entry("e2", "2026-09-12", 4, ["s-tile"]),
        entry("e3", "2026-09-11", 4, ["s-tile"]),
        entry("e4", "2026-09-10", 1, ["s-screed"]),
      ],
      skills: SKILLS,
      todayIso: TODAY,
    });
    const growth = deriveGrowthReading(wi, { primaryProfessionSlug: null });
    const g = deriveTodayGrowth(growth);
    expect(g.kind).toBe("direction");
    if (g.kind === "direction") {
      expect(g.direction).toBe(growth.directions[0]);
      expect(g.direction.kind).toBe("core_strength");
    }
  });

  it("fewer than two evidenced skills is 'insufficient', never a guessed direction", () => {
    const wi = deriveWorkIntelligence({ entries: [entry("e1", TODAY, 4)], skills: SKILLS, todayIso: TODAY });
    const growth = deriveGrowthReading(wi, { primaryProfessionSlug: null });
    expect(deriveTodayGrowth(growth)).toEqual({ kind: "insufficient" });
  });
});

describe("one opportunity sentence — band counts over the reader's own rows", () => {
  type ReadyView = Extract<OpportunitiesResultView, { kind: "ready" }>;
  type ExternalRow = ReadyView["external"][number];
  type MatchRow = ReadyView["matches"][number];
  const external = (band: ExternalRow["band"], key: string): ExternalRow =>
    ({
      key,
      title: key,
      employerName: null,
      city: null,
      country: "LT",
      publishedAt: "2026-09-12",
      originalUrl: null,
      attributionText: "",
      fitStatus: "insufficient_data",
      band,
      gapCodes: [],
      missingDataCodes: [],
    }) as unknown as ExternalRow;

  const ready = (input: Partial<ReadyView>): OpportunitiesResultView =>
    ({
      kind: "ready",
      matches: [],
      totalRecommendable: 0,
      newCount: 0,
      seenDegraded: false,
      interestLabels: null,
      external: [],
      totalExternal: 0,
      ...input,
    }) as OpportunitiesResultView;

  it("distinguishes no-worker, unavailable and none", () => {
    expect(deriveTodayOpportunity({ kind: "no-worker" })).toEqual({ kind: "no-worker" });
    expect(deriveTodayOpportunity({ kind: "unavailable" })).toEqual({ kind: "unavailable" });
    expect(deriveTodayOpportunity(ready({}))).toEqual({ kind: "none" });
  });

  it("counts platform matches by the engine's status and external rows by their band", () => {
    const view = ready({
      matches: [
        { requestId: "r1", fitStatus: "strong" } as unknown as MatchRow,
        { requestId: "r2", fitStatus: "weak" } as unknown as MatchRow,
      ],
      totalRecommendable: 5,
      external: [external("not_assessed", "x1"), external("possible", "x2")],
      totalExternal: 2,
    });
    const o = deriveTodayOpportunity(view);
    expect(o).toEqual({
      kind: "bands",
      counts: { strong: 1, possible: 1, missing_requirement: 1, conflict: 0, not_assessed: 1 },
      more: 3,
      discoveryOnly: false,
    });
  });

  it("only unassessed external rows is DISCOVERY-ONLY — never 'jobs that fit you'", () => {
    const view = ready({
      external: [external("not_assessed", "x1"), external("missing_requirement", "x2")],
      totalExternal: 2,
    });
    const o = deriveTodayOpportunity(view);
    expect(o.kind === "bands" && o.discoveryOnly).toBe(true);
    expect(o.kind === "bands" && o.counts.strong + o.counts.possible).toBe(0);
  });
});

describe("the whole model", () => {
  it("composes every block from the readers it was given and trims the name", () => {
    const wi = deriveWorkIntelligence({ entries: [entry("e1", TODAY, 4)], skills: SKILLS, todayIso: TODAY, focus: "today" });
    const model = deriveTodayModel({
      displayName: "  Jonas  ",
      professionSlug: "tiler",
      workCard: deriveWorkCardState(SIGNALS, 0),
      workIntelligence: wi,
      growth: deriveGrowthReading(wi, { primaryProfessionSlug: "tiler" }),
      opportunities: null,
    });
    expect(model.header).toEqual({
      displayName: "Jonas",
      professionSlug: "tiler",
      state: { kind: "recorded", entries: 1, hours: 4 },
    });
    expect(model.next.kind).toBe("action");
    expect(model.work.kind).toBe("known");
    expect(model.growth).toEqual({ kind: "insufficient" });
    expect(model.opportunity).toEqual({ kind: "unknown" });
  });

  it("no block ever carries a score, rating, rank or percentage of the person", () => {
    const wi = deriveWorkIntelligence({ entries: [entry("e1", TODAY, 4)], skills: SKILLS, todayIso: TODAY });
    const model = deriveTodayModel({
      displayName: null,
      professionSlug: null,
      workCard: deriveWorkCardState(SIGNALS, 0),
      workIntelligence: wi,
      growth: deriveGrowthReading(wi, { primaryProfessionSlug: null }),
      opportunities: null,
    });
    expect(Object.keys(model).sort()).toEqual(["growth", "header", "next", "openItems", "opportunity", "work"]);
    expect(JSON.stringify(model)).not.toMatch(/score|rating|rank|tier|grade|Pct|percent/i);
  });
});
