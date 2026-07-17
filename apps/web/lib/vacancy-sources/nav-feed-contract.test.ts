import { describe, expect, it } from "vitest";

import {
  NAV_FEED_ORIGIN,
  NAV_IMPORT_BOUNDS,
  NAV_SOURCE_KEY,
  NAV_TRANSFORM_VERSION,
  parseNavFeedEntryDetail,
  parseNavFeedPage,
  shouldContinuePaging,
} from "./nav-feed-contract";
import {
  NAV_FIXTURE_ACTIVE_DETAIL,
  NAV_FIXTURE_FEED_PAGE,
  NAV_FIXTURE_INACTIVE_DETAIL,
  NAV_FIXTURE_MASKED_DETAIL,
} from "./nav-fixtures";

describe("nav feed contract — fixtures parse (real OpenAPI shape)", () => {
  it("the fixture feed page parses, including the masked (nulled) item", () => {
    const parsed = parseNavFeedPage(NAV_FIXTURE_FEED_PAGE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.items).toHaveLength(3);
    expect(parsed.value.next_url).toBeNull();
    const statuses = parsed.value.items.map((i) => i._feed_entry.status);
    expect(statuses).toEqual(["ACTIVE", "INACTIVE", "INACTIVE"]);
    // Masked stopped ad: title/businessName null MUST parse.
    const masked = parsed.value.items[2];
    expect(masked._feed_entry.title ?? null).toBeNull();
    expect(masked._feed_entry.businessName ?? null).toBeNull();
  });

  it("all three entry details parse: active, inactive, masked (ad_content null)", () => {
    for (const d of [
      NAV_FIXTURE_ACTIVE_DETAIL,
      NAV_FIXTURE_INACTIVE_DETAIL,
      NAV_FIXTURE_MASKED_DETAIL,
    ]) {
      const parsed = parseNavFeedEntryDetail(d);
      expect(parsed.ok, d.uuid).toBe(true);
    }
    const masked = parseNavFeedEntryDetail(NAV_FIXTURE_MASKED_DETAIL);
    if (masked.ok) expect(masked.value.ad_content ?? null).toBeNull();
  });

  it("malformed payloads are rejected with schema_invalid, never partially accepted", () => {
    for (const bad of [
      null,
      42,
      "feed",
      {},
      { id: "x", next_url: null, next_id: null }, // items missing
      { ...NAV_FIXTURE_FEED_PAGE, items: [{ id: "x" }] }, // malformed item
    ]) {
      const parsed = parseNavFeedPage(bad);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.reason).toBe("schema_invalid");
    }
    const badDetail = parseNavFeedEntryDetail({
      ...NAV_FIXTURE_ACTIVE_DETAIL,
      status: "PAUSED", // unknown status fails closed
    });
    expect(badDetail.ok).toBe(false);
  });

  it("unknown statuses fail closed (only ACTIVE|INACTIVE accepted)", () => {
    const parsed = parseNavFeedPage({
      ...NAV_FIXTURE_FEED_PAGE,
      items: [
        {
          ...NAV_FIXTURE_FEED_PAGE.items[0],
          _feed_entry: {
            ...NAV_FIXTURE_FEED_PAGE.items[0]._feed_entry,
            status: "DELETED",
          },
        },
      ],
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("nav bounds — conservative, self-imposed, pure", () => {
  it("bounds are the documented conservative first-import defaults", () => {
    expect(NAV_IMPORT_BOUNDS.maxEntriesPerSession).toBe(200);
    expect(NAV_IMPORT_BOUNDS.maxPagesPerSession).toBe(10);
    expect(NAV_IMPORT_BOUNDS.minRequestSpacingMs).toBeGreaterThanOrEqual(1000);
    expect(NAV_IMPORT_BOUNDS.requestTimeoutMs).toBeLessThanOrEqual(30_000);
    expect(NAV_IMPORT_BOUNDS.maxResponseBytes).toBeLessThanOrEqual(5_000_000);
  });

  it("shouldContinuePaging stops at EITHER cap (pages or entries)", () => {
    expect(shouldContinuePaging({ pagesFetched: 0, entriesSeen: 0 })).toBe(true);
    expect(
      shouldContinuePaging({
        pagesFetched: NAV_IMPORT_BOUNDS.maxPagesPerSession,
        entriesSeen: 0,
      }),
    ).toBe(false);
    expect(
      shouldContinuePaging({
        pagesFetched: 0,
        entriesSeen: NAV_IMPORT_BOUNDS.maxEntriesPerSession,
      }),
    ).toBe(false);
    expect(
      shouldContinuePaging(
        { pagesFetched: 1, entriesSeen: 5 },
        { maxPagesPerSession: 2, maxEntriesPerSession: 5 },
      ),
    ).toBe(false);
  });

  it("identity constants are pinned (registry key, transform version, host)", () => {
    expect(NAV_SOURCE_KEY).toBe("nav_arbeidsplassen");
    expect(NAV_TRANSFORM_VERSION).toBe("nav-vacancy-transform-v1");
    expect(NAV_FEED_ORIGIN).toBe("https://pam-stilling-feed.nav.no");
  });
});
