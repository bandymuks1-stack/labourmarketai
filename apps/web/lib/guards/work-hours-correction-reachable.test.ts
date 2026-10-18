import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUILT_NOT_CONNECTED sweep — hours somebody is paid from could be recorded
 * and never corrected.
 *
 * `recordCorrectionAction` writes a NEW allocation carrying `correction_of`
 * and stamps the original's `superseded_by`, so both numbers and the link
 * between them survive; every read in `lib/work-hours/allocations.ts` already
 * filters `superseded_by is null`, so a corrected row leaves the lists by
 * itself. Production carries the columns, the `authenticated` UPDATE grant
 * and the `manages_organization(...) OR owns_worker(...)` update policy that
 * make it work — and 0 superseded rows, because no surface could reach it.
 *
 * This guard pins the CONNECTION and its limits. Static file pinning only.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

const UI = stripTs(read("components/app/work-hours-quick-entry.tsx"));
const DATA = stripTs(read("lib/work-hours/hours-page-data.ts"));
const ACTIONS = stripTs(read("lib/work-hours/allocations-actions.ts"));
const READS = stripTs(read("lib/work-hours/allocations.ts"));

describe("1. the correction path is reachable", () => {
  it("the entry surface calls the built action", () => {
    expect(UI).toMatch(/recordCorrectionAction/);
    expect(UI).toMatch(/useActionState\(\s*recordCorrectionAction/);
  });

  it("every entry row carries its own control", () => {
    expect(UI).toMatch(/data-testid=\{`hours-correct-\$\{e\.id\}`\}/);
    expect(UI).toMatch(/data-testid="hours-correction-form"/);
  });

  it("the form names the original it supersedes", () => {
    expect(UI).toMatch(/name="original_id" value=\{e\.id\}/);
  });
});

describe("2. a correction fixes what was recorded — never who or when", () => {
  it("worker and date are carried, not re-opened", () => {
    expect(UI).toMatch(/<input type="hidden" name="worker_id" value=\{e\.workerId\} \/>/);
    expect(UI).toMatch(/<input type="hidden" name="work_date" value=\{workDate\} \/>/);
    const form = UI.slice(
      UI.indexOf('data-testid="hours-correction-form"'),
      UI.indexOf('data-testid="hours-correction-save"'),
    );
    // No editable control may be offered for either field.
    expect(form).not.toMatch(/name="worker_id"[^>]*(?:select|type="date")/);
    expect(form).not.toMatch(/<select[^>]*name="worker_id"/);
    expect(form).not.toMatch(/<input[^>]*name="work_date"[^>]*type="date"/);
  });

  it("only one entry is open at a time — this is not a bulk edit", () => {
    expect(UI).toMatch(/const \[correcting, setCorrecting\] = useState<string \| null>\(null\)/);
    expect(UI).toMatch(/setCorrecting\(correcting === e\.id \? null : e\.id\)/);
  });
});

describe("3. nothing is destroyed", () => {
  it("the action supersedes rather than overwrites", () => {
    expect(ACTIONS).toMatch(/correction_of: originalId/);
    expect(ACTIONS).toMatch(/superseded_by: created\.allocationId/);
    expect(ACTIONS).not.toMatch(/\.delete\(/);
  });

  it("a superseded row leaves every list by the read filter that already existed", () => {
    // Three reads, one rule.
    expect(READS.match(/\.is\("superseded_by", null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe("4. the ids the pre-fill needs are opaque and nothing more", () => {
  it("HoursPageEntry gained exactly the two ids", () => {
    const type = DATA.slice(
      DATA.indexOf("export type HoursPageEntry"),
      DATA.indexOf("export type HoursPageData"),
    );
    expect(type).toMatch(/readonly workerId: string;/);
    expect(type).toMatch(/readonly workObjectId: string;/);
    // No contact field of any kind rides along with them.
    expect(type).not.toMatch(/email|phone|profileId/i);
  });
});

describe("5. a refused correction is not silent", () => {
  it("the correction has its own error line", () => {
    expect(UI).toMatch(/const correctionError = errorText\(correction\)/);
    expect(UI).toMatch(/\{correctionError \?/);
  });

  it("the entry form's own error is still separate", () => {
    expect(UI).toMatch(/const error = errorText\(state\)/);
  });
});
