import { describe, expect, it } from "vitest";

import {
  buildBusinessHistory,
  innerPeriodBound,
  livePeriods,
  type BusinessHistoryRecord,
  type HistoryPeriodStatement,
} from "./business-history";

const VIVAT: HistoryPeriodStatement = {
  id: "p-vivat",
  periodLabel: "Vivat Rex",
  legalEntityLabel: "Vivat Rex",
  sourceLabels: ["Vivat Rex PL", "Nonstop-Vivat Rex PL"],
  periodStart: null,
  periodEnd: null,
  continuity: "continuous_business_history",
  legalEntityRelation: "not_asserted",
  basis: "owner_statement",
  basisReference: "owner decision 2026-09-30",
  statement: null,
  createdAt: "2026-10-09T00:00:00Z",
};

const rec = (over: Partial<BusinessHistoryRecord>): BusinessHistoryRecord => ({
  id: Math.random().toString(36).slice(2),
  personId: "p1",
  workObjectId: "o1",
  projectId: "pr1",
  activityDate: "2024-03-04",
  periodStart: null,
  periodEnd: null,
  hours: 8,
  sourceLabel: null,
  ...over,
});

describe("one continuous business history, read in periods", () => {
  it("places a record by its verbatim source label (case-insensitive), counts it once", () => {
    const h = buildBusinessHistory(
      [
        rec({ sourceLabel: "Vivat Rex PL" }),
        rec({ sourceLabel: "nonstop-vivat rex pl", personId: "p2", workObjectId: "o2" }),
        rec({ sourceLabel: null, activityDate: "2025-02-01", personId: "p3" }),
      ],
      [VIVAT],
    );
    expect(h.totals).toMatchObject({ records: 3, hours: 24, people: 3 });
    expect(h.periods[0].totals).toMatchObject({ records: 2, hours: 16, people: 2, places: 2 });
    expect(h.periods[0].placedByLabel).toBe(2);
    expect(h.notPlaced).toMatchObject({ records: 1, hours: 8, from: "2025-02-01" });
  });

  it("undocumented bounds place nothing by date; documented bounds do", () => {
    const undocumented = buildBusinessHistory([rec({ activityDate: "2024-05-01" })], [VIVAT]);
    expect(undocumented.periods[0].totals.records).toBe(0);
    expect(undocumented.notPlaced.records).toBe(1);
    const documented = buildBusinessHistory(
      [rec({ activityDate: "2024-05-01" })],
      [{ ...VIVAT, periodStart: "2024-01-01", periodEnd: "2024-12-31" }],
    );
    expect(documented.periods[0]).toMatchObject({ placedByDate: 1, totals: { records: 1 } });
  });

  it("a bound known only to the month places only work CERTAINLY inside it (the inner span)", () => {
    const monthEnd: HistoryPeriodStatement = {
      ...VIVAT,
      periodStart: "2022-01-11",
      periodEnd: "2026-01-31",
      periodEndPrecision: "month",
    };
    const h = buildBusinessHistory(
      [
        rec({ id: "dec", activityDate: "2025-12-15" }),
        rec({ id: "jan-week", activityDate: null, periodStart: "2026-01-19", periodEnd: "2026-01-25" }),
      ],
      [monthEnd],
    );
    expect(h.periods[0]).toMatchObject({ placedByDate: 1, totals: { records: 1 } });
    expect(h.notPlaced.records).toBe(1);
    expect(innerPeriodBound("2026-01-31", "month", "end")).toBe("2026-01-01");
    expect(innerPeriodBound("2024-02-10", "month", "start")).toBe("2024-02-29");
    expect(innerPeriodBound("2022-01-11", null, "start")).toBe("2022-01-11");
  });

  it("a period aggregate is never split: one year (its start), whole hours", () => {
    const h = buildBusinessHistory(
      [rec({ activityDate: null, periodStart: "2025-06-01", periodEnd: "2025-11-30", hours: 800 })],
      [],
    );
    expect(h.years).toEqual([expect.objectContaining({ year: 2025, records: 1, hours: 800, from: "2025-06-01", to: "2025-11-30" })]);
    expect(h.notPlaced.hours).toBe(800);
  });

  it("an undated record counts in the totals and in no year", () => {
    const h = buildBusinessHistory([rec({ activityDate: null })], []);
    expect(h.totals.records).toBe(1);
    expect(h.years).toEqual([]);
    expect(h.undated).toBe(1);
  });

  it("a superseded statement is not a live period", () => {
    const old = { ...VIVAT, id: "old", supersedesId: null };
    const fresh = { ...VIVAT, id: "new", periodStart: "2023-01-01", supersedesId: "old" };
    expect(livePeriods([old, fresh]).map((p) => p.id)).toEqual(["new"]);
  });
});
