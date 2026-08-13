import { describe, expect, it } from "vitest";

import {
  absentOn,
  absentWithinDays,
  type WorkerUnavailability,
} from "./employer-availability";

/**
 * "Who is absent NOW" — behaviour of the two pure derivations (V8 employer
 * daily loop, GAP 3). Overlap semantics are the canonical inclusive-range
 * predicate the booking guard uses; these tests pin the WINDOWS, not the
 * predicate: today is one UTC day, the week is exactly 7 calendar days
 * starting today, and month boundaries do not bend either.
 */

function band(
  workerId: string,
  startDate: string,
  endDate: string | null,
): WorkerUnavailability {
  return {
    workerId,
    workerName: workerId,
    item: {
      id: `${workerId}-${startDate}`,
      kind: "absence",
      startDate,
      endDate,
      status: "approved",
    } as never,
  };
}

const TODAY = "2026-08-13";

describe("absentOn — the single UTC day", () => {
  it("covers exactly the bands overlapping today, single-day and multi-day alike", () => {
    const rows = [
      band("covers-today", "2026-08-10", "2026-08-15"),
      band("starts-today", "2026-08-13", "2026-08-13"),
      band("ended-yesterday", "2026-08-01", "2026-08-12"),
      band("starts-tomorrow", "2026-08-14", "2026-08-20"),
    ];
    const absent = absentOn(TODAY, rows).map((u) => u.workerId);
    expect(absent).toEqual(["covers-today", "starts-today"]);
  });
});

describe("absentWithinDays — the 7-day lookahead", () => {
  it("is inclusive of today and of day 7's start, exclusive beyond", () => {
    const rows = [
      band("today-only", "2026-08-13", "2026-08-13"),
      band("starts-day-7", "2026-08-19", "2026-08-25"),
      band("starts-day-8", "2026-08-20", "2026-08-25"),
      band("long-past-band-still-touching", "2026-07-01", "2026-08-13"),
      band("fully-past", "2026-07-01", "2026-08-12"),
    ];
    const absent = absentWithinDays(TODAY, 7, rows).map((u) => u.workerId);
    expect(absent).toEqual([
      "today-only",
      "starts-day-7",
      "long-past-band-still-touching",
    ]);
  });

  it("crosses a month boundary without bending", () => {
    const rows = [band("next-month", "2026-09-01", "2026-09-02")];
    expect(absentWithinDays("2026-08-30", 7, rows)).toHaveLength(1);
    expect(absentWithinDays("2026-08-20", 7, rows)).toHaveLength(0);
  });
});
