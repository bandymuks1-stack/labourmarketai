import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isSyntheticFixtureLabel } from "../qa/synthetic-fixture";
import { needWalkAddress, needWalkCompany, needWalkDescription, needWalkRun } from "./prod-qa-need-walk";

const REPO = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

describe("the need-intake walk's synthetic mark", () => {
  const run = needWalkRun({ GITHUB_RUN_ID: "43300000001", GITHUB_RUN_ATTEMPT: "2" } as NodeJS.ProcessEnv);

  it("is unique per run attempt and never takes an unexpected value from the environment", () => {
    expect(run).toBe("43300000001.2");
    expect(needWalkRun({ GITHUB_RUN_ID: "a b@c", GITHUB_RUN_ATTEMPT: "" } as NodeJS.ProcessEnv)).toBe("local.1");
  });

  it("uses an address that can receive no mail, in the shape the clean-up script and the owner's SQL match", () => {
    const address = needWalkAddress(run);
    expect(address).toBe("qa.synthetic.need.43300000001.2@example.invalid");
    const shape = /\^qa\\\.synthetic\\\.need\\\.\[a-z0-9\]\+\\\.\[a-z0-9\]\+@example\\\.invalid\$/;
    expect(read("apps/web/scripts/prod-qa-need-intake.ts")).toMatch(shape);
    expect(read("docs/qa/need-intake-walk-cleanup.sql")).toMatch(shape);
  });

  it("marks the company and the description the way the product recognises synthetic rows", () => {
    expect(needWalkCompany(run).startsWith("QA-SYNTHETIC")).toBe(true);
    expect(needWalkDescription(run).startsWith("QA-SYNTHETIC")).toBe(true);
    expect(isSyntheticFixtureLabel(needWalkCompany(run))).toBe(true);
  });
});

describe("the two writing walks are wired fail-closed", () => {
  const workflow = read(".github/workflows/prod-qa-walk.yml");
  it("the sign-up clean-up runs only after a precheck that passed, and always then", () => {
    expect(workflow).toMatch(/if: always\(\) && needs\.debounce\.outputs\.spec == 'signup-form' && steps\.signup_precheck\.outcome == 'success'/);
    expect(workflow).toMatch(/prod-qa-signup-form\.ts --i-understand-production --precheck/);
    expect(workflow).toMatch(/prod-qa-signup-form\.ts --i-understand-production --cleanup/);
  });
  it("the need read-back runs whatever the walk's outcome", () => {
    expect(workflow).toMatch(/if: always\(\) && needs\.debounce\.outputs\.spec == 'need-intake' && steps\.walk\.outcome != 'skipped'/);
  });
  it("neither walk is in the push or schedule rotation", () => {
    const rotation = /ROTATION=\(([^)]*)\)/.exec(workflow)?.[1] ?? "";
    expect(rotation).not.toMatch(/signup-form|need-intake/);
  });
});
