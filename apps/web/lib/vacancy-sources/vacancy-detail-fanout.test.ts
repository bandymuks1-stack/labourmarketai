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
