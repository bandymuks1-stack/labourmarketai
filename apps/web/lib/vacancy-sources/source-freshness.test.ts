import { describe, expect, it } from "vitest";
import {
  classifySourceFreshness,
  freshnessNeedsNotice,
  FRESHNESS_DELAYED_AFTER_HOURS,
  FRESHNESS_STALE_AFTER_HOURS,
} from "./source-freshness";

/**
 * The states a worker is allowed to be told about external supply, and the
 * exact boundaries between them. The regression that matters is the NEGATIVE
 * one: stale supply must never classify as `current`.
 */

const NOW = "2026-08-12T06:00:00.000Z";
/** `NOW` minus n hours, as an ISO instant. */
const hoursAgo = (n: number) =>
  new Date(Date.parse(NOW) - n * 3_600_000).toISOString();

describe("classifySourceFreshness", () => {
  it("calls freshly-confirmed supply current", () => {
    const r = classifySourceFreshness({ lastRefreshedAt: hoursAgo(2), nowIso: NOW });
    expect(r.state).toBe("current");
    expect(r.ageHours).toBe(2);
    expect(r.lastRefreshedAt).toBe(hoursAgo(2));
  });

  it("is current right up to the delayed boundary, and delayed at it", () => {
    expect(
      classifySourceFreshness({
        lastRefreshedAt: hoursAgo(FRESHNESS_DELAYED_AFTER_HOURS - 1),
        nowIso: NOW,
      }).state,
    ).toBe("current");
    expect(
      classifySourceFreshness({
        lastRefreshedAt: hoursAgo(FRESHNESS_DELAYED_AFTER_HOURS),
        nowIso: NOW,
      }).state,
    ).toBe("delayed");
  });

  it("is delayed right up to the stale boundary, and stale at it", () => {
    expect(
      classifySourceFreshness({
        lastRefreshedAt: hoursAgo(FRESHNESS_STALE_AFTER_HOURS - 1),
        nowIso: NOW,
      }).state,
    ).toBe("delayed");
    expect(
      classifySourceFreshness({
        lastRefreshedAt: hoursAgo(FRESHNESS_STALE_AFTER_HOURS),
        nowIso: NOW,
      }).state,
    ).toBe("stale");
  });

  /**
   * NEGATIVE CONTROL — the exact production situation on 2026-08-12: 87 rows,
   * all flagged active, newest last_seen_at 2026-08-09T20:05Z, importer
   * failing since 2026-08-10. This MUST NOT read as current.
   */
  it("classifies the real 2026-08-12 Swedish supply as stale, never current", () => {
    const r = classifySourceFreshness({
      lastRefreshedAt: "2026-08-09T20:05:32.975Z",
      nowIso: "2026-08-12T06:16:00.000Z",
    });
    expect(r.state).toBe("stale");
    expect(r.state).not.toBe("current");
    expect(r.ageHours).toBeGreaterThanOrEqual(FRESHNESS_STALE_AFTER_HOURS);
    expect(freshnessNeedsNotice(r.state)).toBe(true);
  });

  it("reports unknown rather than current when nothing was ever confirmed", () => {
    const r = classifySourceFreshness({ lastRefreshedAt: null, nowIso: NOW });
    expect(r.state).toBe("unknown");
    expect(r.ageHours).toBeNull();
  });

  it("reports unavailable when the store could not be read", () => {
    const r = classifySourceFreshness({
      lastRefreshedAt: hoursAgo(1),
      nowIso: NOW,
      unavailable: true,
    });
    expect(r.state).toBe("unavailable");
    // Even a fresh timestamp must not leak through an unavailable store.
    expect(r.lastRefreshedAt).toBeNull();
  });

  it("refuses to call an unparseable or future timestamp fresh", () => {
    expect(
      classifySourceFreshness({ lastRefreshedAt: "not-a-date", nowIso: NOW }).state,
    ).toBe("unknown");
    expect(
      classifySourceFreshness({ lastRefreshedAt: hoursAgo(-5), nowIso: NOW }).state,
    ).toBe("unknown");
  });
});

describe("freshnessNeedsNotice", () => {
  it("stays silent only for current supply", () => {
    expect(freshnessNeedsNotice("current")).toBe(false);
    for (const s of ["delayed", "stale", "unavailable", "unknown"] as const) {
      expect(freshnessNeedsNotice(s), `${s} must warn`).toBe(true);
    }
  });
});
