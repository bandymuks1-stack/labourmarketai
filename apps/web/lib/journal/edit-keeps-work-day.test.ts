import { describe, expect, it } from "vitest";

import { buildEditingEntry } from "./edit-entry";
import { resolveWorkDay } from "./work-time";

/** An edit keeps the day the entry is counted on (audit 2026-10-20): an entry
 *  with no stated work date used to be moved to the edit day. */
describe("an edit keeps the entry's work day", () => {
  it("an entry WITHOUT a work_date metric starts the edit on the day it is counted on", () => {
    const createdAt = "2026-09-03T08:15:00Z";
    const e = buildEditingEntry({ id: "e", originalText: "t", metrics: [], createdAt });
    expect(e.workDate).toBe(resolveWorkDay([], createdAt));
    expect(e.workDate).not.toBe(new Date().toISOString().slice(0, 10));
  });
  it("a stated work date wins", () => {
    const e = buildEditingEntry({
      id: "e",
      originalText: "t",
      metrics: [{ metric_slug: "work_date", value_text: "2026-08-01", value_numeric: null, unit_slug: null }],
      createdAt: "2026-09-03T08:15:00Z",
    });
    expect(e.workDate).toBe("2026-08-01");
  });
  it("without either, the editor decides (unchanged)", () => {
    expect(buildEditingEntry({ id: "e", originalText: "t", metrics: [] }).workDate).toBeNull();
  });
});
