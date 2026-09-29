import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE WORK JOURNAL AS A PROFESSIONAL ACTIVITY STREAM (owner command
 * 2026-09-29 §10–§11). Pins the floor this pass set:
 *  - a day reads as a moment in the working stream (today / yesterday /
 *    weekday), its hours in display type, its length drawn against the
 *    longest day on screen — the calendar week's grammar;
 *  - an entry opens with WHERE (the organization it was recorded for + its
 *    OWN site snapshot) and HOW LONG through THE canonical work-time rule —
 *    nothing inherited, nothing invented;
 *  - the worker's words stay first among the words, the technical label
 *    stays for screen readers only.
 */
const ROOT = join(__dirname, "..", "..");
const PAGE = readFileSync(join(ROOT, "app/[locale]/dashboard/journal/page.tsx"), "utf8");

describe("premium journal stream", () => {
  it("a day names itself as today / yesterday / weekday", () => {
    expect(PAGE).toMatch(/t\("stream\.today"\)/);
    expect(PAGE).toMatch(/t\("stream\.yesterday"\)/);
    expect(PAGE).toMatch(/createUtcFormatter\(locale, \{ weekday: "long" \}\)/);
  });

  it("a day's length is drawn against the longest day on screen", () => {
    expect(PAGE).toMatch(/group\.totalMinutes \/ maxDayMinutes/);
  });

  it("an entry head is WHERE · HOW LONG, from the entry's own facts", () => {
    expect(PAGE).toContain("journal-entry-head-");
    expect(PAGE).toMatch(/engagementChips\.get\(e\.engagement_context_id\)\?\.label/);
    expect(PAGE).toMatch(/site\?\.value_text\?\.trim\(\) \|\| null/);
    expect(PAGE).toMatch(/deriveEntryWorkTime\(\{[\s\S]{0,200}\}\)\.totalHours \* 60/);
  });

  it("the technical label is for screen readers; the words come first", () => {
    expect(PAGE).toMatch(/<p className="sr-only">\s*\{t\("entry\.textLabel"\)\}/);
  });
});
