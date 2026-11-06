import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A FIELD NEVER MAKES iOS ZOOM (DS-1, DS-2): under 16 px, iOS Safari zooms the page
 * when the field takes focus. The real sizes are measured in
 * tests/e2e/auth-field-touch-floor.spec.ts; this pins the one rule that gives them.
 */
const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
const rule = /@media \(max-width: 639\.98px\) \{\s*(input:not\([^)]*\),\s*textarea:not\(\[hidden\]\),\s*select:not\(\[hidden\]\)) \{\s*font-size: 16px;/.exec(css);

describe("text fields at phone width", () => {
  it("are 16 px, by one global rule", () => {
    expect(rule).not.toBeNull();
  });

  it("every selector out-ranks a text utility: a bare select or textarea would lose", () => {
    for (const selector of (rule?.[1] ?? "").split(/,\s*(?=[a-z]+:not)/)) {
      expect(selector, selector).toMatch(/^[a-z]+:not\(/);
    }
  });

  it("the rule is outside any CSS layer, so a text utility cannot beat it", () => {
    const before = css.slice(0, rule?.index ?? 0);
    const opened = (before.match(/\{/g) ?? []).length;
    const closed = (before.match(/\}/g) ?? []).length;
    expect(opened).toBe(closed);
  });

  it("leaves controls without typed text alone", () => {
    for (const type of ["checkbox", "radio", "file", "hidden", "submit"]) {
      expect(rule?.[1]).toContain(`[type="${type}"]`);
    }
  });
});
