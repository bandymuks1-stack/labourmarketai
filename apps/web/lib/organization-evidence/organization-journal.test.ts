import { describe, expect, it } from "vitest";

import {
  summarizeOrganizationJournal,
  type OrganizationJournalRow,
} from "./organization-journal";

type Metric = NonNullable<OrganizationJournalRow["journal_entry_metrics"]>[number];

const hours = (index: number, h: number): Metric => ({
  metric_slug: "fragment_time",
  value_text: String(index),
  value_numeric: h,
  unit_slug: "hours",
  source: "worker_input",
});

function row(
  id: string,
  worker: string | null,
  createdAt: string,
  metrics: Metric[],
  opts: {
    readonly decisions?: readonly { decision: string; by?: string }[];
    readonly correctionOf?: string;
    readonly subjectProfile?: string;
  } = {},
): OrganizationJournalRow {
  return {
    id,
    worker_id: worker,
    created_at: createdAt,
    correction_of: opts.correctionOf ?? null,
    engagement_context_id: "ctx-1",
    subject: { profile_id: opts.subjectProfile ?? `profile-${worker}` },
    journal_entry_confirmations: (opts.decisions ?? []).map((d, i) => ({
      confirmation_scope: { decision: d.decision },
      created_at: `2026-09-1${i}T12:00:00.000Z`,
      confirmer_role: "manager",
      confirmer_id: d.by ?? "reviewer-1",
    })),
    journal_entry_metrics: metrics,
  };
}

const TODAY = "2026-11-14";

describe("the organization's recorded journal work", () => {
  it("adds up every person's hours and counts the people once", () => {
    const s = summarizeOrganizationJournal(
      [
        row("a1", "w1", "2026-09-01T08:00:00Z", [hours(1, 8)]),
        row("a2", "w1", "2026-09-02T08:00:00Z", [hours(1, 6)]),
        row("b1", "w2", "2026-10-05T08:00:00Z", [hours(1, 5)]),
      ],
      TODAY,
    );
    expect(s).toMatchObject({ entries: 3, people: 2, hours: 19, confirmedHours: 0 });
    expect(s.firstMonth).toBe("2026-09");
    expect(s.lastMonth).toBe("2026-10");
  });

  it("confirmed hours are the independently approved ones only", () => {
    const s = summarizeOrganizationJournal(
      [
        row("a1", "w1", "2026-09-01T08:00:00Z", [hours(1, 8)], { decisions: [{ decision: "approved" }] }),
        // The subject approving their own entry is a decision, not a confirmation.
        row("a2", "w1", "2026-09-02T08:00:00Z", [hours(1, 4)], {
          decisions: [{ decision: "approved", by: "profile-w1" }],
          subjectProfile: "profile-w1",
        }),
      ],
      TODAY,
    );
    expect(s.hours).toBe(12);
    expect(s.confirmedHours).toBe(8);
  });

  it("a corrected entry is one day of work, not two", () => {
    const s = summarizeOrganizationJournal(
      [
        row("orig", "w1", "2026-09-01T08:00:00Z", [hours(1, 8)], { decisions: [{ decision: "approved" }] }),
        row("fix", "w1", "2026-09-03T08:00:00Z", [hours(1, 6)], { correctionOf: "orig" }),
      ],
      TODAY,
    );
    expect(s.entries).toBe(1);
    expect(s.hours).toBe(6);
    // The withdrawn approval is not carried over to the correction.
    expect(s.confirmedHours).toBe(0);
  });

  it("a row read twice is counted once", () => {
    const r = row("a1", "w1", "2026-09-01T08:00:00Z", [hours(1, 8)]);
    expect(summarizeOrganizationJournal([r, r], TODAY)).toMatchObject({ entries: 1, hours: 8 });
  });

  it("no entries is a measured zero with no span", () => {
    expect(summarizeOrganizationJournal([], TODAY)).toEqual({
      entries: 0,
      people: 0,
      hours: 0,
      confirmedHours: 0,
      dayUnits: 0,
      firstMonth: null,
      lastMonth: null,
    });
  });

  it("carries no name, no per-person line and no skill", () => {
    const s = summarizeOrganizationJournal([row("a1", "w1", "2026-09-01T08:00:00Z", [hours(1, 8)])], TODAY);
    expect(Object.keys(s).sort()).toEqual(
      ["confirmedHours", "dayUnits", "entries", "firstMonth", "hours", "lastMonth", "people"].sort(),
    );
  });
});
