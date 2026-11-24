import { describe, expect, it } from "vitest";

import {
  ESTABLISHED_OBSERVATIONS,
  MIN_OBSERVATIONS,
  durationKey,
  inclusiveDaySpan,
  learnDurations,
  type DurationObservation,
} from "@/lib/workforce/learned-duration";

const obs = (
  sourceId: string,
  actualDays: number,
  plannedDays: number | null = null,
  completedOn: string | null = "2026-06-01",
  key = "foundations",
): DurationObservation => ({ key, sourceId, actualDays, plannedDays, completedOn });

const names = new Map([["foundations", "Foundations"]]);
const one = (o: readonly DurationObservation[]) => learnDurations(o, names)[0];

describe("inclusive day span counts the way the planning surfaces count", () => {
  it("same day start and end is ONE day, not zero", () => {
    expect(inclusiveDaySpan("2026-06-01", "2026-06-01")).toBe(1);
  });

  it("counts across a month boundary", () => {
    expect(inclusiveDaySpan("2026-06-28", "2026-07-02")).toBe(5);
  });

  it("a reversed range is a data problem, not a negative duration", () => {
    expect(inclusiveDaySpan("2026-07-02", "2026-06-28")).toBeNull();
  });

  it("a missing or malformed end is null, never assumed", () => {
    expect(inclusiveDaySpan("2026-06-01", null)).toBeNull();
    expect(inclusiveDaySpan("2026-06-01", "not-a-date")).toBeNull();
  });
});

describe("the grouping key never guesses that two names mean the same work", () => {
  it("casefolds and collapses whitespace, and stops there", () => {
    expect(durationKey("  Foundations   Poured ")).toBe("foundations poured");
    expect(durationKey("FOUNDATIONS")).toBe("foundations");
  });

  it("does NOT merge similar names", () => {
    // Merging "Foundations" with "Foundation works" would pool two bodies of
    // evidence with no way for the reader to see it happened.
    expect(durationKey("Foundations")).not.toBe(durationKey("Foundation works"));
  });

  it("a name too short to group on is refused", () => {
    expect(durationKey("a")).toBeNull();
    expect(durationKey("  ")).toBeNull();
    expect(durationKey(null)).toBeNull();
  });
});

describe("sparse evidence stays sparse — no fabricated certainty", () => {
  it("one observation reports the count and NO median", () => {
    const l = one([obs("s1", 10, 5)]);
    expect(l.observations).toBe(1);
    expect(l.confidence).toBe("insufficient");
    expect(l.medianActualDays).toBeNull();
    expect(l.medianPlannedDays).toBeNull();
    expect(l.medianRatio).toBeNull();
  });

  it(`${MIN_OBSERVATIONS - 1} observations still report no median`, () => {
    const l = one([obs("s1", 10, 5), obs("s2", 12, 5)]);
    expect(l.observations).toBe(2);
    expect(l.confidence).toBe("insufficient");
    expect(l.medianActualDays).toBeNull();
  });

  it(`${MIN_OBSERVATIONS} observations become indicative and report a median`, () => {
    const l = one([obs("s1", 10, 5), obs("s2", 12, 5), obs("s3", 20, 5)]);
    expect(l.confidence).toBe("indicative");
    expect(l.medianActualDays).toBe(12);
    expect(l.medianPlannedDays).toBe(5);
  });

  it(`${ESTABLISHED_OBSERVATIONS} observations become established`, () => {
    const many = Array.from({ length: ESTABLISHED_OBSERVATIONS }, (_, i) => obs(`s${i}`, 10, 5));
    expect(one(many).confidence).toBe("established");
  });
});

describe("the ratio pairs each stage with its OWN plan", () => {
  it("takes the median of per-observation ratios, not the ratio of medians", () => {
    // Ratio of medians here would be 10/5 = 2. The per-observation ratios are
    // 2, 1 and 6 → median 2 as well, so use a set where they differ:
    //   (20/10)=2, (12/2)=6, (3/3)=1  → median 2; medians are 12 and 3 → 4.
    const l = one([obs("a", 20, 10), obs("b", 12, 2), obs("c", 3, 3)]);
    expect(l.medianActualDays).toBe(12);
    expect(l.medianPlannedDays).toBe(3);
    expect(l.medianRatio).toBe(2);
    expect(l.medianRatio).not.toBe(4);
  });

  it("observations with no plan count for duration but not for the ratio", () => {
    const l = one([obs("a", 10, null), obs("b", 12, 6), obs("c", 14, 7)]);
    expect(l.observations).toBe(3);
    expect(l.comparedObservations).toBe(2);
    expect(l.medianActualDays).toBe(12);
    expect(l.medianRatio).toBe(2);
  });

  it("a zero-day plan is not a comparison — it is a division by nothing", () => {
    const l = one([obs("a", 10, 0), obs("b", 12, 6), obs("c", 14, 7)]);
    expect(l.comparedObservations).toBe(2);
    expect(Number.isFinite(l.medianRatio as number)).toBe(true);
  });
});

describe("provenance rides with every reading", () => {
  it("names the span and the rows it was read from", () => {
    const l = one([
      obs("s3", 10, 5, "2026-08-01"),
      obs("s1", 12, 5, "2026-03-01"),
      obs("s2", 14, 5, "2026-05-01"),
    ]);
    expect(l.firstObservedOn).toBe("2026-03-01");
    expect(l.lastObservedOn).toBe("2026-08-01");
    expect(l.sourceIds).toEqual(["s1", "s2", "s3"]);
  });

  it("the display name is the human spelling, never one this module invented", () => {
    const l = learnDurations([obs("s1", 10)], new Map([["foundations", "Foundations"]]))[0];
    expect(l.displayName).toBe("Foundations");
    // With no supplied name it falls back to the key rather than inventing
    // a title-cased guess.
    expect(learnDurations([obs("s1", 10)], new Map())[0].displayName).toBe("foundations");
  });
});

describe("nothing here promises a future", () => {
  it("no reading carries a prediction field", () => {
    const l = one([obs("s1", 10, 5), obs("s2", 12, 5), obs("s3", 20, 5)]);
    for (const forbidden of ["predictedDays", "estimateDays", "forecastDays", "willTake"]) {
      expect(Object.keys(l)).not.toContain(forbidden);
    }
  });

  it("groups come back in a deterministic order", () => {
    const readings = learnDurations(
      [obs("z", 1, null, "2026-01-01", "zinc"), obs("a", 1, null, "2026-01-01", "asphalt")],
      new Map(),
    );
    expect(readings.map((r) => r.key)).toEqual(["asphalt", "zinc"]);
  });
});
