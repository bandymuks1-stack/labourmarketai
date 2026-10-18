import { describe, expect, it } from "vitest";
import { aggregateConfirmedWork, entryWorkDay, type ConfirmedEntryRow } from "./confirmed-work-read";
import { deriveConfirmedWorkTier } from "./evidence-tier";

const confirm = (at: string, by = "mgr", action = "confirm") => ({
  confirmation_scope: { action },
  created_at: at,
  confirmer_id: by,
});
const row = (over: Partial<ConfirmedEntryRow>): ConfirmedEntryRow => ({
  worker_id: "w1",
  created_at: "2026-09-01T08:00:00Z",
  journal_entry_confirmations: [confirm("2026-09-02T08:00:00Z")],
  journal_entry_skills: [{ skills: { slug: "tiling" } }],
  journal_entry_metrics: [],
  ...over,
});
const profiles = new Map([["w1", "p1"]]);

describe("aggregateConfirmedWork", () => {
  it("counts independently-confirmed entries and distinct work days per skill", () => {
    const m = aggregateConfirmedWork(
      [
        row({}),
        row({ created_at: "2026-09-02T08:00:00Z" }),
        row({
          created_at: "2026-09-05T08:00:00Z",
          journal_entry_metrics: [{ metric_slug: "work_date", value_text: "2026-09-02" }],
        }),
      ],
      profiles,
    );
    const c = m.get("w1")!.get("tiling")!;
    expect(c.confirmedWorkEntries).toBe(3);
    expect(c.confirmedDays).toBe(2); // 09-01, 09-02 (work_date wins over created_at)
    expect(deriveConfirmedWorkTier(c)).toBe("repeated_confirmed");
  });

  it("a self-confirmation, a rejection, or a later reject does not count", () => {
    const m = aggregateConfirmedWork(
      [
        row({ journal_entry_confirmations: [confirm("2026-09-02T08:00:00Z", "p1")] }),
        row({ journal_entry_confirmations: [confirm("2026-09-02T08:00:00Z", "mgr", "reject")] }),
        row({
          journal_entry_confirmations: [
            confirm("2026-09-02T08:00:00Z"),
            confirm("2026-09-03T08:00:00Z", "mgr", "reject"),
          ],
        }),
      ],
      profiles,
    );
    expect(m.size).toBe(0);
  });

  it("one entry counts once per skill and unknown workers/skills add nothing", () => {
    const m = aggregateConfirmedWork(
      [
        row({
          journal_entry_skills: [
            { skills: { slug: "tiling" } },
            { skills: { slug: "tiling" } },
            { skills: { slug: "grouting" } },
            { skills: null },
          ],
        }),
      ],
      profiles,
    );
    expect(m.get("w1")!.get("tiling")!.confirmedWorkEntries).toBe(1);
    expect(m.get("w1")!.get("grouting")!.confirmedWorkEntries).toBe(1);
    expect(m.get("w2")).toBeUndefined();
  });

  it("work day falls back to the recorded day", () => {
    expect(entryWorkDay(row({}))).toBe("2026-09-01");
    expect(entryWorkDay(row({ created_at: null }))).toBeNull();
  });
});
