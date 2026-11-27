import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE ORGANIZATION HOME'S APPROVALS CARD SAYS ONLY WHAT IS NEEDED (owner
 * decisions 0032 and 0034, 2026-11-24). The title carries the count
 * ("Waiting for approval: 0"); under it, no sentence repeats or explains it.
 * Kept: the people link, the review-off consequence, the own-entries line.
 */
const SRC = readFileSync(join(__dirname, "..", "..", "components/app/arena/confirm-pulse.tsx"), "utf8");

describe("organization approvals card: no explanatory text", () => {
  it("draws nothing when no entry waits — the title's count says it", () => {
    expect(SRC).toMatch(/<QuickConfirmQueue[\s\S]*?empty=\{false\}/);
    expect(SRC).not.toMatch(/t\("noEmployees"\)|t\("emptyNext"\)|t\("emptyTitle"\)/);
  });

  it("has no 'what this is' line above the waiting entries", () => {
    expect(SRC).not.toMatch(/t\("what"\)/);
  });

  it("keeps the real actions and the consequence line", () => {
    expect(SRC).toContain('data-testid="organization-approvals-people"');
    expect(SRC).toContain('data-testid="organization-approvals-review-off"');
    expect(SRC).toContain('data-testid="organization-approvals-all"');
  });
});
