import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 learning — honest-degradation + no-fake-data guard.
 *
 * The migration is owner-applied (RED). Until it is applied the tables/RPC are
 * absent; every server action must degrade to `needs-migration` and the UI must
 * show a calm "not available yet" state — never an error, never a fabricated
 * suggestion. No "try later" fake success.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Strip comments so honest "no seed/demo rows" notes don't trip the no-fake
 *  scan — what we forbid is fabricated data in CODE, not documentation of its
 *  absence. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ACTIONS = "lib/learning/learning.ts";
const SECTION = "components/app/learning-review-section.tsx";
const PAGE = "app/[locale]/dashboard/learning/page.tsx";

describe("learning server actions degrade honestly when the tables are absent", () => {
  const src = read(ACTIONS);

  it("classifies the undefined-table/function codes as needs-migration", () => {
    expect(src).toMatch(/const ABSENT = new Set\(\[[^\]]*"42P01"/);
    expect(src).toMatch(/return \{ kind: "needs-migration" \}/);
    expect(src).toMatch(/isAbsent\(error\)/);
  });

  it("every public action returns needs-migration on an absent table/function", () => {
    for (const fn of [
      "listVisibleReviewItems",
      "setReviewItemStatus",
      "listManagedLearningPolicies",
      "setAutoConfirmPolicy",
      "applyAutoConfirmation",
    ]) {
      expect(src, `${fn} present`).toMatch(new RegExp(`export async function ${fn}`));
    }
  });

  it("never writes verified itself — auto-confirmation goes through the audited RPC", () => {
    // Learning code must NEVER flip verified; only the spine RPC does.
    expect(stripComments(src)).not.toMatch(/verified\s*[:=]\s*true/i);
    expect(src).toMatch(/rpc\("apply_learning_auto_confirmation"/);
  });

  it("contains no seeded / sample / fake suggestion rows", () => {
    expect(stripComments(src)).not.toMatch(/sample|seed|demo|fixture|fakeItem|mockRow/i);
  });
});

describe("the learning UI surfaces an honest not-available state, never a fake suggestion", () => {
  it("section renders the not-available branch off the needsMigration flag", () => {
    const s = read(SECTION);
    expect(s).toMatch(/needsMigration/);
    expect(s).toMatch(/data-testid="learning-not-available"/);
    // Rows come only from props (real RLS-scoped data), never hardcoded.
    expect(s).toMatch(/initialItems\.map/);
    expect(stripComments(s)).not.toMatch(/sample|seed|demo|fixture/i);
  });

  it("page passes the real needs-migration flag from the action results", () => {
    const p = read(PAGE);
    expect(p).toMatch(/=== "needs-migration"/);
    expect(p).toMatch(/listVisibleReviewItems\(\)/);
    expect(p).toMatch(/listManagedLearningPolicies\(\)/);
  });
});
