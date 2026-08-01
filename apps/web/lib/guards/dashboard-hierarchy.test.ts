import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile dashboard hierarchy guard (audit PR6 → control-room PR B →
 * compact home v1, owner directive 2026-07-16).
 *
 * The dashboard must be understandable in seconds, visually, not through
 * explanatory text. W3 Package 4 deleted the second dashboard whose branch
 * layouts this guard froze, so the source-order pins over that page left
 * with it. What survives is the same principle on the canonical surfaces:
 * the company page explains its intake AFTER the action, and the
 * invitation capability is read exactly once where it is rendered.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Asserts each needle exists and appears in the given order. */
function expectOrder(src: string, needles: readonly string[], label: string) {
  let prev = -1;
  let prevNeedle = "(start)";
  for (const needle of needles) {
    const idx = src.indexOf(needle);
    expect(idx, `${label}: "${needle}" must exist`).toBeGreaterThanOrEqual(0);
    expect(
      idx,
      `${label}: "${needle}" must come after "${prevNeedle}"`,
    ).toBeGreaterThan(prev);
    prev = idx;
    prevNeedle = needle;
  }
}

describe("company page: action before explanation", () => {
  it("the journey helper text explains the intake AFTER it, not before", () => {
    expectOrder(
      read("app/[locale]/dashboard/company/page.tsx"),
      ['data-testid="demand-intake-section"', 'data-testid="journey-progress-helper"'],
      "company intake helper",
    );
  });
});

describe("invitations are read where they are rendered (W3 row 6)", () => {
  it("the work context reads them once, and the panel renders them once", () => {
    const server = read("lib/world-state/work-context-server.ts");
    expect(
      (server.match(/listMyPendingWorkerInvitations\(\)/g) ?? []).length,
      "one read",
    ).toBe(1);
    const panel = read("components/app/world-state/context-panel.tsx");
    expect((panel.match(/<WorkerInvitations\b/g) ?? []).length, "one mount").toBe(1);
    // The helper is request-cached, so the spine's count and this read are
    // still the same single query in one SSR pass.
    expect(read("lib/worker/invitations.ts")).toMatch(
      /export const listMyPendingWorkerInvitations = cache\(/,
    );
  });
});
