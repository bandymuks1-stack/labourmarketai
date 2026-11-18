import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UX_GAPS 2026-11-18 I-5 — the institution's "Add a programme" disclosure
 * and the programme name input are 44 px tap targets on a phone.
 */
const web = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");
const SECTION = read("components/app/institution-programs-section.tsx");
const FORMS = read("components/app/institution-program-forms.tsx");

describe("I-5: institution programme taps", () => {
  it('the "Add a programme" summary carries min-h-11', () => {
    expect(SECTION).toMatch(/<summary className="[^"]*\bmin-h-11\b[^"]*">\{t\("addProgram"\)\}<\/summary>/);
  });
  it("the programme name input carries min-h-11", () => {
    expect(FORMS).toMatch(/<input name="name"[^>]*className=\{`\$\{inputCls\} min-h-11`\}[^>]*data-testid="program-name"/);
  });
});
