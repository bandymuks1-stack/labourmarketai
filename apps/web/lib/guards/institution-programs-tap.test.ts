import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UX_GAPS 2026-11-18 I-5 — the institution's "Add a programme" disclosure
 * and every field of the programme, cohort and learner forms are 44 px tap
 * targets on a phone. The height lives in the forms' one `inputCls`, so a
 * field added later (the profession select was 40 px) inherits it.
 */
const web = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");
const SECTION = read("components/app/institution-programs-section.tsx");
const FORMS = read("components/app/institution-program-forms.tsx");

describe("I-5: institution programme taps", () => {
  it('the "Add a programme" summary carries min-h-11', () => {
    expect(SECTION).toMatch(/<summary className="[^"]*\bmin-h-11\b[^"]*">\{t\("addProgram"\)\}<\/summary>/);
  });
  it("the forms' one field class carries min-h-11", () => {
    expect(FORMS).toMatch(/const inputCls =\s*"[^"]*\bmin-h-11\b[^"]*";/);
  });
  it("every input, select and textarea that is not hidden uses that class", () => {
    const fields = FORMS.match(/<(input|select|textarea)\b[^>]*>/g) ?? [];
    const visible = fields.filter((f) => !/type="hidden"/.test(f));
    expect(visible.length).toBeGreaterThan(5);
    for (const f of visible) expect(f, f).toMatch(/className=\{inputCls\}/);
  });
});
