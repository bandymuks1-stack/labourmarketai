import { describe, expect, it } from "vitest";

import { countedOnceTotal, COUNTED_ONCE_READ_CAP } from "@/lib/journal/counted-once-count";
import { rollUpJournalWindow, type JournalWindowEntryRow } from "@/lib/journal/journal-window-report";
import {
  confirmedEntriesOf,
  countConfirmedEntries,
  isConfirmedEntry,
  type ConfirmationRow,
} from "@/lib/journal/review-status";
import { assembleWorkIntelligence } from "@/lib/journal/work-intelligence-read";
import {
  aggregateConfirmedTotals,
  aggregateConfirmedWork,
} from "@/lib/evidence/confirmed-work-read";
import {
  countedHours,
  isCountedAllocation,
  monthlyGrid,
  workerDayTotals,
} from "@/lib/work-hours/allocations-model";

/**
 * COUNTER-CANONICAL v1 - the same semantic number must not differ because
 * different pages count different rows. Every test here FAILED before the
 * change (the pre-fix behaviour is named in each title).
 */

const SUBJECT = "profile-subject";
const dec = (decision: string, by: string, at = "2026-09-10T10:00:00Z"): ConfirmationRow => ({
  confirmation_scope: { decision },
  created_at: at,
  confirmer_id: by,
});

describe("F1 - ONE definition of a confirmed entry (review-status.ts)", () => {
  it("is an approval by someone other than the subject", () => {
    expect(isConfirmedEntry([dec("approved", "manager")], SUBJECT)).toBe(true);
    // pre-fix: the profile and window report counted the subject's own approval
    expect(isConfirmedEntry([dec("approved", SUBJECT)], SUBJECT)).toBe(false);
    // pre-fix: the profile trust block counted a rejected decision row
    expect(isConfirmedEntry([dec("rejected", "manager")], SUBJECT)).toBe(false);
    expect(isConfirmedEntry([], SUBJECT)).toBe(false);
  });

  it("is latest-wins: a later rejection withdraws an approval", () => {
    expect(
      isConfirmedEntry(
        [dec("approved", "m", "2026-09-10T10:00:00Z"), dec("rejected", "m", "2026-09-11T10:00:00Z")],
        SUBJECT,
      ),
    ).toBe(false);
  });

  it("counts ENTRIES, not decision rows, and counts a correction chain once", () => {
    const rows = [
      { id: "a", journal_entry_confirmations: [dec("approved", "m1"), dec("approved", "m2")] },
      { id: "orig", journal_entry_confirmations: [dec("approved", "m1")] },
      { id: "fix", correction_of: "orig", journal_entry_confirmations: [] },
      { id: "own", journal_entry_confirmations: [dec("approved", SUBJECT)] },
    ];
    // pre-fix (row count): 4 "confirmations"
    expect(countConfirmedEntries(rows, SUBJECT)).toBe(1);
    expect(confirmedEntriesOf(rows, SUBJECT).map((r) => r.id)).toEqual(["a"]);
  });

  it("can be told which originals a live correction replaces (confirmed-only joins)", () => {
    const onlyConfirmed = [{ id: "orig", journal_entry_confirmations: [dec("approved", "m1")] }];
    expect(countConfirmedEntries(onlyConfirmed, SUBJECT)).toBe(1);
    expect(countConfirmedEntries(onlyConfirmed, SUBJECT, new Set(["orig"]))).toBe(0);
  });
});

describe("F2 - confirmed-work reads drop a corrected original", () => {
  const confirmedOrig = {
    id: "orig",
    worker_id: "w1",
    created_at: "2026-09-10T10:00:00Z",
    journal_entry_confirmations: [dec("approved", "manager")],
    journal_entry_skills: [{ skills: { slug: "tiling" } }],
  };

  it("matching/skill read: the original is replaced by its (unconfirmed) correction", () => {
    const profileIds = new Map([["w1", SUBJECT]]);
    // pre-fix: the confirmed original still counted although a live correction exists
    expect(aggregateConfirmedWork([confirmedOrig], profileIds).get("w1")?.get("tiling")?.confirmedWorkEntries).toBe(1);
    expect(aggregateConfirmedWork([confirmedOrig], profileIds, new Set(["orig"])).size).toBe(0);
  });

  it("own totals (professional history / CV): same rule", () => {
    expect(aggregateConfirmedTotals([confirmedOrig], SUBJECT).entries).toBe(1);
    expect(aggregateConfirmedTotals([confirmedOrig], SUBJECT, new Set(["orig"])).entries).toBe(0);
  });
});

describe("F2 - head counts cannot de-duplicate, so counted reads do", () => {
  it("counts a correction chain once", () => {
    expect(
      countedOnceTotal({
        data: [{ id: "orig" }, { id: "fix", correction_of: "orig" }, { id: "other" }],
        error: null,
      }),
    ).toBe(2); // pre-fix head count: 3
  });

  it("is UNKNOWN on a failed or capped read, never a total (SEP-7)", () => {
    expect(countedOnceTotal({ data: null, error: { code: "57014" } })).toBeNull();
    const capped = Array.from({ length: COUNTED_ONCE_READ_CAP }, (_, i) => ({ id: String(i) }));
    expect(countedOnceTotal({ data: capped, error: null })).toBeNull();
    expect(countedOnceTotal({ data: [], error: null })).toBe(0);
  });
});

describe("F1 - window report and work intelligence use the same definition", () => {
  const row = (id: string, by: string): JournalWindowEntryRow => ({
    id,
    worker_id: "w1",
    created_at: "2026-09-10T08:00:00Z",
    engagement_context_id: "ctx",
    workers: { display_name: "Person A", profiles: null },
    subject: { profile_id: SUBJECT },
    journal_entry_confirmations: [dec("approved", by)],
    journal_entry_metrics: [],
  });

  it("window report: the subject's own approval is not 'confirmed'", () => {
    const { totals } = rollUpJournalWindow([row("e1", "manager"), row("e2", SUBJECT)], {
      workTime: false,
      todayIso: "2026-09-11",
    });
    // pre-fix: confirmed 2
    expect(totals.confirmed).toBe(1);
    expect(totals.awaitingReview).toBe(1);
  });

  it("work intelligence: reviewResult honours the subject when it is given", () => {
    const entries = [
      {
        id: "e1",
        original_text: "x",
        created_at: "2026-09-10T08:00:00Z",
        journal_entry_metrics: [
          { metric_slug: "quantity", value_text: null, value_numeric: 8, unit_slug: "hours", source: "worker_input" },
        ],
        journal_entry_confirmations: [dec("approved", SUBJECT)],
      },
    ];
    const base = {
      entries,
      linksByEntry: new Map<string, string[]>(),
      provenanceByEntry: new Map(),
      skillRows: [],
      todayIso: "2026-09-11",
    };
    const own = assembleWorkIntelligence({ ...base, subjectProfileId: SUBJECT });
    const plain = assembleWorkIntelligence(base);
    const confirmedHours = (wi: ReturnType<typeof assembleWorkIntelligence>) =>
      wi.periods.find((p) => p.key === "all")?.confirmedHours;
    // pre-fix: 8 confirmed hours on the person's own approval of their own work
    expect(confirmedHours(own)).toBe(0);
    expect(confirmedHours(plain)).toBe(8);
  });
});

describe("F10 - rejected allocations are counted nowhere", () => {
  const rows = [
    { workerId: "w", workDate: "2026-09-10", workObjectId: "o1", hours: 8, status: "approved" },
    { workerId: "w", workDate: "2026-09-10", workObjectId: "o2", hours: 2, status: "rejected" },
  ];
  it("day totals, monthly grid and the counted sum agree with project hours", () => {
    expect(isCountedAllocation(rows[1]!)).toBe(false);
    // pre-fix: 10
    expect(workerDayTotals(rows)[0]!.hours).toBe(8);
    expect(monthlyGrid(rows).grandTotal).toBe(8);
    expect(countedHours(rows)).toBe(8);
  });
  it("rows without a status are still counted (older projections)", () => {
    expect(countedHours([{ hours: 3 }])).toBe(3);
  });
});
