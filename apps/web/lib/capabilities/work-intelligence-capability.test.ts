import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deriveWorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkPeriodKey,
} from "@/lib/journal/work-intelligence";
import type { CapabilityCaller } from "./contract";

/**
 * `journal.work_intelligence.get` (issue #1689, lane B) — the section's own
 * figures for an authorized assistant, over the ONE reader.
 *
 * NEGATIVE CONTROL. On the pre-change tree the capability does not exist:
 * `runCapability("journal.work_intelligence.get", …)` answers
 * `unknown_capability` and every test below fails on that.
 */

vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

// The reader has its own suites (paging, coverage, RLS scope); here it is a
// spy over the REAL model, so what is asserted is the capability's mapping:
// which reader call it makes, which fields it exposes and which it withholds.
const loadMock = vi.fn();
vi.mock("@/lib/journal/work-intelligence-read", () => ({
  loadWorkIntelligence: (...a: unknown[]) => loadMock(...a),
}));

const { exposedCapabilities, runCapability } = await import("./registry");

beforeEach(() => {
  loadMock.mockReset();
});

type TableScript = Record<string, { data: unknown; error: { message: string } | null }>;

function caller(script: TableScript): CapabilityCaller {
  return {
    userId: "00000000-0000-4000-8000-0000000000aa",
    transport: "bearer",
    locale: "lt",
    supabase: {
      from(table: string) {
        const outcome = script[table] ?? { data: null, error: { message: `unscripted ${table}` } };
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => outcome,
          then: (resolve: (v: unknown) => unknown) => resolve(outcome),
        };
        return chain;
      },
    } as unknown as CapabilityCaller["supabase"],
  };
}

const WORKER = { workers: { data: { id: "worker-1" }, error: null } };
const TODAY = "2026-09-11";

function entry(id: string, day: string, hours: number, linked: string[], ctx: string | null, approved = false): WorkIntelligenceEntry {
  return {
    entryId: id,
    createdAt: `${day}T18:00:00.000Z`,
    originalText: id,
    metrics: [
      { metric_slug: "work_date", value_text: day, value_numeric: null, unit_slug: null },
      { metric_slug: "quantity", value_text: null, value_numeric: hours, unit_slug: "hours", source: "worker_input" },
      { metric_slug: "work_direction", value_text: "tiler", value_numeric: null, unit_slug: null },
    ],
    engagementContextId: ctx,
    reviewResult: approved ? "approved" : "submitted",
    linkedSkillIds: linked,
  };
}

function model(focus: WorkPeriodKey = "all") {
  return deriveWorkIntelligence({
    todayIso: TODAY,
    focus,
    coverage: { entriesRead: 3, truncated: true },
    skills: [{ skillId: "s-tiling", slug: "tiling", verified: true, source: "manager_confirmed" }],
    organizationRecords: [
      { id: "o1", workDate: "2026-09-10", hours: 8, source: "import", status: "recorded", organizationId: "org-1", journalEntryId: null },
    ],
    entries: [
      entry("a", "2026-09-10", 6, ["s-tiling"], "ctx-1", true),
      entry("b", "2026-09-03", 4, ["s-tiling"], "ctx-2"),
      entry("c", "2026-08-01", 8, [], null),
    ],
  });
}

describe("journal.work_intelligence.get", () => {
  it("is an exposed, read-only capability with the section's own period input", () => {
    const c = exposedCapabilities().find((x) => x.id === "journal.work_intelligence.get")!;
    expect(c).toBeTruthy();
    expect(c.kind).toBe("read");
    expect(c.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(c.inputSchema.safeParse({}).success).toBe(true);
    expect(c.inputSchema.safeParse({ period: "week" }).success).toBe(true);
    expect(c.inputSchema.safeParse({ period: "yesterday" }).success).toBe(false);
    expect(c.inputSchema.safeParse({ range: "x" }).success).toBe(false);
  });

  it("returns the model's periods, skills, activities and coverage through the ONE reader, scoped to the caller's own worker", async () => {
    loadMock.mockImplementation(async (_c: unknown, _w: string, opts: { focus: WorkPeriodKey }) => model(opts.focus));
    const r = await runCapability("journal.work_intelligence.get", caller(WORKER), {});
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock.mock.calls[0]![1]).toBe("worker-1");
    expect(loadMock.mock.calls[0]![2]).toEqual({ focus: "all" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = r.data as {
      workerId: string;
      scope: string;
      periods: { key: string; hours: number; confirmedHours: number; entries: number; daysWorked: number; startIso: string | null; endIso: string }[];
      skills: Record<string, unknown>[];
      activities: Record<string, unknown>[];
      coverage: Record<string, unknown>;
    };
    expect(data.workerId).toBe("worker-1");
    expect(data.scope).toBe("all");
    expect(data.periods.map((p) => p.key)).toEqual(["today", "week", "month", "year", "all"]);
    expect(data.periods.find((p) => p.key === "all")).toEqual({
      key: "all",
      startIso: null,
      endIso: TODAY,
      hours: 18,
      confirmedHours: 6,
      dayUnits: 0,
      entries: 3,
      daysWorked: 3,
    });
    expect(data.skills).toEqual([
      {
        slug: "tiling",
        attributedHours: 10,
        confirmedHours: 6,
        sharedHours: 0,
        share: 1,
        entries: 2,
        days: 2,
        contexts: 2,
        firstWorkedDay: "2026-09-03",
        lastWorkedDay: "2026-09-10",
        trend: "new",
      },
    ]);
    // trend "up": 10 h in the last 30 days against the unlinked 8 h in the 30 before
    expect(data.activities).toEqual([
      { key: "tiler", hours: 18, share: 1, entries: 3, lastWorkedDay: "2026-09-10", trend: "up" },
    ]);
    // a capped read is said, never a total posing as complete
    expect(data.coverage).toEqual({ entriesRead: 3, truncated: true, linksTruncated: false });
  });

  it("`period` scopes the skill and activity sections and `scope` names it", async () => {
    loadMock.mockImplementation(async (_c: unknown, _w: string, opts: { focus: WorkPeriodKey }) => model(opts.focus));
    const r = await runCapability("journal.work_intelligence.get", caller(WORKER), { period: "week" });
    expect(loadMock.mock.calls[0]![2]).toEqual({ focus: "week" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = r.data as { scope: string; skills: { attributedHours: number }[]; activities: { hours: number }[] };
    expect(data.scope).toBe("week");
    // within 7 days only entry "a": 6 h
    expect(data.skills[0]!.attributedHours).toBe(6);
    expect(data.activities[0]!.hours).toBe(6);
  });

  it("exposes nothing that is another party's record: no organization ledger, no context ids, no checks, no skill ids", async () => {
    loadMock.mockImplementation(async () => model());
    const r = await runCapability("journal.work_intelligence.get", caller(WORKER), {});
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r.ok ? r.data : null);
    for (const forbidden of ["organizationRecords", "contextIds", "engagementContextId", "checks", "skillId", "org-1", "ctx-1"]) {
      expect(json, forbidden).not.toContain(forbidden);
    }
  });

  it("no worker profile is an honest no_worker_profile; a failed worker read is unavailable", async () => {
    expect(
      await runCapability("journal.work_intelligence.get", caller({ workers: { data: null, error: null } }), {}),
    ).toMatchObject({ ok: false, code: "no_worker_profile" });
    expect(
      await runCapability("journal.work_intelligence.get", caller({ workers: { data: null, error: { message: "boom" } } }), {}),
    ).toMatchObject({ ok: false, code: "unavailable" });
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("an unreadable model is 'unavailable', never an empty model that reads as no work (SEP-7)", async () => {
    loadMock.mockResolvedValue(null);
    const r = await runCapability("journal.work_intelligence.get", caller(WORKER), {});
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("an invalid period is refused at the schema, before any read", async () => {
    loadMock.mockReset();
    const r = await runCapability("journal.work_intelligence.get", caller(WORKER), { period: "decade" });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(loadMock).not.toHaveBeenCalled();
  });
});
