import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRODUCTION WALKS RUN ONE AT A TIME (owner decision 2026-10-26: tests must
 * not worsen real people's experience). The walk workflow sets PROD_QA_WALK=1;
 * with parallel workers our own sweeps loaded the live site and distorted the
 * very latency they measured.
 */
const WEB = join(__dirname, "..", "..");
const config = readFileSync(join(WEB, "playwright.config.ts"), "utf8");
const workflow = readFileSync(join(WEB, "..", "..", ".github", "workflows", "prod-qa-walk.yml"), "utf8");

describe("production walks are serial", () => {
  it("one worker and no file-level parallelism when PROD_QA_WALK=1", () => {
    expect(config).toMatch(/const PROD_WALK = process\.env\.PROD_QA_WALK === "1";/);
    expect(config).toMatch(/fullyParallel: !LOCAL_STACK && !PROD_WALK,/);
    expect(config).toMatch(/workers: LOCAL_STACK \|\| PROD_WALK \? 1 : undefined,/);
  });

  it("the walk workflow is what sets PROD_QA_WALK=1", () => {
    expect(workflow).toMatch(/PROD_QA_WALK: "1"/);
  });
});
