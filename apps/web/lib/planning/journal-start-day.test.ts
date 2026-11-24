import { describe, expect, it } from "vitest";
import { journalStartDay } from "@/lib/planning/planning-model";

/**
 * A Work Journal entry belongs on THE DAY IT WAS WORKED.
 *
 * The projection used `created_at` — when the row was written — while the save
 * action had been storing the worker's own `work_date` all along. An entry
 * logged in the evening for yesterday's shift therefore appeared on today, and
 * the calendar a worker uses to see "which days have I filled?" was answering
 * with the days they happened to be typing. The tester asked for that calendar
 * as their single most wanted improvement.
 *
 * These cases assert the CHOSEN DAY, so a regression cannot hide behind a
 * passing string check somewhere else.
 */
describe("journalStartDay — the day worked wins over the day typed", () => {
  it("uses the worker's stated work date, not the creation timestamp", () => {
    // Logged late on the 8th, for work done on the 7th.
    expect(journalStartDay("2026-08-07", "2026-08-08T21:40:00.000Z")).toBe(
      "2026-08-07",
    );
  });

  it("falls back to the creation day when no work date was captured", () => {
    expect(journalStartDay(null, "2026-08-08T06:09:39.000Z")).toBe("2026-08-08");
    expect(journalStartDay(undefined, "2026-08-08T06:09:39.000Z")).toBe(
      "2026-08-08",
    );
    expect(journalStartDay("", "2026-08-08T06:09:39.000Z")).toBe("2026-08-08");
  });

  it("ignores a malformed work date rather than moving the entry somewhere wrong", () => {
    for (const bad of ["07/08/2026", "2026-8-7", "yesterday", "2026-08-07T10:00:00Z", "  "]) {
      expect(journalStartDay(bad, "2026-08-08T06:09:39.000Z")).toBe("2026-08-08");
    }
  });

  it("trims surrounding whitespace on an otherwise valid day", () => {
    expect(journalStartDay(" 2026-08-07 ", "2026-08-08T06:09:39.000Z")).toBe(
      "2026-08-07",
    );
  });

  it("is null only when neither source can name a day", () => {
    expect(journalStartDay(null, null)).toBeNull();
    expect(journalStartDay("not-a-day", "not-a-timestamp")).toBeNull();
  });

  it("crossing midnight in UTC does not shift the stated work day", () => {
    // A plain day is already a day: it must never go through a timestamp
    // conversion that could move it (W12 — one UTC-pinned formatter, and this
    // value bypasses it by construction).
    expect(journalStartDay("2026-08-07", "2026-08-07T23:59:59.999Z")).toBe("2026-08-07");
    expect(journalStartDay("2026-08-07", "2026-08-08T00:00:00.000Z")).toBe("2026-08-07");
  });
});
