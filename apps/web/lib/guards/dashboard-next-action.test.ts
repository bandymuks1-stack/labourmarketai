import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Next Action honesty guard (slice role-next-action-simplicity-v1).
 *
 * W3 Package 4 deleted the second dashboard, its <DashboardNextAction>
 * component, the worker/manager/customer role actions and their
 * auth.dashboard.nextAction copy — so the pins over those left with them.
 * What survives is the canonical resolver (lib/dashboard/next-action.ts,
 * the profile hub's ONE primary action — behaviour covered by its own
 * lib/dashboard/next-action.test.ts). This guard keeps the honesty
 * invariant on that surviving module: no fake/disabled affordance and no
 * payment machinery may creep into the decision layer.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("the surviving next-action decision lib stays honest", () => {
  it("carries no fake/disabled affordance and no payment claim", () => {
    const lib = read("lib/dashboard/next-action.ts");
    // actual disabled affordances (attribute form), not the word in prose
    expect(lib).not.toMatch(/\bdisabled=|aria-disabled/i);
    expect(lib).not.toMatch(/href="#"/);
    expect(lib).not.toMatch(/stripe|checkout|subscription/i);
  });
});
