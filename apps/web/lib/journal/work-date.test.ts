import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkWorkDate, isValidIsoDate } from "./work-date";

const NOW = new Date("2026-10-02T10:00:00Z");
const DOC = { requireDate: true, rejectFuture: true };
const FREE = { requireDate: false, rejectFuture: false };

describe("checkWorkDate", () => {
  it("document-drafted entries require an explicit date", () => {
    expect(checkWorkDate("", DOC, NOW)).toEqual({ code: "work_date_required" });
    expect(checkWorkDate("   ", DOC, NOW)).toEqual({
      code: "work_date_required",
    });
  });
  it("rejects malformed and impossible dates", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "02/10/2026", "yesterday"]) {
      expect(checkWorkDate(bad, DOC, NOW)).toEqual({
        code: "work_date_invalid",
        reason: "format",
      });
    }
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });
  it("rejects a future work date for document imports, tolerating timezones", () => {
    expect(checkWorkDate("2026-10-03", DOC, NOW)).toBeNull();
    expect(checkWorkDate("2026-10-04", DOC, NOW)).toEqual({
      code: "work_date_invalid",
      reason: "future",
    });
  });
  it("accepts a past date", () => {
    expect(checkWorkDate("2026-09-01", DOC, NOW)).toBeNull();
  });
  it("the pure function still supports an optional date with no future rule (callers opt in)", () => {
    expect(checkWorkDate("", FREE, NOW)).toBeNull();
    expect(checkWorkDate("2030-01-01", FREE, NOW)).toBeNull();
    expect(checkWorkDate("garbage", FREE, NOW)?.code).toBe("work_date_invalid");
  });
  it("a free-form entry refuses a future day too — a journal entry is a FACT (audit 2026-10-16, J-1)", () => {
    const COMPOSER = { requireDate: false, rejectFuture: true };
    expect(checkWorkDate("", COMPOSER, NOW)).toBeNull();
    expect(checkWorkDate("2026-10-03", COMPOSER, NOW)).toBeNull();
    expect(checkWorkDate("2030-01-01", COMPOSER, NOW)).toEqual({
      code: "work_date_invalid",
      reason: "future",
    });
  });
});

describe("document draft work date wiring", () => {
  const core = readFileSync(join(__dirname, "journal-write-core.ts"), "utf8");
  const form = readFileSync(
    join(__dirname, "../../components/app/document-journal-draft-form.tsx"),
    "utf8",
  );
  it("the write core validates the date BEFORE any insert and requires it for a source document", () => {
    const check = core.indexOf("checkWorkDate(workDate");
    expect(check).toBeGreaterThan(0);
    expect(core).toContain("requireDate: sourceDocumentFileId !== \"\"");
    // EVERY transport (composer, chat, MCP) refuses a future work day — the
    // document path was the only one that did until audit 2026-10-16 (J-1).
    expect(core).toContain("rejectFuture: true,");
    expect(core).not.toContain("rejectFuture: sourceDocumentFileId");
    // and so does a CORRECTION (supersede) — an edit may not re-date work into the future
    const actions = readFileSync(join(__dirname, "actions.ts"), "utf8");
    expect(actions).toContain('checkWorkDate(workDate, { requireDate: false, rejectFuture: true })');
    expect(actions.indexOf("checkWorkDate(workDate")).toBeLessThan(actions.indexOf('("journal_entry_supersede'));
    expect(check).toBeLessThan(core.indexOf('("create_journal_entry_full", rpcParams)'));
    expect(core.indexOf('("create_journal_entry_full", rpcParams)')).toBeGreaterThan(0);
  });
  it("still writes the work_date metric from the validated value", () => {
    expect(core).toMatch(/metric_slug: "work_date",\s*value_text: workDate/);
  });
  it("the review form has a required, empty-by-default date input and no invented default", () => {
    expect(form).toContain('name="work_date"');
    expect(form).toMatch(/name="work_date"[\s\S]{0,80}required/);
    expect(form).toContain('defaultValue=""');
    expect(form).not.toMatch(/work_date[\s\S]{0,200}new Date\(\)\.toISOString/);
  });
  it("clears ?draftFrom after a successful save", () => {
    expect(form).toContain("clearDraftFromUrl()");
    expect(form).toContain('searchParams.delete("draftFrom")');
  });
});
