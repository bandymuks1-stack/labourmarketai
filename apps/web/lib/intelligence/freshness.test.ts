import { describe, it, expect } from "vitest";

import {
  buildFreshness,
  computeAgeDays,
  FRESHNESS_OUTDATED_AFTER_DAYS,
  freshnessLabel,
} from "./freshness";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-14T12:00:00Z");
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY_MS).toISOString();

describe("computeAgeDays", () => {
  it("whole days since the timestamp; caller supplies now (deterministic)", () => {
    expect(computeAgeDays(iso(0), NOW)).toBe(0);
    expect(computeAgeDays(iso(1), NOW)).toBe(1);
    expect(computeAgeDays(iso(5), NOW)).toBe(5);
  });

  it("unparsable / absent → null (honest unknown, never fresh)", () => {
    expect(computeAgeDays("not-a-date", NOW)).toBe(null);
    expect(computeAgeDays(null, NOW)).toBe(null);
    expect(computeAgeDays("", NOW)).toBe(null);
  });

  it("small future timestamps (clock skew) clamp to 0", () => {
    expect(computeAgeDays(iso(-0.5), NOW)).toBe(0);
  });
});

describe("buildFreshness", () => {
  it("carries the four timestamps and anchors age on the first present", () => {
    const f = buildFreshness(
      {
        lastUpdatedIso: iso(2),
        observedAtIso: iso(10),
        sourceDateIso: iso(20),
        computedAtIso: iso(1),
      },
      NOW,
    );
    expect(f.lastUpdatedIso).toBe(iso(2));
    expect(f.observedAtIso).toBe(iso(10));
    expect(f.ageDays).toBe(2); // anchored on lastUpdated, not computedAt
  });

  it("falls through unparsable anchors to the next honest timestamp", () => {
    const f = buildFreshness(
      { lastUpdatedIso: "garbage", observedAtIso: iso(3) },
      NOW,
    );
    expect(f.ageDays).toBe(3);
  });

  it("no timestamps at all → null age", () => {
    expect(buildFreshness({}, NOW).ageDays).toBe(null);
  });
});

describe("freshnessLabel — deterministic age → code mapping", () => {
  it("0 → updatedToday, 1 → updatedYesterday", () => {
    expect(freshnessLabel(0).code).toBe("intelligence.freshness.updatedToday");
    expect(freshnessLabel(1).code).toBe(
      "intelligence.freshness.updatedYesterday",
    );
  });

  it("2..threshold → updatedDaysAgo with the day count param", () => {
    expect(freshnessLabel(5)).toEqual({
      code: "intelligence.freshness.updatedDaysAgo",
      params: { days: 5 },
    });
    expect(freshnessLabel(FRESHNESS_OUTDATED_AFTER_DAYS).code).toBe(
      "intelligence.freshness.updatedDaysAgo",
    );
  });

  it("beyond the threshold → outdated (with the honest day count)", () => {
    expect(freshnessLabel(FRESHNESS_OUTDATED_AFTER_DAYS + 1)).toEqual({
      code: "intelligence.freshness.outdated",
      params: { days: FRESHNESS_OUTDATED_AFTER_DAYS + 1 },
    });
  });

  it("null / invalid age → unknown (never guessed fresh)", () => {
    expect(freshnessLabel(null).code).toBe("intelligence.freshness.unknown");
    expect(freshnessLabel(Number.NaN).code).toBe(
      "intelligence.freshness.unknown",
    );
    expect(freshnessLabel(-1).code).toBe("intelligence.freshness.unknown");
  });
});
