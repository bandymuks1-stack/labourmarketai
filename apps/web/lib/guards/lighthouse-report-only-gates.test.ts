import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Plain ESM, shared with the workflow; it does nothing on import.
import { GATES, GATE_NAMES, parseReportOnly, verdictFor } from "../../../../.github/scripts/lighthouse-gate.mjs";

/**
 * LIGHTHOUSE GATES THAT REPORT WITHOUT FAILING.
 *
 * Two of the four release-check gates (LCP, SEO) are not met by the live site and
 * are listed as report-only so the check is not red from its first day. This guard
 * holds the line around that: the list is explicit and short, a report-only miss is
 * still printed as NOT MET, and nothing outside the list is softened.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const workflow = readFileSync(join(REPO, ".github/workflows/release-check.yml"), "utf8");
const good = { accessibility: 100, seo: 100, lcpMs: 2000, cls: 0, tbtMs: 50 };
const only = (names: string) => parseReportOnly(names);

describe("the report-only list", () => {
  it("is set once in the workflow and names exactly LCP and SEO", () => {
    const lines = workflow.split("\n").filter((l) => /^\s*LH_REPORT_ONLY:/.test(l));
    expect(lines.map((l) => l.trim())).toEqual(['LH_REPORT_ONLY: "LCP,SEO"']);
  });

  it("never includes accessibility or CLS", () => {
    const listed = [...only(/LH_REPORT_ONLY: "([^"]*)"/.exec(workflow)?.[1] ?? "")];
    expect(listed).not.toContain("accessibility");
    expect(listed).not.toContain("CLS");
  });

  it("refuses a name that is not a gate", () => {
    expect(() => only("LCP,speed")).toThrow(/names no gate/);
    expect([...only("")]).toEqual([]);
    expect(GATE_NAMES).toEqual(["accessibility", "SEO", "LCP", "CLS"]);
  });
});

describe("a page's verdict", () => {
  it("with no list, every miss fails as before", () => {
    const v = verdictFor({ m: { ...good, lcpMs: 5800, seo: 92 }, indexable: true, got: 3, runs: 3, reportOnly: only("") });
    expect(v).toEqual({ fails: true, reported: [], text: "FAIL: SEO, LCP" });
  });

  it("a report-only miss does not fail, and is printed as NOT MET, never as PASS", () => {
    const v = verdictFor({ m: { ...good, lcpMs: 5800, seo: 92 }, indexable: true, got: 3, runs: 3, reportOnly: only("LCP,SEO") });
    expect(v.fails).toBe(false);
    expect(v.reported).toEqual(["SEO", "LCP"]);
    expect(v.text).toBe("NOT MET (report-only): SEO, LCP");
    expect(v.text).not.toMatch(/PASS/);
  });

  it("accessibility and CLS still fail beside a report-only miss", () => {
    const v = verdictFor({ m: { ...good, lcpMs: 5800, cls: 0.11, accessibility: 90 }, indexable: true, got: 3, runs: 3, reportOnly: only("LCP,SEO") });
    expect(v.fails).toBe(true);
    expect(v.text).toBe("FAIL: accessibility, CLS; NOT MET (report-only): LCP");
  });

  it("a short sample fails whatever the list says", () => {
    const v = verdictFor({ m: good, indexable: true, got: 2, runs: 3, reportOnly: only("LCP,SEO") });
    expect(v.fails).toBe(true);
    expect(v.text).toMatch(/^INCOMPLETE: 2 of 3/);
  });

  it("a page that meets everything is PASS", () => {
    expect(verdictFor({ m: good, indexable: true, got: 3, runs: 3, reportOnly: only("LCP,SEO") })).toEqual({ fails: false, reported: [], text: "PASS" });
    expect(GATES).toEqual({ accessibility: 95, seo: 95, lcpMs: 2500, cls: 0.1 });
  });
});
