import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PUBLIC REGISTRY SUMMARY STAYS TRUE AND SAFE (owner decisions 2026-10-21: one
 * registry with real numbers; the public repository keeps only a safe summary).
 *
 * The per-process rows live in the owner's private registry; the public
 * docs/master/LABOURMARKET-FUNCTIONAL-AUDIT.md carries the counts generated from them by
 * .github/scripts/registry-summary.mjs. CI cannot read the private file, so it checks what
 * it can: the public tables add up, and no per-process row has come back into the public
 * repository.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(ROOT, ".github", "scripts", "registry-summary.mjs");
const DOC = join(ROOT, "docs", "master", "LABOURMARKET-FUNCTIONAL-AUDIT.md");

describe("the public functionality registry summary", () => {
  it("its tables add up and match their headline", () => {
    let out = "";
    let failed = false;
    try {
      out = execFileSync(process.execPath, [SCRIPT, "--check"], {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, LM_PRIVATE_REGISTRY: "" },
      });
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string; message?: string };
      out = `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`;
    }
    expect(failed, out).toBe(false);
    expect(out).toMatch(/registry summary current: \d+\/\d+ LIVE_PROVEN/);
  });

  it("carries no per-process rows — the detail is private", () => {
    const doc = readFileSync(DOC, "utf8");
    expect(doc).not.toMatch(/^\|\s*\d+\.\d+\s*\|/m);
    expect(doc).not.toContain("## 2. Per-area status");
    expect(doc).toContain("labourmarket-functionality-registry-v2.md");
  });
});
