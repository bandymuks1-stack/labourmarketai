import { describe, expect, it } from "vitest";

import {
  journalReportWindow,
  windowCreatedAtBounds,
} from "./journal-window-report";

/**
 * Windowed journal report — behaviour of the pure window derivation (V8
 * employer daily loop, GAP 4). These tests pin the WINDOWS, not the queries:
 * today is exactly one UTC calendar day, the week is exactly 7 calendar days
 * inclusive ending today, the month is exactly 30 — and boundaries do not
 * bend across month or year edges (W12 doctrine: UTC calendar days).
 */

const TODAY = "2026-08-13";

describe("journalReportWindow — today is one UTC calendar day", () => {
  it("starts and ends on the same day", () => {
    const w = journalReportWindow("today", TODAY);
    expect(w).toEqual({ key: "today", startIso: TODAY, endIso: TODAY });
  });

  it("created_at bounds cover the full day, exclusive of the next", () => {
    const b = windowCreatedAtBounds(journalReportWindow("today", TODAY));
    expect(b.gteIso).toBe("2026-08-13T00:00:00.000Z");
    expect(b.ltIso).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("journalReportWindow — week is 7 inclusive days ending today", () => {
  it("spans exactly seven calendar days", () => {
    const w = journalReportWindow("week", TODAY);
    expect(w.startIso).toBe("2026-08-07");
    expect(w.endIso).toBe(TODAY);
  });

  it("crosses a month boundary without bending", () => {
    const w = journalReportWindow("week", "2026-09-03");
    expect(w.startIso).toBe("2026-08-28");
    expect(w.endIso).toBe("2026-09-03");
  });
});

describe("journalReportWindow — month is 30 inclusive days ending today", () => {
  it("spans exactly thirty calendar days", () => {
    const w = journalReportWindow("month", TODAY);
    expect(w.startIso).toBe("2026-07-15");
    expect(w.endIso).toBe(TODAY);
  });

  it("crosses a year boundary without bending", () => {
    const w = journalReportWindow("month", "2026-01-10");
    expect(w.startIso).toBe("2025-12-12");
    expect(w.endIso).toBe("2026-01-10");
  });

  it("the upper created_at bound is the first instant after today", () => {
    const b = windowCreatedAtBounds(journalReportWindow("month", "2026-12-31"));
    expect(b.gteIso).toBe("2026-12-02T00:00:00.000Z");
    expect(b.ltIso).toBe("2027-01-01T00:00:00.000Z");
  });
});
