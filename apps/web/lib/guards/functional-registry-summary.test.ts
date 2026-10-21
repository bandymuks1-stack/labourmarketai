import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE ONE FUNCTIONALITY REGISTRY STAYS TRUE (owner order 2026-10-21: one registry, real
 * numbers, "jokių išgalvotų procentų").
 *
 * docs/master/LABOURMARKET-FUNCTIONAL-AUDIT.md §2 holds one row per process; its §1 counts
 * are generated from those rows by .github/scripts/registry-summary.mjs. This guard fails
 * when a row changed and the counts were not regenerated, when a row carries a status
 * outside the owner's vocabulary, or when a row has no owner area or role.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(ROOT, ".github", "scripts", "registry-summary.mjs");

describe("the functionality registry", () => {
  it("its §1 summary is the one the rows produce, and every row is well formed", () => {
    let out = "";
    let failed = false;
    try {
      out = execFileSync(process.execPath, [SCRIPT, "--check"], { encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    expect(failed, out).toBe(false);
    expect(out).toMatch(/registry summary current: \d+ rows/);
  });

  it("a LIVE_PROVEN row names its evidence", () => {
    const doc = readFileSync(join(ROOT, "docs", "master", "LABOURMARKET-FUNCTIONAL-AUDIT.md"), "utf8");
    const section = doc.split("## 2. Per-area status")[1].split("\n## 3.")[0];
    const bare = section
      .split("\n")
      .filter((l) => /^\|\s*\d+\.\d+\s*\|/.test(l))
      .map((l) => l.split("|").map((c) => c.trim()))
      .filter((c) => c[3].startsWith("LIVE_PROVEN") && !/\(.+\)|—\s*\S/.test(c[3]))
      .map((c) => c[1]);
    expect(bare, "LIVE_PROVEN rows without evidence").toEqual([]);
  });
});
