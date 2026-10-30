import { describe, expect, it } from "vitest";

import { buildBusinessHistory, type BusinessHistoryRecord, type HistoryPeriodStatement } from "./business-history";
import { businessHistoryHeader, entityNameKey, periodOwnership } from "./business-history-header";

/**
 * NEGATIVE CONTROL: before this reading the overview header printed ONE total
 * of every record the organization holds under the title "{name}: one
 * continuous history" — the earlier legal entity's work (and its people's)
 * read as the new owner's own. These tests pin the split.
 */

const HOLDER = "Example Labs Sp. z o.o.";

function period(over: Partial<HistoryPeriodStatement> & Pick<HistoryPeriodStatement, "id">): HistoryPeriodStatement {
  return {
    periodLabel: over.id,
    legalEntityLabel: null,
    sourceLabels: [],
    periodStart: null,
    periodEnd: null,
    continuity: "continuous_business_history",
    legalEntityRelation: "not_asserted",
    basis: "owner_statement",
    basisReference: null,
    statement: null,
    createdAt: "2026-09-30T00:00:00Z",
    ...over,
  };
}

function rec(id: string, day: string, hours: number, person: string, sourceLabel: string | null = null): BusinessHistoryRecord {
  return { id, personId: person, workObjectId: null, projectId: null, activityDate: day, periodStart: null, periodEnd: null, hours, sourceLabel };
}

const EARLIER = period({
  id: "p-earlier",
  periodLabel: "Earlier Works",
  legalEntityLabel: "Earlier Works",
  sourceLabels: ["Earlier Works sheet"],
  periodStart: "2022-01-01",
  periodEnd: "2026-02-22",
});
const OWN = period({
  id: "p-own",
  periodLabel: "Example Labs",
  legalEntityLabel: "example labs sp z o o",
  periodStart: "2026-02-23",
  periodEnd: "2026-03-29",
});

describe("business history header — the earlier entity's work is never the holder's own (P0-B)", () => {
  const records = [
    rec("r1", "2024-05-01", 8, "a", "Earlier Works sheet"),
    rec("r2", "2023-03-01", 6, "b"),
    rec("r3", "2026-03-01", 4, "c"),
    rec("r4", "2021-01-01", 2, "d"),
  ];
  const business = buildBusinessHistory(records, [EARLIER, OWN]);
  const header = businessHistoryHeader(business, HOLDER);

  it("splits the header and states each period with its own figures", () => {
    expect(header.split).toBe(true);
    const earlier = header.rows.find((r) => r.statementId === "p-earlier")!;
    const own = header.rows.find((r) => r.statementId === "p-own")!;
    expect(earlier).toMatchObject({ ownership: "earlier", legalEntityRelation: "not_asserted" });
    expect(earlier.totals).toMatchObject({ records: 2, hours: 14, people: 2 });
    expect(own).toMatchObject({ ownership: "own" });
    expect(own.totals).toMatchObject({ records: 1, hours: 4, people: 1 });
    expect(header.notPlaced).toMatchObject({ records: 1, hours: 2 });
  });

  it("every record still counted once: period rows + not placed = the composer's total", () => {
    const sum = header.rows.reduce((n, r) => n + r.totals.records, 0) + header.notPlaced.records;
    expect(sum).toBe(business.totals.records);
    const hours = header.rows.reduce((n, r) => n + r.totals.hours, 0) + header.notPlaced.hours;
    expect(hours).toBe(business.totals.hours);
  });

  it("an organization whose every record sits in its own period keeps the one-total header", () => {
    const b = buildBusinessHistory([rec("x", "2026-03-01", 4, "c")], [EARLIER, OWN]);
    expect(businessHistoryHeader(b, HOLDER).split).toBe(false);
  });

  it("an organization with no periods but records: not placed → split (never silently the holder's own)", () => {
    const b = buildBusinessHistory([rec("x", "2026-03-01", 4, "c")], []);
    expect(businessHistoryHeader(b, HOLDER).split).toBe(true);
  });
});

describe("period ownership", () => {
  it("own by name (case, accents, punctuation ignored) or by a stated same-entity relation", () => {
    expect(periodOwnership({ legalEntityLabel: "EXAMPLE LABS sp. z o.o", legalEntityRelation: "not_asserted" }, HOLDER)).toBe("own");
    expect(periodOwnership({ legalEntityLabel: "Old Name", legalEntityRelation: "renamed" }, HOLDER)).toBe("own");
    expect(periodOwnership({ legalEntityLabel: "Old Name", legalEntityRelation: "same_entity" }, HOLDER)).toBe("own");
  });

  it("another entity — including a stated successor or a sale — is 'earlier', never own", () => {
    for (const rel of ["not_asserted", "successor", "sold_and_continued_by_new_entity", "other"] as const) {
      expect(periodOwnership({ legalEntityLabel: "Earlier Works", legalEntityRelation: rel }, HOLDER)).toBe("earlier");
    }
  });

  it("no legal entity named = unstated, never own", () => {
    expect(periodOwnership({ legalEntityLabel: null, legalEntityRelation: "not_asserted" }, HOLDER)).toBe("unstated");
    expect(periodOwnership({ legalEntityLabel: "  ", legalEntityRelation: "not_asserted" }, HOLDER)).toBe("unstated");
  });

  it("name key folds Lithuanian and Polish letters", () => {
    expect(entityNameKey("UAB „Ąžuolas“")).toBe(entityNameKey("uab azuolas"));
  });
});
