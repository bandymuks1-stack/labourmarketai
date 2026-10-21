import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Defects on a project (WRK-8): a defect list that could not be read is
 * UNKNOWN, not "no defects" (SEP-7).
 *
 * Before this guard the reader answered any non-migration read error with
 * `{ applied: true, defects: [] }`, and the operations board then said "no
 * defects reported" about a project whose defects simply were not read — the
 * one sentence a manager signs a handover on.
 */
const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");

describe("a failed defects read is said, never shown as an empty list", () => {
  it("the reader marks a failed read", () => {
    const reader = read("lib/quality/quality.ts");
    expect(reader).toMatch(/readFailed:\s*true/);
    // The old silent answer is gone.
    expect(reader).not.toMatch(/return \{ applied: true, defects: \[\] \};/);
  });

  it("the model carries the flag", () => {
    expect(read("lib/quality/quality-model.ts")).toMatch(/readFailed\?: true/);
  });

  it("the panel says it could not read, before it ever says 'empty'", () => {
    const panel = read("components/app/project-defects-panel.tsx");
    const failed = panel.indexOf('data-testid="defects-read-failed"');
    const empty = panel.indexOf('data-testid="defects-empty"');
    expect(failed).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(failed);
  });
});
