import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isRecordedEngagement } from "./work-history-model";

/**
 * AN ARCHIVED ORGANIZATION WITH NO NAME IS NOT HISTORY (#3354). Retiring a
 * test organization archived it and ended the person's engagement there with
 * a system-written end date — the only thing the row still said, so the CV
 * printed an "unnamed organization" entry.
 */
describe("which rows are history", () => {
  const ended = { title: null, started_at: null, ended_at: "2026-09-23" };

  it("an archived organization with no name and no title: not history", () => {
    expect(isRecordedEngagement({ ...ended, organizationName: null, organizationArchived: true })).toBe(false);
  });

  it("an archived organization WITH a name stays: a business that closed is real history", () => {
    expect(isRecordedEngagement({ ...ended, organizationName: "Closed Ltd", organizationArchived: true })).toBe(true);
  });

  it("a title the person gave keeps the row, archived or not", () => {
    expect(
      isRecordedEngagement({ ...ended, title: "Site foreman", organizationName: null, organizationArchived: true }),
    ).toBe(true);
  });

  it("an unnamed but NOT archived organization keeps its dated row (unchanged)", () => {
    expect(isRecordedEngagement({ ...ended, organizationName: null, organizationArchived: false })).toBe(true);
    expect(isRecordedEngagement({ ...ended, organizationName: null })).toBe(true);
  });

  it("the personal scaffold row is still not history (unchanged)", () => {
    expect(isRecordedEngagement({ title: null, started_at: null, ended_at: null, organizationName: null })).toBe(false);
  });
});

describe("both CV readers pass the archived flag", () => {
  const web = process.cwd();
  it("the verified CV and the one experience reader read archived_at and hand it to the rule", () => {
    for (const f of ["lib/cv-export/verified-cv.ts", "lib/journal/professional-experience-read.ts"]) {
      const src = readFileSync(join(web, f), "utf8");
      expect(src, f).toMatch(/organizations\(display_name, legal_name[^)]*archived_at\)/);
      expect(src, f).toMatch(/organizationArchived: (isArchivedOrganizationRow\(|e\.organizationArchived)/);
    }
  });
});
