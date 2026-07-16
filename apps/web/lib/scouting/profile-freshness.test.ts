import { describe, expect, it } from "vitest";

import {
  freshnessDemotionRank,
  lastActiveBucket,
} from "./profile-freshness";

const NOW = new Date("2026-07-16T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("lastActiveBucket", () => {
  it("buckets by real age: ≤30d active, ≤90d recent, >90d dormant", () => {
    expect(lastActiveBucket(daysAgo(0), NOW)).toBe("active");
    expect(lastActiveBucket(daysAgo(29), NOW)).toBe("active");
    expect(lastActiveBucket(daysAgo(30), NOW)).toBe("active");
    expect(lastActiveBucket(daysAgo(31), NOW)).toBe("recent");
    expect(lastActiveBucket(daysAgo(90), NOW)).toBe("recent");
    expect(lastActiveBucket(daysAgo(91), NOW)).toBe("dormant");
    expect(lastActiveBucket(daysAgo(400), NOW)).toBe("dormant");
  });

  it("never fabricates freshness: missing/invalid timestamps are dormant", () => {
    expect(lastActiveBucket(null, NOW)).toBe("dormant");
    expect(lastActiveBucket(undefined, NOW)).toBe("dormant");
    expect(lastActiveBucket("", NOW)).toBe("dormant");
    expect(lastActiveBucket("not-a-date", NOW)).toBe("dormant");
  });

  it("treats slight clock skew (future timestamp) as active, not an error", () => {
    expect(lastActiveBucket(daysAgo(-1), NOW)).toBe("active");
  });
});

describe("freshnessDemotionRank", () => {
  it("demotes ONLY dormant; active and recent rank equally (match order wins)", () => {
    expect(freshnessDemotionRank("active")).toBe(0);
    expect(freshnessDemotionRank("recent")).toBe(0);
    expect(freshnessDemotionRank("dormant")).toBe(1);
  });
});
