import { describe, expect, it } from "vitest";

import {
  countCurrentEngagements,
  deriveWorkHistory,
  type WorkHistorySourceRow,
} from "./work-history-model";

/**
 * Work history (W5 Slice 1).
 *
 * What matters: the history states what really happened and nothing else — no
 * invented employer, no invented date, no assessment of the person.
 */

function row(over: Partial<WorkHistorySourceRow> = {}): WorkHistorySourceRow {
  return {
    id: "e1",
    title: "Mūrininkas",
    relationship_slug: "employee",
    started_at: "2026-01-10",
    ended_at: null,
    status: "active",
    country_code: "NL",
    organizations: { display_name: "Dev Construction", legal_name: "Dev Construction BV" },
    ...over,
  };
}

describe("work history — facts only", () => {
  it("carries the real engagement through unchanged", () => {
    const [e] = deriveWorkHistory([row()]);
    expect(e).toEqual({
      id: "e1",
      title: "Mūrininkas",
      organizationName: "Dev Construction",
      relationshipSlug: "employee",
      kind: "employment",
      startedAt: "2026-01-10",
      endedAt: null,
      current: true,
      countryCode: "NL",
    });
  });

  it("falls back to the legal name, then to null — never to a label", () => {
    expect(
      deriveWorkHistory([
        row({ organizations: { display_name: "  ", legal_name: "Dev BV" } }),
      ])[0].organizationName,
    ).toBe("Dev BV");
    expect(
      deriveWorkHistory([row({ organizations: null })])[0].organizationName,
    ).toBeNull();
  });

  it("never invents a missing title or date", () => {
    const [e] = deriveWorkHistory([row({ title: "", started_at: null })]);
    expect(e.title).toBeNull();
    expect(e.startedAt).toBeNull();
  });

  it("is only CURRENT when the row really says so", () => {
    expect(deriveWorkHistory([row()])[0].current).toBe(true);
    // An end date wins over an 'active' status — the work is over.
    expect(deriveWorkHistory([row({ ended_at: "2026-05-01" })])[0].current).toBe(false);
    expect(deriveWorkHistory([row({ status: "ended" })])[0].current).toBe(false);
  });
});

describe("work history — ordering", () => {
  it("is newest first", () => {
    const out = deriveWorkHistory([
      row({ id: "old", started_at: "2024-01-01" }),
      row({ id: "new", started_at: "2026-01-01" }),
      row({ id: "mid", started_at: "2025-01-01" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("puts undated engagements LAST instead of guessing a position", () => {
    const out = deriveWorkHistory([
      row({ id: "undated", started_at: null }),
      row({ id: "dated", started_at: "2025-01-01" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["dated", "undated"]);
  });

  it("is deterministic for equal dates", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    expect(deriveWorkHistory(rows).map((e) => e.id)).toEqual(
      deriveWorkHistory(rows).map((e) => e.id),
    );
  });
});

describe("current engagements", () => {
  it("counts only the running ones", () => {
    const out = deriveWorkHistory([
      row({ id: "a" }),
      row({ id: "b", ended_at: "2026-02-02" }),
      row({ id: "c", status: "ended" }),
    ]);
    expect(countCurrentEngagements(out)).toBe(1);
  });

  it("is 0, not null, for an empty history — a counted absence", () => {
    expect(countCurrentEngagements([])).toBe(0);
  });
});
