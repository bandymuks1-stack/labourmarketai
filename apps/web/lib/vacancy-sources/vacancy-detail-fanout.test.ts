import { describe, expect, it } from "vitest";
import { expandDetailFanOut, type DetailFetchResult } from "./vacancy-detail-fanout";
import type { VacancyChannelEndpointV1 } from "./vacancy-provider-registry";

const endpoint: Pick<VacancyChannelEndpointV1, "host" | "detailFanOut"> = {
  host: "feed.example.test",
  detailFanOut: {
    itemsKey: "items",
    entryUrlKey: "url",
    statusPath: ["_feed_entry", "status"],
    activeValue: "ACTIVE",
    withdrawalKeys: ["uuid", "status"],
    maxDetailFetchesPerPage: 1000,
    concurrency: 2,
  },
};

const entry = (uuid: string, status = "ACTIVE") => ({
  url: `/d/${uuid}`,
  _feed_entry: { uuid, status },
});

function fetcher(seen: string[]) {
  return async (url: string): Promise<DetailFetchResult> => {
    seen.push(url);
    return { ok: true, body: { uuid: url.split("/").pop() } };
  };
}

describe("expandDetailFanOut — session budget", () => {
  it("without a budget the whole page is consumed (unchanged behaviour)", async () => {
    const seen: string[] = [];
    const out = await expandDetailFanOut({
      endpoint,
      body: { items: [entry("a"), entry("b"), entry("c")] },
      fetchDetail: fetcher(seen),
    });
    expect(out.ok && out.pageComplete).toBe(true);
    expect(out.ok && out.consumedEntries).toBe(3);
    expect(seen).toHaveLength(3);
  });

  it("stops at an entry boundary: nothing past the cut is fetched or returned", async () => {
    const seen: string[] = [];
    const out = await expandDetailFanOut({
      endpoint,
      body: {
        items: [entry("a"), entry("x", "INACTIVE"), entry("b"), entry("c"), entry("d")],
        next_id: "n",
      },
      detailBudget: 2,
      fetchDetail: fetcher(seen),
    });
    if (!out.ok) throw new Error("expected ok");
    expect(seen.sort()).toEqual(["https://feed.example.test/d/a", "https://feed.example.test/d/b"]);
    expect(out.pageComplete).toBe(false);
    // a, x (withdrawal) and b are consumed; c is the first entry NOT consumed.
    expect(out.consumedEntries).toBe(3);
    const items = (out.body as { items: { uuid?: string }[] }).items;
    expect(items.map((i) => i.uuid)).toEqual(["a", "x", "b"]);
  });

  it("withdrawals cost no budget: those before the cut are consumed even at budget 0", async () => {
    const out = await expandDetailFanOut({
      endpoint,
      body: { items: [entry("x", "INACTIVE"), entry("y", "INACTIVE"), entry("a")] },
      detailBudget: 0,
      fetchDetail: fetcher([]),
    });
    if (!out.ok) throw new Error("expected ok");
    expect(out.consumedEntries).toBe(2);
    expect(out.pageComplete).toBe(false);
  });

  it("resuming at consumedEntries reads exactly the remainder: none skipped, none repeated", async () => {
    const items = Array.from({ length: 7 }, (_, i) => entry(`e${i}`));
    const seen: string[] = [];
    let skip = 0;
    for (let session = 0; session < 10; session += 1) {
      const out = await expandDetailFanOut({
        endpoint,
        body: { items },
        detailBudget: 3,
        skipEntries: skip,
        fetchDetail: fetcher(seen),
      });
      if (!out.ok) throw new Error("expected ok");
      skip = out.consumedEntries;
      if (out.pageComplete) break;
    }
    expect(skip).toBe(7);
    expect(seen.map((u) => u.split("/").pop())).toEqual(items.map((i) => i._feed_entry.uuid));
  });

  it("a stored position past the end of the page re-reads the page from the start", async () => {
    const seen: string[] = [];
    const out = await expandDetailFanOut({
      endpoint,
      body: { items: [entry("a"), entry("b")] },
      skipEntries: 99,
      fetchDetail: fetcher(seen),
    });
    expect(out.ok && out.consumedEntries).toBe(2);
    expect(seen).toHaveLength(2);
  });

  it("a detail failure still fails the whole page closed under a budget", async () => {
    const out = await expandDetailFanOut({
      endpoint,
      body: { items: [entry("a"), entry("b")] },
      detailBudget: 5,
      fetchDetail: async () => ({ ok: false, gone: false, detail: "http_500" }),
    });
    expect(out.ok).toBe(false);
  });
});

describe("expandDetailFanOut — wall-clock deadline and diagnostics", () => {
  const slowEndpoint = { ...endpoint, detailFanOut: { ...endpoint.detailFanOut!, concurrency: 1 } };

  it("stops starting requests after the deadline and cuts at an entry boundary (slow publisher makes partial progress)", async () => {
    let t = 0;
    const seen: string[] = [];
    const out = await expandDetailFanOut({
      endpoint: slowEndpoint,
      body: {
        items: [entry("a"), entry("x", "INACTIVE"), entry("b"), entry("c"), entry("d")],
        next_id: "n",
      },
      deadlineAtMs: 25_000,
      now: () => t,
      fetchDetail: async (url) => {
        seen.push(url);
        t += 20_000; // every detail takes 20 s
        return { ok: true, body: { uuid: url.split("/").pop() }, elapsedMs: 20_000 };
      },
    });
    if (!out.ok) throw new Error("expected ok");
    // a (t=0 -> 20 s), b (20 s < 25 s -> 40 s), then the deadline has passed.
    expect(seen).toEqual(["https://feed.example.test/d/a", "https://feed.example.test/d/b"]);
    expect(out.pageComplete).toBe(false);
    expect(out.consumedEntries).toBe(3); // a, x (withdrawal), b; c is the first untouched
    const items = (out.body as { items: { uuid?: string }[] }).items;
    expect(items.map((i) => i.uuid)).toEqual(["a", "x", "b"]);
    expect(out.stats.withdrawn).toBe(1);
  });

  it("without a deadline behaviour is unchanged (whole page)", async () => {
    const out = await expandDetailFanOut({
      endpoint: slowEndpoint,
      body: { items: [entry("a"), entry("b")] },
      fetchDetail: fetcher([]),
    });
    expect(out.ok && out.pageComplete).toBe(true);
  });

  it("reports counts, latency spread and the first failing entry (uuid + page position) on failure", async () => {
    const out = await expandDetailFanOut({
      endpoint: slowEndpoint,
      body: { items: [entry("a"), entry("b"), entry("c")] },
      skipEntries: 0,
      fetchDetail: async (url) => {
        if (url.endsWith("/c")) return { ok: false, gone: false, detail: "timeout", elapsedMs: 60_000 };
        return { ok: true, body: {}, elapsedMs: url.endsWith("/a") ? 1_000 : 3_000 };
      },
    });
    expect(out.ok).toBe(false);
    expect(out.diagnostics).toEqual({
      attempted: 3,
      succeeded: 2,
      failed: 1,
      elapsedMs: { min: 1_000, median: 3_000, max: 60_000 },
      firstFailure: { uuid: "c", position: 2, cause: "timeout", elapsedMs: 60_000 },
    });
  });

  it("the failure position counts the skipped prefix of a resumed page", async () => {
    const out = await expandDetailFanOut({
      endpoint: slowEndpoint,
      body: { items: [entry("a"), entry("b"), entry("c")] },
      skipEntries: 1,
      fetchDetail: async (url) =>
        url.endsWith("/c") ? { ok: false, gone: false, detail: "http_503" } : { ok: true, body: {} },
    });
    expect(!out.ok && out.diagnostics.firstFailure).toMatchObject({ uuid: "c", position: 2, cause: "http_503" });
  });
});

describe("expandDetailFanOut — feed position (source time)", () => {
  const withChanged = {
    ...endpoint,
    detailFanOut: { ...endpoint.detailFanOut!, changedAtPath: ["_feed_entry", "sistEndret"] },
  };
  const at = (uuid: string, sistEndret: string, status = "ACTIVE") => ({
    url: `/d/${uuid}`,
    _feed_entry: { uuid, status, sistEndret },
  });

  it("reports the newest change time among CONSUMED entries only", async () => {
    const out = await expandDetailFanOut({
      endpoint: withChanged,
      body: {
        items: [
          at("a", "2026-08-10T10:00:00Z"),
          at("x", "2026-08-11T09:00:00Z", "INACTIVE"),
          at("b", "2026-08-10T12:00:00Z"),
          at("c", "2026-08-20T00:00:00Z"),
        ],
      },
      detailBudget: 2,
      fetchDetail: fetcher([]),
    });
    if (!out.ok) throw new Error("expected ok");
    expect(out.consumedEntries).toBe(3);
    // c was not consumed, so its later time must not count.
    expect(out.diagnostics.feedPositionAt).toBe("2026-08-11T09:00:00.000Z");
  });

  it("is absent when unconfigured, and absent when no entry carries a parseable time", async () => {
    const plain = await expandDetailFanOut({ endpoint, body: { items: [entry("a")] }, fetchDetail: fetcher([]) });
    expect(plain.diagnostics.feedPositionAt).toBeUndefined();
    const junk = await expandDetailFanOut({
      endpoint: withChanged,
      body: { items: [at("a", "not a date")] },
      fetchDetail: fetcher([]),
    });
    expect(junk.diagnostics.feedPositionAt).toBeUndefined();
  });
});
