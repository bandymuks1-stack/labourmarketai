import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LIVING CV'S JOURNAL EVIDENCE COMES FROM LIVE, COUNTED-ONCE ENTRIES ONLY,
 * AND FROM EVERY ONE OF THEM (audit 2026-10-20).
 * - A skill removed in a correction kept its link on the superseded entry and
 *   still printed as journal-backed evidence (Living CV + EU CV).
 * - The entries and links were read unpaged: past 1000 rows the CV worked from
 *   an arbitrary subset while the hour totals (paged) were complete.
 */
const src = readFileSync(resolve(__dirname, "..", "cv-export", "verified-cv.ts"), "utf8");

describe("verified CV reads its evidence completely and from live entries", () => {
  it("entries and skill links are paged on a stable order", () => {
    expect(src).toMatch(/readAllPages<EntrySkillLinkRow>\(\(\) =>[\s\S]*?\.order\("journal_entry_id", \{ ascending: true \}\)\s*\.order\("skill_id", \{ ascending: true \}\)/);
    expect(src).toMatch(/readAllPages<CvEntryRow>\(\(\) =>[\s\S]*?\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/);
  });
  it("skill evidence counts only links of live, counted-once entries", () => {
    expect(src).toMatch(/const countedEntryIds = new Set\(\s*cvLiveEntries\(/);
    expect(src).toMatch(/\.filter\(\(l\) => countedEntryIds\.has\(l\.journal_entry_id\)\)/);
  });
  it("claims and confirmations are read in paged chunks, never one capped .in()", () => {
    expect(src).toMatch(/async function readByIdChunks<T>/);
    expect(src).toMatch(/readByIdChunks<[\s\S]*?>\(liveEntryIds, \(ids\) =>/);
  });
});
