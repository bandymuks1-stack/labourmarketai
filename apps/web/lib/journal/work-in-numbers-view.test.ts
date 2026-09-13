import { describe, expect, it } from "vitest";

import {
  deriveWorkIntelligence,
  type WorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkIntelligenceSkillRow,
} from "@/lib/journal/work-intelligence";

import {
  dominantAnswer,
  dominantSkill,
  focusPeriod,
  numbersState,
  orgLedger,
  scopeWords,
  shareBarWidth,
  skillRows,
  splitChecks,
} from "./work-in-numbers-view";

const TODAY = "2026-09-13";

const metric = (
  slug: string,
  v: { n?: number; t?: string; unit?: string; source?: string },
) => ({
  metric_slug: slug,
  value_numeric: v.n ?? null,
  value_text: v.t ?? null,
  unit_slug: v.unit ?? null,
  source: v.source ?? "worker_input",
  created_at: "2026-09-01T00:00:00Z",
});

const entry = (
  id: string,
  day: string,
  o: {
    hours?: number;
    output?: { n: number; unit: string };
    activity?: string;
    linked?: string[];
    approved?: boolean;
    context?: string | null;
  } = {},
): WorkIntelligenceEntry => {
  const metrics = [metric("work_date", { t: day })];
  if (o.hours !== undefined) metrics.push(metric("quantity", { n: o.hours, unit: "hours" }));
  if (o.output) metrics.push(metric("quantity", { n: o.output.n, unit: o.output.unit }));
  if (o.activity) metrics.push(metric("work_direction", { t: o.activity }));
  return {
    entryId: id,
    createdAt: `${day}T18:00:00Z`,
    originalText: `entry ${id}`,
    metrics,
    engagementContextId: o.context === undefined ? "ctx-a" : o.context,
    reviewResult: o.approved ? "approved" : "submitted",
    linkedSkillIds: o.linked ?? [],
  };
};

const SKILLS: WorkIntelligenceSkillRow[] = [
  { skillId: "s-tiling", slug: "tiling", verified: null, source: "manual" },
  { skillId: "s-plaster", slug: "plastering", verified: null, source: "manual" },
  { skillId: "s-paint", slug: "painting", verified: null, source: "manual" },
  { skillId: "s-declared", slug: "welding", verified: null, source: "manual" },
];

/** 6 h tiling (approved 6 h), 2 h plastering, one untimed painting entry,
 *  one declared-only skill. Attributed base = 8 h. */
function model(focus: "all" | "today" | "week" = "all"): WorkIntelligence {
  return deriveWorkIntelligence({
    entries: [
      entry("e1", "2026-09-10", { hours: 6, linked: ["s-tiling"], approved: true }),
      entry("e2", "2026-09-11", { hours: 2, linked: ["s-plaster"] }),
      entry("e3", "2026-09-12", { linked: ["s-paint"] }),
    ],
    skills: SKILLS,
    todayIso: TODAY,
    focus,
  });
}

describe("numbersState — UNKNOWN ≠ ZERO", () => {
  it("null (the reader failed) is unknown, never an empty model", () => {
    expect(numbersState(null)).toBe("unknown");
    expect(numbersState(undefined)).toBe("unknown");
  });
  it("a read model with no entry is no_entries; with entries it is ok", () => {
    const empty = deriveWorkIntelligence({ entries: [], skills: SKILLS, todayIso: TODAY });
    expect(numbersState(empty)).toBe("no_entries");
    expect(numbersState(model())).toBe("ok");
  });
});

describe("shareBarWidth — the bar IS the share", () => {
  it("maps a share to a whole percent", () => {
    expect(shareBarWidth(0.75)).toBe(75);
    expect(shareBarWidth(1)).toBe(100);
    expect(shareBarWidth(0.004)).toBe(0);
  });
  it("NEGATIVE CONTROL: a malformed share paints no bar and never exceeds 100", () => {
    expect(shareBarWidth(Number.NaN)).toBe(0);
    expect(shareBarWidth(-0.2)).toBe(0);
    expect(shareBarWidth(3)).toBe(100);
  });
});

describe("skillRows — one row per evidenced skill, share desc, every figure the model's", () => {
  const rows = skillRows(model(), (slug) => (slug === "painting" ? null : slug.toUpperCase()));

  it("lists evidenced skills only (declared-only welding is not a row) and sorts by share", () => {
    expect(rows.map((r) => r.slug)).toEqual(["tiling", "plastering", "painting"]);
    expect(rows[0]!.share).toBe(0.75);
    expect(rows[0]!.barWidth).toBe(75);
    expect(rows[1]!.barWidth).toBe(25);
  });

  it("carries the measured figures: hours, confirmation share, days, first/last day", () => {
    const tiling = rows[0]!;
    expect(tiling.attributedHours).toBe(6);
    expect(tiling.confirmedHours).toBe(6);
    expect(tiling.confirmationShare).toBe(1);
    expect(tiling.entries).toBe(1);
    expect(tiling.firstWorkedDay).toBe("2026-09-10");
    expect(tiling.lastWorkedDay).toBe("2026-09-10");
    expect(tiling.measured).toBe(true);
    expect(rows[1]!.confirmationShare).toBe(0);
  });

  it("NOT_MEASURED: an untimed skill is entries without hours — share 0, bar 0, confirmation share null, never 0 h", () => {
    const painting = rows[2]!;
    expect(painting.entries).toBe(1);
    expect(painting.attributedHours).toBe(0);
    expect(painting.barWidth).toBe(0);
    expect(painting.confirmationShare).toBeNull();
    expect(painting.measured).toBe(false);
    expect(painting.untimed).toBe(true);
    expect(painting.involvedOnly).toBe(false);
  });

  it("keeps a missing catalogue name as null so the caller can drop the row — never a raw slug", () => {
    expect(rows[2]!.name).toBeNull();
    expect(rows[0]!.name).toBe("TILING");
  });

  it("a shared entry is involvement on both skills, not attributed to either", () => {
    const wi = deriveWorkIntelligence({
      entries: [entry("e1", "2026-09-10", { hours: 8, linked: ["s-tiling", "s-plaster"] })],
      skills: SKILLS,
      todayIso: TODAY,
    });
    const r = skillRows(wi, (s) => s);
    expect(r).toHaveLength(2);
    for (const row of r) {
      expect(row.attributedHours).toBe(0);
      expect(row.sharedHours).toBe(8);
      expect(row.involvedOnly).toBe(true);
      expect(row.confirmationShare).toBeNull();
    }
  });

  it("attaches the outputs whose kind of work is the skill itself", () => {
    const wi = deriveWorkIntelligence({
      entries: [
        entry("e1", "2026-09-10", { output: { n: 40, unit: "square_meters" }, activity: "tiling", linked: ["s-tiling"] }),
        entry("e2", "2026-09-11", { output: { n: 12, unit: "meters" }, activity: "other_work", linked: ["s-tiling"] }),
      ],
      skills: SKILLS,
      todayIso: TODAY,
    });
    const r = skillRows(wi, (s) => s);
    expect(r[0]!.outputs).toEqual([{ unit: "square_meters", value: 40, entries: 1 }]);
  });
});

describe("dominantSkill / dominantAnswer — the first question, answered from the model", () => {
  it("names the largest attributed share", () => {
    const rows = skillRows(model(), (s) => s);
    expect(dominantSkill(rows)?.slug).toBe("tiling");
    const a = dominantAnswer(model(), rows);
    expect(a.kind).toBe("dominant");
  });
  it("NEGATIVE CONTROL: an untimed-only model has NO dominant skill — it says so instead of promoting a 0 h row", () => {
    const wi = deriveWorkIntelligence({
      entries: [entry("e3", "2026-09-12", { linked: ["s-paint"] })],
      skills: SKILLS,
      todayIso: TODAY,
    });
    const rows = skillRows(wi, (s) => s);
    expect(rows).toHaveLength(1);
    expect(dominantSkill(rows)).toBeNull();
    expect(dominantAnswer(wi, rows)).toEqual({ kind: "untimed", entries: 1 });
  });
  it("an unreadable model is unknown; an empty one is no_entries; an empty window is period_empty", () => {
    expect(dominantAnswer(null, []).kind).toBe("unknown");
    const empty = deriveWorkIntelligence({ entries: [], skills: SKILLS, todayIso: TODAY });
    expect(dominantAnswer(empty, []).kind).toBe("no_entries");
    // TODAY holds no entry: the window is empty even though all time is not
    const today = model("today");
    expect(dominantAnswer(today, skillRows(today, (s) => s)).kind).toBe("period_empty");
  });
});

describe("scope — a bounded window is named, never presented as lifetime", () => {
  it("names the tab", () => {
    expect(scopeWords(model("week"))).toEqual({ kind: "week" });
    expect(focusPeriod(model("week")).key).toBe("week");
  });
  it("names the explicit range with both days", () => {
    const wi = deriveWorkIntelligence({
      entries: [entry("e1", "2026-09-10", { hours: 6, linked: ["s-tiling"] })],
      skills: SKILLS,
      todayIso: TODAY,
      focus: "all",
      focusRange: { startIso: "2026-09-01", endIso: "2026-09-12" },
    });
    expect(scopeWords(wi)).toEqual({ kind: "range", startIso: "2026-09-01", endIso: "2026-09-12" });
    expect(focusPeriod(wi).key).toBe("range");
  });
  it("NEGATIVE CONTROL: a malformed range is refused by the model and the scope falls back to the tab, not to a guessed window", () => {
    const wi = deriveWorkIntelligence({
      entries: [entry("e1", "2026-09-10", { hours: 6, linked: ["s-tiling"] })],
      skills: SKILLS,
      todayIso: TODAY,
      focus: "month",
      focusRange: { startIso: "2026-09-30", endIso: "2026-09-01" },
    });
    expect(scopeWords(wi)).toEqual({ kind: "month" });
  });
});

describe("orgLedger — the second ledger beside the journal, never summed", () => {
  it("null records are UNKNOWN, an empty ledger is none, rows are rows for the same scope", () => {
    expect(orgLedger(model()).kind).toBe("unknown");
    const none = deriveWorkIntelligence({
      entries: [],
      skills: SKILLS,
      todayIso: TODAY,
      organizationRecords: [],
    });
    expect(orgLedger(none).kind).toBe("none");
    const withRows = deriveWorkIntelligence({
      entries: [entry("e1", "2026-09-10", { hours: 6, linked: ["s-tiling"] })],
      skills: SKILLS,
      todayIso: TODAY,
      focus: "week",
      organizationRecords: [
        { id: "a1", workDate: "2026-09-10", hours: 8, source: "manual", status: "approved", organizationId: "org", journalEntryId: null },
      ],
    });
    const l = orgLedger(withRows);
    expect(l.kind).toBe("rows");
    if (l.kind === "rows") {
      expect(l.period.key).toBe("week");
      expect(l.period.hours).toBe(8);
      // the journal figure is untouched by the ledger
      expect(focusPeriod(withRows).hours).toBe(6);
    }
  });
});

describe("splitChecks — an acknowledged check stays listed", () => {
  it("keeps both halves", () => {
    const { open, acked } = splitChecks([
      { key: "a", acknowledged: null },
      { key: "b", acknowledged: { reason: "two shifts" } },
    ]);
    expect(open.map((c) => c.key)).toEqual(["a"]);
    expect(acked.map((c) => c.key)).toEqual(["b"]);
  });
});
