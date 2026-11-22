import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Chrome acceptance matrix 2026-11-21 (scenario 5, subcontractor): on a touch tablet "Add a
 * service" measured 30 px and on a phone 40 px. The services form's actions and fields are
 * 44 px targets on every screen; the field height lives in the section's one `inputCls`.
 */
const SECTION = readFileSync(resolve(__dirname, "..", "..", "components/app/service-offerings-section.tsx"), "utf8");
const tag = (testId: string) => {
  const at = SECTION.indexOf(`data-testid="${testId}"`);
  expect(at, testId).toBeGreaterThan(0);
  return SECTION.slice(at, at + 260);
};

describe("services: 44 px touch targets", () => {
  it("both add buttons and the save button carry min-h-11", () => {
    for (const id of ["service-offering-add", "service-offering-add-partnership", "service-offering-save"]) {
      expect(tag(id), id).toMatch(/className="[^"]*\bmin-h-11\b/);
    }
  });
  it("the cancel button carries min-h-11", () => {
    expect(SECTION).toMatch(/className="min-h-11 [^"]*"\s*>\s*\{labels\.cancel\}/);
  });
  it("the form's one field class carries min-h-11", () => {
    expect(SECTION).toMatch(/const inputCls =\s*"[^"]*\bmin-h-11\b[^"]*";/);
  });
});
