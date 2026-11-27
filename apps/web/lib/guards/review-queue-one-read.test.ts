import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE REVIEW QUEUE IS READ ONCE, AND A FAILED READ IS NEVER "NOTHING TO REVIEW"
 * (duplication audit ORG-7, docs/audits/DUPLICATION_AUDIT.md; SEP-7).
 *
 * Three places read the reviewable set by hand. The quick queue
 * (`fetchQuickReviewQueue`) dropped the read's error and returned an empty
 * list, so the quick inbox, the projects card and the company home said
 * "nothing waiting" when the read had failed, while the full inbox said
 * "could not load". Every reader now goes through the one request-scoped
 * `readReviewableJournalEntryIds`, and the queue throws on a failed read
 * (its callers already catch and name the state).
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("the reviewable set: one read, failure is not empty", () => {
  it("the quick queue parses the shared read and throws when it failed", () => {
    const src = read("lib/journal/review-queue.ts");
    expect(src).toMatch(/reviewableIdsOf\(await readReviewableJournalEntryIds\(\)\)/);
    expect(src).toMatch(/if \(reviewableIds === null\) \{\s*throw new Error\("review_queue_unavailable:reviewable_ids"\)/);
  });

  for (const rel of [
    "lib/journal/review-queue.ts",
    "lib/journal/review-report.ts",
    "app/[locale]/dashboard/inbox/page.tsx",
  ]) {
    it(`${rel} reads the set through the shared reader, never its own RPC call`, () => {
      const src = read(rel);
      expect(src).toMatch(/readReviewableJournalEntryIds\(\)/);
      expect(src).not.toMatch(/\.rpc\(\s*["']reviewable_journal_entry_ids["']/);
    });
  }
});
