import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A reviewer confirms WORK, so the review card names the day the work
 * happened — the same `resolveWorkDay` rule as the journal and the calendar.
 * Production walk 2026-09-28: an entry for 26 September, filed on the 28th,
 * was shown for confirmation as "2026-09-28".
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the review card shows the work day", () => {
  it("the queue resolves each entry's work day with the canonical rule", () => {
    const q = read("lib/journal/review-queue.ts");
    expect(q).toMatch(/workDay: resolveWorkDay\(/);
    expect(q).toMatch(/\.eq\("metric_slug", "work_date"\)/);
  });
  it("both confirm surfaces print the work day, falling back to the filing day", () => {
    expect(read("components/app/quick-confirm-card.tsx")).toMatch(/formatUtcDate\(entry\.workDay \?\? entry\.createdAt, locale\)/);
    expect(read("components/app/quick-confirm-batch.tsx")).toMatch(/formatUtcDate\(e\.workDay \?\? e\.createdAt, locale\)/);
  });
});
