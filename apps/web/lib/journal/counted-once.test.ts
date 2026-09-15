import { describe, expect, it } from "vitest";

import { correctedOriginalIds, countedOnce } from "./counted-once";
import { rollUpJournalWindow, type JournalWindowEntryRow } from "./journal-window-report";
import { deriveWorkIntelligence, type WorkIntelligenceEntry } from "./work-intelligence";

/**
 * Issue #1689, adversarial audit F1 (P0): a CONFIRMED entry the worker
 * corrected was counted twice everywhere the journal list core feeds — the
 * original keeps `superseded_by` NULL by design (0018) and the live filter
 * saw two live rows. Worker logs 8 h, manager approves, worker corrects to
 * 6 h → 14 h, 8 h "confirmed". The rule: the live correction replaces the
 * original it points at; the withdrawn approval is not inherited.
 */

const TODAY = "2026-09-11";

describe("countedOnce — one live row per correction chain", () => {
  it("removes the original a live correction points at, keeps everything else, keeps order", () => {
    const rows = [
      { id: "c1", correction_of: "o1" },
      { id: "o1" },
      { id: "x", correction_of: null },
    ];
    expect(countedOnce(rows).map((r) => r.id)).toEqual(["c1", "x"]);
    expect([...correctedOriginalIds(rows)]).toEqual(["o1"]);
  });

  it("a correction of a correction: the chain still counts once, by the live row", () => {
    // o1 (confirmed) ← c1 (superseded, already filtered out by the caller)
    // ← c2 carries correction_of = o1 forward (atomic-supersede rule).
    const rows = [{ id: "c2", correction_of: "o1" }, { id: "o1" }];
    expect(countedOnce(rows).map((r) => r.id)).toEqual(["c2"]);
  });

  it("rows without the column pass through untouched (legacy projection)", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(countedOnce(rows)).toEqual(rows);
  });

  it("a dangling correction_of (original deleted or not returned) removes nothing", () => {
    const rows = [{ id: "c1", correction_of: "gone" }, { id: "b" }];
    expect(countedOnce(rows).map((r) => r.id)).toEqual(["c1", "b"]);
  });
});

const metric = (slug: string, v: { n?: number; t?: string; unit?: string }) => ({
  metric_slug: slug,
  value_numeric: v.n ?? null,
  value_text: v.t ?? null,
  unit_slug: v.unit ?? null,
  source: "worker_input",
});

const wiEntry = (
  id: string,
  hours: number,
  reviewResult: WorkIntelligenceEntry["reviewResult"],
): WorkIntelligenceEntry => ({
  entryId: id,
  createdAt: "2026-09-10T18:00:00Z",
  originalText: id,
  metrics: [metric("work_date", { t: "2026-09-10" }), metric("quantity", { n: hours, unit: "hours" })],
  engagementContextId: "ctx-a",
  reviewResult,
  linkedSkillIds: [],
});

describe("the audit's scenario through the work-intelligence model", () => {
  const original = { id: "o1", correction_of: null, entry: wiEntry("o1", 8, "approved") };
  const correction = { id: "c1", correction_of: "o1", entry: wiEntry("c1", 6, "submitted") };

  it("before the rule: 14 h with 8 h confirmed — the defect", () => {
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: [],
      entries: [original.entry, correction.entry],
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(14);
    expect(all.confirmedHours).toBe(8);
  });

  it("with the rule: 6 h once, and nothing confirmed until the correction is reviewed", () => {
    const rows = countedOnce([correction, original]);
    const wi = deriveWorkIntelligence({
      todayIso: TODAY,
      skills: [],
      entries: rows.map((r) => r.entry),
    });
    const all = wi.periods.find((p) => p.key === "all")!;
    expect(all.hours).toBe(6);
    expect(all.confirmedHours).toBe(0);
    expect(all.entries).toBe(1);
  });
});

describe("the organization's window report counts a corrected day once", () => {
  const row = (
    id: string,
    hours: number,
    correctionOf: string | null,
    decisions: readonly ("approved" | "rejected" | "changes_requested")[],
  ): JournalWindowEntryRow => ({
    id,
    worker_id: "worker-a",
    created_at: "2026-09-10T08:00:00.000Z",
    correction_of: correctionOf,
    engagement_context_id: "ctx-1",
    workers: { display_name: "Ona", profiles: null },
    journal_entry_confirmations: decisions.map((decision) => ({
      confirmation_scope: { decision },
      created_at: "2026-09-10T12:00:00.000Z",
      confirmer_role: "manager",
    })),
    journal_entry_metrics: [
      { metric_slug: "fragment_time", value_text: "1", value_numeric: hours, unit_slug: "hours", source: "worker_input" },
    ],
  });

  it("8 h approved, corrected to 6 h → 1 entry, 6 h, awaiting review, 0 h confirmed", () => {
    const { workers, totals } = rollUpJournalWindow(
      [row("o1", 8, null, ["approved"]), row("c1", 6, "o1", [])],
      { workTime: true, todayIso: TODAY },
    );
    expect(workers).toHaveLength(1);
    expect(workers[0].entries).toBe(1);
    expect(workers[0].awaitingReview).toBe(1);
    expect(workers[0].confirmed).toBe(0);
    expect(workers[0].work?.hours).toBe(6);
    expect(workers[0].work?.confirmedHours).toBe(0);
    expect(totals.entries).toBe(1);
    expect(totals.work?.hours).toBe(6);
  });
});
