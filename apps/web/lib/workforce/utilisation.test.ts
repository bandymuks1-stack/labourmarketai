import { describe, expect, it } from "vitest";

import type { HeldTime } from "@/lib/workforce/commitment-reservation";
import {
  MAX_UTILISATION_WINDOW_DAYS,
  UTILISATION_DENOMINATOR,
  measureUtilisation,
  summariseRosterUtilisation,
} from "@/lib/workforce/utilisation";

const WINDOW = { startDate: "2026-10-01", endDate: "2026-10-30" }; // 30 days
const W = "worker-1";

const held = (
  source: HeldTime["source"],
  sourceId: string,
  startDate: string | null,
  endDate: string | null,
): HeldTime => ({ source, sourceId, label: null, startDate, endDate });

const measure = (h: readonly HeldTime[], unreadable?: HeldTime["source"][]) =>
  measureUtilisation({ workerId: W, window: WINDOW, held: h, unreadableSources: unreadable });

describe("the denominator is named, never assumed", () => {
  it("says which denominator it used and reports its value alongside the ratio", () => {
    const u = measure([held("project", "p1", "2026-10-01", "2026-10-15")]);
    expect(u.denominator).toBe(UTILISATION_DENOMINATOR);
    expect(u.windowDays).toBe(30);
    expect(u.committedDays).toBe(15);
    expect(u.committedRatio).toBe(0.5);
  });

  it("the denominator is calendar days — no working week is invented", () => {
    // The schema records no contracted hours and no working pattern, so a
    // "60% FTE" here would be a number made up in this file.
    expect(UTILISATION_DENOMINATOR).toBe("calendar_days");
  });
});

describe("days are a SET — nobody is 200% committed", () => {
  it("two overlapping commitments on the same days count those days once", () => {
    const u = measure([
      held("project", "p1", "2026-10-01", "2026-10-10"),
      held("booking", "b1", "2026-10-05", "2026-10-15"),
    ]);
    expect(u.committedDays).toBe(15);
    expect(u.committedRatio).toBe(0.5);
  });

  it("a commitment reaching outside the window is clipped to it", () => {
    const u = measure([held("project", "p1", "2026-09-01", "2026-12-31")]);
    expect(u.committedDays).toBe(30);
    expect(u.committedRatio).toBe(1);
  });

  it("a commitment entirely outside the window counts for nothing", () => {
    const u = measure([held("booking", "b1", "2026-11-01", "2026-11-05")]);
    expect(u.committedDays).toBe(0);
    expect(u.freeDays).toBe(30);
  });

  it("an open-ended commitment covers its start day only", () => {
    const u = measure([held("booking", "b1", "2026-10-07", null)]);
    expect(u.committedDays).toBe(1);
  });
});

describe("committed and unavailable are different facts", () => {
  it("absence counts as unavailable, not as committed", () => {
    const u = measure([held("absence", "a1", "2026-10-01", "2026-10-05")]);
    expect(u.committedDays).toBe(0);
    expect(u.unavailableDays).toBe(5);
    expect(u.freeDays).toBe(25);
    expect(u.committedRatio).toBe(0);
  });

  it("a day that is both is not counted twice against the window", () => {
    // The overlap itself is a real problem and CAL-7 is what surfaces it.
    // Here it must not make the three buckets add up to more than the window.
    const u = measure([
      held("project", "p1", "2026-10-01", "2026-10-10"),
      held("absence", "a1", "2026-10-05", "2026-10-15"),
    ]);
    expect(u.committedDays).toBe(10);
    expect(u.unavailableDays).toBe(11);
    expect(u.freeDays).toBe(30 - 15);
  });

  it("with nothing at all, the window is entirely free and the ratio is a real zero", () => {
    const u = measure([]);
    expect(u.state).toBe("measured");
    expect(u.committedDays).toBe(0);
    expect(u.freeDays).toBe(30);
    expect(u.committedRatio).toBe(0);
  });
});

describe("unknown is never zero — SEP-7", () => {
  it("an unreadable source yields unknown with NULL counts, not zeroes", () => {
    const u = measure([held("project", "p1", "2026-10-01", "2026-10-10")], ["absence"]);
    expect(u.state).toBe("unknown");
    expect(u.committedDays).toBeNull();
    expect(u.unavailableDays).toBeNull();
    expect(u.freeDays).toBeNull();
    expect(u.committedRatio).toBeNull();
    expect(u.gaps).toEqual([{ reason: "source_unreadable", source: "absence" }]);
  });

  it("an undated commitment makes the counts a FLOOR and withholds the ratio", () => {
    const u = measure([
      held("project", "p1", "2026-10-01", "2026-10-10"),
      held("project", "p-undated", null, null),
    ]);
    expect(u.state).toBe("partial");
    expect(u.committedDays).toBe(10);
    expect(u.committedRatio).toBeNull();
    expect(u.gaps).toEqual([
      { reason: "undated_commitment", source: "project", sourceId: "p-undated", label: null },
    ]);
  });

  it("a backwards range collapses to its start day, the way the calendar reads it", () => {
    // `effectiveEndDay` — the SHARED rule this file imports rather than
    // restating — resolves an end before the start to the start day, exactly
    // as it does for a null end. Diverging here so that utilisation could
    // report the row as a gap would mean the same booking read as one day on
    // the calendar and as unmeasurable here, which is the forking this reuse
    // exists to prevent. The row is still wrong; it is wrong in one place.
    const u = measure([held("booking", "b1", "2026-10-20", "2026-10-10")]);
    expect(u.state).toBe("measured");
    expect(u.committedDays).toBe(1);
    expect(u.gaps).toEqual([]);
  });
});

describe("a window that is not a window is refused", () => {
  it("backwards", () => {
    const u = measureUtilisation({
      workerId: W,
      window: { startDate: "2026-10-30", endDate: "2026-10-01" },
      held: [],
    });
    expect(u.state).toBe("invalid_window");
    expect(u.windowDays).toBeNull();
  });

  it("malformed", () => {
    const u = measureUtilisation({
      workerId: W,
      window: { startDate: "October", endDate: "2026-10-01" },
      held: [],
    });
    expect(u.state).toBe("invalid_window");
  });

  it(`longer than ${MAX_UTILISATION_WINDOW_DAYS} days`, () => {
    const u = measureUtilisation({
      workerId: W,
      window: { startDate: "2026-01-01", endDate: "2028-01-01" },
      held: [],
    });
    expect(u.state).toBe("invalid_window");
  });

  it("a single day is a valid window", () => {
    const u = measureUtilisation({
      workerId: W,
      window: { startDate: "2026-10-01", endDate: "2026-10-01" },
      held: [held("project", "p1", "2026-10-01", "2026-10-01")],
    });
    expect(u.windowDays).toBe(1);
    expect(u.committedRatio).toBe(1);
  });
});

describe("the roster summary cannot turn a partial answer into a headline", () => {
  const row = (
    state: "measured" | "partial" | "unknown",
    committedDays: number | null,
    unavailableDays: number | null = 0,
  ) => ({
    workerId: `w-${state}-${committedDays}-${unavailableDays}`,
    state,
    denominator: UTILISATION_DENOMINATOR,
    windowDays: state === "unknown" ? null : 30,
    committedDays,
    unavailableDays,
    freeDays: committedDays === null ? null : 30 - committedDays,
    committedRatio: state === "measured" && committedDays !== null ? committedDays / 30 : null,
    gaps: [],
  });

  it("issues a ratio only when EVERY worker is measured", () => {
    const all = summariseRosterUtilisation([row("measured", 15), row("measured", 0)], 30);
    expect(all.committedRatio).toBe(0.25);
    const withPartial = summariseRosterUtilisation(
      [row("measured", 15), row("partial", 10)],
      30,
    );
    expect(withPartial.committedRatio).toBeNull();
    // The days are still reported — withholding the RATIO is not the same as
    // withholding the evidence.
    expect(withPartial.committedWorkerDays).toBe(25);
  });

  it("an unreadable worker is not counted into the denominator", () => {
    // Otherwise "we could not see this person" would quietly read as "this
    // person is free", which is the whole defect.
    const s = summariseRosterUtilisation([row("measured", 30), row("unknown", null, null)], 30);
    expect(s.workers).toBe(2);
    expect(s.unknown).toBe(1);
    expect(s.countedWorkerDays).toBe(30);
    expect(s.committedWorkerDays).toBe(30);
    expect(s.committedRatio).toBeNull();
  });

  it("fully free counts only measured workers with nothing at all", () => {
    const s = summariseRosterUtilisation(
      [row("measured", 0, 0), row("measured", 0, 5), row("measured", 3, 0)],
      30,
    );
    expect(s.fullyFreeAmongMeasured).toBe(1);
  });

  it("an empty roster states nothing rather than a confident zero", () => {
    const s = summariseRosterUtilisation([], 30);
    expect(s.workers).toBe(0);
    expect(s.committedWorkerDays).toBeNull();
    expect(s.countedWorkerDays).toBeNull();
    expect(s.committedRatio).toBeNull();
  });
});
