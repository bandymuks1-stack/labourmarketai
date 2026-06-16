import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Final launch readiness guard (full-completion train PR 10).
 *
 * The final launch readiness report exists, documents the closed product chain,
 * confirms billing is disabled, and gives a clear ready-to-invite answer.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const report = join(REPO, "docs", "launch", "final-launch-readiness-report.md");

describe("final launch readiness report", () => {
  it("exists and is substantial", () => {
    expect(existsSync(report)).toBe(true);
    expect(readFileSync(report, "utf8").length).toBeGreaterThan(1500);
  });

  it("documents the closed product chain", () => {
    const txt = readFileSync(report, "utf8");
    for (const link of [
      "Player Card",
      "Readiness",
      "Match",
      "Communication",
      "Command Center",
      "Trust",
    ]) {
      expect(txt).toContain(link);
    }
  });

  it("confirms billing disabled + Stripe not connected", () => {
    const txt = readFileSync(report, "utf8").toLowerCase();
    expect(txt).toMatch(/billing.*disabled|disabled.*billing|not connected/);
    expect(txt).toMatch(/no live stripe|live stripe|stripe.*not connected/);
  });

  it("gives a clear ready-to-invite answer", () => {
    const txt = readFileSync(report, "utf8");
    expect(txt).toMatch(/Ready to invite first users/i);
    expect(txt).toMatch(/\bYES\b/);
  });
});
