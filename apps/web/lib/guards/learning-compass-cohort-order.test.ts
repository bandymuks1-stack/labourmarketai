import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The learning compass reads a learner's own cohorts with a LIMIT. A limit with
 * no order keeps an arbitrary subset: in production a learner in 21 live
 * cohorts lost the one they had just joined (prod-qa-walk learning-practice L-5,
 * run 45240106971). The read must take the newest memberships first.
 */
const SRC = readFileSync(resolve(__dirname, "../learning/learning-compass.ts"), "utf8");

function ownCohortQuery(): string {
  const start = SRC.indexOf('.from("education_cohort_members")');
  expect(start, "the compass reads education_cohort_members").toBeGreaterThan(-1);
  const end = SRC.indexOf("if (res.error)", start);
  return SRC.slice(start, end);
}

describe("learning compass: own cohorts, newest first", () => {
  it("orders by membership time, newest first, before the limit", () => {
    const q = ownCohortQuery();
    const order = q.indexOf('.order("added_at", { ascending: false })');
    const limit = q.indexOf(".limit(");
    expect(order, "ordered by added_at descending").toBeGreaterThan(-1);
    expect(limit, "still bounded").toBeGreaterThan(-1);
    expect(order).toBeLessThan(limit);
  });

  it("has a stable tiebreak, so equal times never shuffle between reads", () => {
    expect(ownCohortQuery()).toMatch(/\.order\("cohort_id", \{ ascending: true \}\)/);
  });
});
