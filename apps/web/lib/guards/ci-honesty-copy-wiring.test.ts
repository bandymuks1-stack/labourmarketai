import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CI-wiring guard for the honesty-copy gates (finding F-Q3 of the
 * full-project audit 2026-07-02) — mirrors the pattern of
 * ci-primary-route-smoke-wiring.test.ts so the steps cannot be silently
 * dropped from the quality workflow again.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const workflow = readFileSync(
  join(REPO_ROOT, ".github/workflows/quality.yml"),
  "utf-8",
);

describe("quality.yml runs the honesty-copy gates", () => {
  for (const script of [
    "check:fit-signal-copy",
    "check:pilot-honesty-copy",
    "check:pricing-honesty-copy",
  ]) {
    it(`runs ${script}`, () => {
      expect(workflow).toContain(script);
    });
  }
});
