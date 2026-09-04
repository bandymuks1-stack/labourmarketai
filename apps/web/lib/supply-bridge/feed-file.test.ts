import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FEED_FILENAME, feedPathFor, writeFeedFile } from "@/lib/supply-bridge/feed-file";
import { readFirstPartySupplyFeedWith } from "@/lib/supply-bridge/feed-read";
import { validateFirstPartySignal } from "@/lib/supply-bridge/__contract__/agentai-v1-consumer.vendored";

/**
 * The artefact, not just the string.
 *
 * The consumer derives `present` from THE FILE EXISTING, never from its row
 * count. Every assertion here is about that distinction surviving contact with
 * the filesystem: an empty feed must produce a file, and a failed read must
 * produce none — and must not destroy the one already there.
 */

const ROW = {
  schemaVersion: "agentai-first-party-market-signal/v1",
  signalId: "lm-sig-c8b0e24b-0215-4576-86b3-0f3d588cec7c",
  signalType: "WORKER_AVAILABILITY",
  actorType: "WORKER",
  actorRef: "lm:worker:c8b0e24b-0215-4576-86b3-0f3d588cec7c",
  projectScope: "labourmarketai",
  currentState: "AVAILABLE_FROM",
  freshness: "CURRENT",
  geography: ["DE", "LT", "NL"],
  allowedMarkets: ["DE"],
  trades: ["carpenter"],
  availableFromIso: "2026-10-01",
  headcount: null,
  requirementSummary: null,
  evidenceCompleteness: null,
  verifiedAtIso: "2026-09-04T21:10:33.298Z",
  expiresAtIso: "2026-11-03T21:10:33.298Z",
  authorities: {
    matchAuthority: "GRANTED",
    contactAuthority: "GRANTED",
    publicationAuthority: "DENIED",
    identityDisclosureAuthority: "DENIED",
  },
  allowedChannels: [],
  provenance: "FIRST_PARTY_REGISTERED",
};

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "supply-feed-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the feed artefact", () => {
  it("writes the file at the path the consumer expects", async () => {
    const feed = await readFirstPartySupplyFeedWith(async () => ({
      data: [ROW],
      error: null,
    }));
    const result = writeFeedFile(feedPathFor(root), feed.body, feed.unavailableReason);

    expect(result.kind).toBe("written");
    const path = join(root, "runtime", "labourmarket-supply", FEED_FILENAME);
    expect(existsSync(path)).toBe(true);

    const lines = readFileSync(path, "utf8").split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(1);
    expect(validateFirstPartySignal(JSON.parse(lines[0]!))).not.toBeNull();
  });

  it("a measured zero IS a file — empty, and present", async () => {
    const feed = await readFirstPartySupplyFeedWith(async () => ({ data: [], error: null }));
    writeFeedFile(feedPathFor(root), feed.body, feed.unavailableReason);

    const path = feedPathFor(root);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("");
  });

  it("a failed read writes NOTHING — 'we did not look'", async () => {
    const feed = await readFirstPartySupplyFeedWith(async () => ({
      data: null,
      error: { code: "42883" },
    }));
    expect(feed.body).toBeNull();
    expect(feed.unavailableReason).toContain("not applied");

    const result = writeFeedFile(feedPathFor(root), feed.body, feed.unavailableReason);
    expect(result.kind).toBe("skipped-unavailable");
    expect(existsSync(feedPathFor(root))).toBe(false);
  });

  it("a failed read does NOT truncate a feed that is already there", async () => {
    // The expensive version of this bug: yesterday's real answer replaced by
    // today's outage, reported as "we hold nobody".
    const good = await readFirstPartySupplyFeedWith(async () => ({ data: [ROW], error: null }));
    writeFeedFile(feedPathFor(root), good.body, good.unavailableReason);
    const before = readFileSync(feedPathFor(root), "utf8");

    const bad = await readFirstPartySupplyFeedWith(async () => {
      throw new Error("connection reset");
    });
    writeFeedFile(feedPathFor(root), bad.body, bad.unavailableReason);

    expect(readFileSync(feedPathFor(root), "utf8")).toBe(before);
  });

  it("a non-array answer is UNAVAILABLE, never an empty feed", async () => {
    const feed = await readFirstPartySupplyFeedWith(async () => ({
      data: { rows: [] },
      error: null,
    }));
    expect(feed.body).toBeNull();
    expect(feed.unavailableReason).toContain("non-array");
  });

  it("rebuilds whole, so a withdrawn person disappears rather than lingering", async () => {
    const withRow = await readFirstPartySupplyFeedWith(async () => ({ data: [ROW], error: null }));
    writeFeedFile(feedPathFor(root), withRow.body, withRow.unavailableReason);
    expect(readFileSync(feedPathFor(root), "utf8")).toContain("lm-sig-");

    const afterWithdrawal = await readFirstPartySupplyFeedWith(async () => ({
      data: [],
      error: null,
    }));
    writeFeedFile(feedPathFor(root), afterWithdrawal.body, afterWithdrawal.unavailableReason);

    // Not appended as a tombstone — gone. A tombstone is still a row about a
    // person who asked to stop being a row.
    expect(readFileSync(feedPathFor(root), "utf8")).toBe("");
  });

  it("two rebuilds of unchanged state are byte-identical", async () => {
    const a = await readFirstPartySupplyFeedWith(async () => ({ data: [ROW], error: null }));
    const b = await readFirstPartySupplyFeedWith(async () => ({ data: [ROW], error: null }));
    expect(a.body).toBe(b.body);
  });

  it("leaves no .tmp file behind after a successful write", async () => {
    const feed = await readFirstPartySupplyFeedWith(async () => ({ data: [ROW], error: null }));
    writeFeedFile(feedPathFor(root), feed.body, feed.unavailableReason);
    expect(existsSync(`${feedPathFor(root)}.tmp`)).toBe(false);
  });

  it("replaces a previous file atomically rather than appending to it", async () => {
    const path = feedPathFor(root);
    const first = await readFirstPartySupplyFeedWith(async () => ({ data: [ROW], error: null }));
    writeFeedFile(path, first.body, first.unavailableReason);
    writeFileSync(path, `${readFileSync(path, "utf8")}JUNK\n`);

    const second = await readFirstPartySupplyFeedWith(async () => ({ data: [ROW], error: null }));
    writeFeedFile(path, second.body, second.unavailableReason);
    expect(readFileSync(path, "utf8")).not.toContain("JUNK");
  });
});
