import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * UNKNOWN ≠ ZERO (SEP-7). The 2026-11-03 system audit found five places that
 * turned a FAILED read into 0, or into a confirmed figure, after the guards
 * that pin each surface's happy path had passed. Each was a real person
 * told something false: "nothing waiting", "○ empty", "log your first entry",
 * "0 skills / skills missing", or self-approved hours counted as confirmed.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("audit 2026-11-03: a failed read never renders as 0", () => {
  it("company home keeps an unreadable client-review count as null", () => {
    const src = read("app/[locale]/dashboard/company/page.tsx");
    expect(src).not.toMatch(/clientToDecide \?\? 0/);
    expect(src).toMatch(/count: clientToDecide,/);
  });

  it("profile completeness leaves out a card whose count read failed", () => {
    const src = read("app/[locale]/dashboard/profile/page.tsx");
    expect(src).toMatch(/projectLinkedEntryCount = projCountRes\.error \? null :/);
    expect(src).toMatch(/certificateDocCount = certDocsRes\.error \? null :/);
    expect(src).toMatch(/cards\.filter\(\(c\): c is CvSectionCard => c\.filled !== null\)/);
  });

  it("Learning Compass carries an unreadable journal count as null", () => {
    const src = read("lib/learning/learning-compass.ts");
    expect(src).toMatch(/r\.error \? null : \(r\.count \?\? 0\)/);
    expect(src).toMatch(/\.catch\(\(\) => null\)/);
    const model = read("lib/learning/learning-compass-model.ts");
    expect(model).toMatch(/readonly journalEntryCount: number \| null;/);
    expect(model).toMatch(/input\.journalEntryCount === 0\) next\.push\("log_first_entry"\)/);
  });

  it("the chat criteria snapshot carries unreadable counts as null", () => {
    const src = read("lib/conversation/worker-activity.ts");
    expect(src).toMatch(/skillsCount: skills\.error \? null :/);
    expect(src).toMatch(/documentsCount: documents\.error \? null :/);
  });

  it("work intelligence is unknown when the subject cannot be read", () => {
    const src = read("lib/journal/work-intelligence-read.ts");
    expect(src).toMatch(/skillsRead\.error \|\| subjectRead\.error\) return null;/);
    expect(src).not.toMatch(/Unreadable = the plain latest decision/);
  });
});
