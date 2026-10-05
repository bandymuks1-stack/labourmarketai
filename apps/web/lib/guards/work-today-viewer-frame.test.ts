import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Work-date timezone rule (2026-10-05): a work_date is the person's LOCAL
 * calendar day, so every hours / entries / calendar reader must take "today"
 * from `viewerWorkToday()` (lib/time/viewer-day.ts), never from the server's
 * UTC day — that dropped Lithuanian entries made between local and UTC
 * midnight as "future".
 */
const READERS = [
  "lib/journal/work-intelligence-read.ts",
  "lib/journal/journal-window-report.ts",
  "lib/projects/project-hours.ts",
  "lib/worker/weekly-intelligence.ts",
  "lib/planning/planning.ts",
  "lib/planning/calendar-result.ts",
  "lib/planning/organization-today.ts",
  "lib/world-state/work-context-server.ts",
  "app/[locale]/dashboard/journal/page.tsx",
  "app/[locale]/dashboard/hours/page.tsx",
  "app/[locale]/dashboard/planning/page.tsx",
  "app/[locale]/dashboard/planning/timesheets-section.tsx",
  "app/[locale]/dashboard/projects/[id]/operations/page.tsx",
  "app/[locale]/dashboard/journal/hours/route.ts",
  "app/[locale]/cv/page.tsx",
];
const root = join(__dirname, "..", "..");

describe("hours/entries readers judge today in the viewer's frame", () => {
  it.each(READERS)("%s does not derive today from the UTC server day", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    expect(src).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/);
    expect(src).not.toMatch(/utcTodayKey\(\)/);
    expect(src).toMatch(/viewerWorkToday|workIntelligenceToday/);
  });
  it("the viewer zone is reported by the client in the locale layout", () => {
    const layout = readFileSync(join(root, "app/[locale]/layout.tsx"), "utf8");
    expect(layout).toContain("<ViewerTimeZone />");
  });
});
