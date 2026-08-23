/**
 * Weekly digest materializer — pure-parts tests (value train 2, B2).
 *
 * The exactly-once-per-week property rests on two pure facts pinned here:
 * the entity id is DETERMINISTIC within an ISO week (so the store's
 * (recipient, dedupe_key) UNIQUE holds across renders, races and instances),
 * and the cheap skip check recognizes a current-week row without ever
 * misreading last week's.
 */
import { describe, expect, it } from "vitest";
import {
  hasCurrentWeekDigest,
  weeklyDigestEntityId,
} from "./weekly-digest-emitter";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("weeklyDigestEntityId", () => {
  it("is a stable RFC-4122-shaped uuid for every day of one ISO week", () => {
    const monday = weeklyDigestEntityId("2026-08-17");
    const sunday = weeklyDigestEntityId("2026-08-23");
    expect(monday).toMatch(UUID_SHAPE);
    expect(sunday).toBe(monday);
  });

  it("differs across weeks", () => {
    expect(weeklyDigestEntityId("2026-08-24")).not.toBe(
      weeklyDigestEntityId("2026-08-23"),
    );
  });
});

describe("hasCurrentWeekDigest", () => {
  const digestRow = (createdAt: string) => ({
    type: "event_weekly_digest",
    created_at: createdAt,
  });

  it("recognizes a current-week digest row", () => {
    expect(
      hasCurrentWeekDigest([digestRow("2026-08-17T08:00:00.000Z")], "2026-08-23"),
    ).toBe(true);
  });

  it("last week's digest does not suppress this week's", () => {
    expect(
      hasCurrentWeekDigest([digestRow("2026-08-16T08:00:00.000Z")], "2026-08-23"),
    ).toBe(false);
  });

  it("other event types never count", () => {
    expect(
      hasCurrentWeekDigest(
        [{ type: "event_booking_accepted", created_at: "2026-08-23T08:00:00.000Z" }],
        "2026-08-23",
      ),
    ).toBe(false);
  });

  it("malformed timestamps are ignored rather than trusted", () => {
    expect(
      hasCurrentWeekDigest([{ type: "event_weekly_digest", created_at: "" }], "2026-08-23"),
    ).toBe(false);
  });
});
