/**
 * Presence + shape guard for the authenticated Estimate Builder e2e.
 *
 * Playwright specs are NOT run by vitest (`pnpm test`), so this lib-level guard
 * records — in CI — that the estimate e2e exists, skips cleanly without a minted
 * session (never hides failures when one is present), and asserts the real
 * deterministic flow against the live testids. It keeps the spec from silently
 * rotting if a testid is renamed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const specPath = resolve(webRoot, "tests/e2e/estimate-flow.spec.ts");
const builderPath = resolve(webRoot, "components/app/estimate-builder.tsx");

describe("estimate e2e spec is present + correctly shaped", () => {
  const spec = existsSync(specPath) ? readFileSync(specPath, "utf-8") : "";

  it("the spec file exists", () => {
    expect(existsSync(specPath)).toBe(true);
  });

  it("skips only when the minted session is ABSENT (no hidden failures)", () => {
    expect(spec).toMatch(/test\.skip\(\s*\n?\s*!existsSync\(STORAGE_STATE\)/);
    expect(spec).toMatch(/test\.use\(\{ storageState: STORAGE_STATE \}\)/);
  });

  it("drives the estimate panel through the real testids", () => {
    for (const id of [
      "estimate-open",
      "estimate-builder",
      "estimate-workerCount",
      "estimate-hoursPerWorker",
      "estimate-rate",
      "estimate-materials",
      "estimate-overheadPercent",
      "estimate-marginPercent",
      "estimate-contingencyPercent",
      "estimate-total",
      "estimate-range",
      "demand-review-estimate",
      "demand-readback-estimate",
    ]) {
      expect(spec.includes(id), `spec should drive ${id}`).toBe(true);
    }
  });

  it("asserts the deterministic total (4731.1) and the read-back estimate", () => {
    expect(spec).toMatch(/toBeCloseTo\(4731\.1/);
    expect(spec).toMatch(/demand-readback-row/);
    expect(spec).toMatch(/before \+ 1/);
  });

  it("checks older rows without an estimate still render", () => {
    expect(spec).toMatch(/rowCount\)\.toBeGreaterThanOrEqual\(estimateCount\)/);
  });

  it("the testids it drives still exist in the builder source", () => {
    const builder = readFileSync(builderPath, "utf-8");
    // Static + dynamic (template-literal) field testids both resolve here.
    expect(builder).toContain('data-testid="estimate-open"');
    expect(builder).toContain('data-testid="estimate-builder"');
    expect(builder).toMatch(/data-testid=\{`estimate-\$\{String\(key\)\}`\}/);
  });
});
