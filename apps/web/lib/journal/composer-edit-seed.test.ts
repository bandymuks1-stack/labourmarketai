import { describe, expect, it } from "vitest";

import { seedFragmentsFromEntry } from "@/lib/journal/edit-fragment-seed";
import type { JournalEditingEntry } from "@/lib/journal/edit-entry";

/**
 * An edit saved straight from the editor must keep the entry's per-activity
 * hours: "2 h tiles, 3 h grout" stored as fragment times went to 0 h because
 * the editor's fragment list started empty (audit 2026-10-20).
 */
const entry = {
  id: "e1",
  originalText: "2 val. plytelės, 3 val. siūlės",
  engagementContextId: "c1",
  workDate: "2026-10-19",
  time: null,
  quantity: null,
  workDirectionSlug: null,
  siteName: null,
  institutionName: null,
  topic: null,
  skillSlugs: [],
  moduleFields: {},
  activities: [
    { index: 2, rawPhrase: "3 val. siūlės", activityLabel: "grouting", time: { value: 3, unitSlug: "hours" }, userLabel: null, source: "ai_extracted" },
    { index: 1, rawPhrase: "2 val. plytelės", activityLabel: "tiling", time: { value: 2, unitSlug: "hours" }, userLabel: null, source: "worker_input" },
    { index: 3, rawPhrase: null, activityLabel: null, time: null, userLabel: null, source: null },
  ],
} as unknown as JournalEditingEntry;

describe("an edit starts from the entry's saved activities", () => {
  it("seeds every saved activity as confirmed, in order, with its hours and provenance", () => {
    const seeded = seedFragmentsFromEntry(entry);
    expect(seeded.map((f) => f.rawPhrase)).toEqual(["2 val. plytelės", "3 val. siūlės"]);
    expect(seeded.every((f) => f.status === "confirmed")).toBe(true);
    expect(seeded.reduce((n, f) => n + (f.time?.value ?? 0), 0)).toBe(5);
    expect(seeded.map((f) => f.source)).toEqual(["worker_input", "ai_extracted"]);
  });
  it("a new entry starts with no fragments", () => {
    expect(seedFragmentsFromEntry(null)).toEqual([]);
  });
});
