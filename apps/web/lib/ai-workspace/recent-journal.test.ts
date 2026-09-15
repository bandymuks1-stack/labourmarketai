import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deriveWorkIntelligence,
  type WorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkPeriodKey,
  type WorkRange,
} from "@/lib/journal/work-intelligence";

/**
 * "Kiek dirbau?" / "kiek dirbau vakar?" / "kiek dirbau šiandien?" —
 * BEHAVIOUR tests of `runRecentJournal` (issue #1689, lane B: ONE time
 * scope).
 *
 * NEGATIVE CONTROL. On the pre-change tree the recent default and
 * "yesterday" were summed from the PLANNING strip's "<value>|<unit>"
 * duration labels (`parseDurationLabel`), a second arithmetic beside the
 * model the section renders. The planning fixture below deliberately
 * carries labels that DISAGREE with the model (9 h where the model says
 * 6 h); the old code answered 9 — these tests assert the model's figure,
 * the model's confirmed split, and the `focusRange` handed to the reader,
 * none of which existed before.
 *
 * i18n is stubbed as `key(values)` so a test sees WHICH key was chosen and
 * WITH WHICH figures.
 */

const wiMock = vi.fn();
const planningMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "lt"),
  getTranslations: vi.fn(async (ns: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}(${JSON.stringify(values)})` : `${ns}.${key}`;
    (t as unknown as { has: (k: string) => boolean }).has = () => false;
    return t;
  }),
}));

vi.mock("@/lib/journal/work-intelligence-read", () => ({
  loadOwnWorkIntelligence: (...a: unknown[]) => wiMock(...a),
  loadOwnPrimaryProfessionSlug: async () => null,
}));

vi.mock("@/lib/planning/planning", () => ({
  getPlanning: (...a: unknown[]) => planningMock(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

vi.mock("@/lib/marketplace/worker-opportunities", () => ({
  loadWorkerOpportunityBoard: async () => {
    throw new Error("board not read");
  },
}));

const { runRecentJournal } = await import("./workflows");

const TODAY = "2026-09-11";
const YESTERDAY = "2026-09-10";

function entry(
  id: string,
  day: string,
  hours: number,
  reviewResult: WorkIntelligenceEntry["reviewResult"] = "submitted",
): WorkIntelligenceEntry {
  return {
    entryId: id,
    createdAt: `${day}T18:00:00.000Z`,
    originalText: `entry ${id}`,
    metrics: [
      { metric_slug: "work_date", value_text: day, value_numeric: null, unit_slug: null },
      { metric_slug: "quantity", value_text: null, value_numeric: hours, unit_slug: "hours", source: "worker_input" },
    ],
    engagementContextId: null,
    reviewResult,
    linkedSkillIds: [],
  };
}

/** Yesterday 6 h approved, today 4 h, five days ago 3 h, forty days ago 8 h. */
function model(opts: { focus?: WorkPeriodKey; focusRange?: WorkRange | null; truncated?: boolean } = {}): WorkIntelligence {
  return deriveWorkIntelligence({
    todayIso: TODAY,
    focus: opts.focus,
    focusRange: opts.focusRange,
    coverage: opts.truncated ? { entriesRead: 4, truncated: true } : undefined,
    skills: [],
    organizationRecords: [
      { id: "o1", workDate: YESTERDAY, hours: 2, source: "manual", status: "recorded", organizationId: "org-1", journalEntryId: null },
    ],
    entries: [
      entry("y", YESTERDAY, 6, "approved"),
      entry("t", TODAY, 4),
      entry("w", "2026-09-06", 3),
      entry("old", "2026-08-02", 8),
    ],
  });
}

/** The planning strip's lines — its duration labels DISAGREE with the model on purpose. */
const PLANNING_ITEMS = [
  { id: "journal:y", sourceType: "journal", startDate: YESTERDAY, label: "Plytelės", duration: "9|hours" },
  { id: "journal:t", sourceType: "journal", startDate: TODAY, label: "Glaistas", duration: "9|hours" },
  { id: "journal:w", sourceType: "journal", startDate: "2026-09-06", label: "Dažymas", duration: "9|hours" },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
  wiMock.mockReset();
  planningMock.mockReset();
  planningMock.mockResolvedValue({ status: "ok", items: PLANNING_ITEMS });
  wiMock.mockImplementation(async (opts?: { focus?: WorkPeriodKey; focusRange?: WorkRange | null }) =>
    model({ focus: opts?.focus, focusRange: opts?.focusRange }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runRecentJournal — the recent window is a `focusRange` of the ONE model", () => {
  it("no period word: the last 14 days are asked of the model as a range and answered from its `range` row (pre-change: 27 h from planning labels)", async () => {
    const r = await runRecentJournal("Parodyk mano žurnalą");
    expect(wiMock).toHaveBeenCalledWith({
      focus: "all",
      focusRange: { startIso: "2026-08-29", endIso: TODAY },
    });
    expect(r.kind).toBe("answer");
    const text = r.kind === "answer" ? r.text : "";
    // 6 + 4 + 3 = 13 h, 6 h confirmed, 3 entries — the model's row, not 27 h of planning labels
    expect(text).toContain('workspace.ai.journalHoursWindow({"days":14,"hours":"13","confirmed":"6","entries":3})');
    expect(text).not.toContain('"hours":"27"');
    // the entry lines still come from planning, capped
    expect(text).toContain("workspace.ai.journalIntro(");
    expect(text).toContain('workspace.ai.journalLine({"day":"09-10","what":"Plytelės"})');
    // the organization ledger is the model's row for the SAME window, named by it
    expect(text).toContain("workspace.ai.journalOrgRecords(");
    expect(text).toContain('workspace.ai.journalPeriod_range({\\"days\\":14})');
    expect(text).toContain('"hours":"2"');
    // the answer names its window
    expect(r.kind === "answer" ? r.explanation.why : "").toBe('workspace.ai.whyJournalWindow({"days":14})');
  });

  it("'vakar' is a single-day range: the model's row, confirmed hours told apart, the day named (pre-change: summed 'the recent way')", async () => {
    const r = await runRecentJournal("Kiek valandų dirbau vakar?");
    expect(wiMock).toHaveBeenCalledWith({
      focus: "all",
      focusRange: { startIso: YESTERDAY, endIso: YESTERDAY },
    });
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain(
      'workspace.ai.journalHoursPeriod({"period":"workspace.ai.journalPeriod_yesterday","hours":"6","confirmed":"6","entries":1})',
    );
    expect(text).not.toContain('"hours":"9"');
    // only yesterday's line is listed
    expect(text).toContain('"day":"09-10"');
    expect(text).not.toContain('"day":"09-11"');
  });

  it("a named tab stays the tab's own row — no range is passed", async () => {
    const r = await runRecentJournal("Kiek valandų dirbau šiandien?");
    expect(wiMock).toHaveBeenCalledWith({ focus: "today" });
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain(
      'workspace.ai.journalHoursPeriod({"period":"workspace.ai.journalPeriod_today","hours":"4","confirmed":"0","entries":1})',
    );
  });

  it("a model built over a capped read says how many entries it rests on (SEP-7)", async () => {
    wiMock.mockImplementation(async (opts?: { focus?: WorkPeriodKey; focusRange?: WorkRange | null }) =>
      model({ focus: opts?.focus, focusRange: opts?.focusRange, truncated: true }),
    );
    const r = await runRecentJournal("Kiek dirbau vakar?");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain('workspace.ai.journalCoverageTruncated({"count":4})');
  });

  it("an unreadable model is said as UNKNOWN — the figure is never re-derived from the planning lines", async () => {
    wiMock.mockResolvedValue(null);
    const r = await runRecentJournal("Kiek dirbau?");
    const text = r.kind === "answer" ? r.text : "";
    expect(text).toContain("workspace.ai.wiUnread");
    expect(text).not.toContain("journalHoursWindow");
    expect(text).not.toContain('"hours":"27"');
    // the lines are still listed — they are facts of the strip, not a figure
    expect(text).toContain("workspace.ai.journalLine(");
  });

  it("nothing in the window: the empty answer names the window", async () => {
    planningMock.mockResolvedValue({ status: "ok", items: [] });
    wiMock.mockImplementation(async (opts?: { focus?: WorkPeriodKey; focusRange?: WorkRange | null }) =>
      deriveWorkIntelligence({ todayIso: TODAY, skills: [], entries: [], focus: opts?.focus, focusRange: opts?.focusRange }),
    );
    const r = await runRecentJournal("Kiek dirbau vakar?");
    expect(r.kind === "answer" ? r.text : "").toBe(
      'workspace.ai.journalEmptyPeriod({"period":"workspace.ai.journalPeriod_yesterday"})',
    );
  });
});
