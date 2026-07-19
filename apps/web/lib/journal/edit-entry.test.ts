import { describe, expect, it } from "vitest";
import { buildEditingEntry, type EditEntryMetricRow } from "./edit-entry";

/**
 * Owner-smoke follow-up (PR #490): editing a journal entry must preload its FULL
 * saved state, and a text-only edit must not drop date / hours / quantity /
 * direction / skills. These tests pin the pure reconstruction the page feeds the
 * composer.
 */

const m = (
  metric_slug: string,
  value_text: string | null,
  value_numeric: number | null = null,
  unit_slug: string | null = null,
): EditEntryMetricRow => ({ metric_slug, value_text, value_numeric, unit_slug });

describe("buildEditingEntry — full preload", () => {
  const full = buildEditingEntry({
    id: "e1",
    originalText: "Klojau plyteles 6 val, 12 m2",
    metrics: [
      m("work_date", "2026-06-10"),
      m("quantity", null, 6, "hours"),
      m("work_direction", "tiler"),
      m("site_name", "Vilnius objektas"),
      m("institution_name", "VDU"),
      m("topic", "vonios renovacija"),
    ],
    linkedSkillSlugs: ["tiling", "waterproofing", "tiling"],
  });

  it("preloads original text", () => {
    expect(full.originalText).toBe("Klojau plyteles 6 val, 12 m2");
  });
  it("preloads the saved work date (not today)", () => {
    expect(full.workDate).toBe("2026-06-10");
  });
  it("preloads hours from a time-unit quantity metric", () => {
    expect(full.time).toEqual({ value: 6, unitSlug: "hours" });
    expect(full.quantity).toBeNull();
  });
  it("preloads direction / site / institution / topic", () => {
    expect(full.workDirectionSlug).toBe("tiler");
    expect(full.siteName).toBe("Vilnius objektas");
    expect(full.institutionName).toBe("VDU");
    expect(full.topic).toBe("vonios renovacija");
  });
  it("preloads linked skills (deduped)", () => {
    expect(full.skillSlugs).toEqual(["tiling", "waterproofing"]);
  });
});

describe("buildEditingEntry — engagement is preloaded (no silent reassignment)", () => {
  it("carries the entry's OWN engagement so a text edit re-sends it", () => {
    const out = buildEditingEntry({
      id: "e9",
      originalText: "tekstas",
      metrics: [],
      engagementContextId: "eng-agency-b",
    });
    expect(out.engagementContextId).toBe("eng-agency-b");
  });
  it("defaults to null when the entry has no stored engagement", () => {
    const out = buildEditingEntry({ id: "e9", originalText: "x", metrics: [] });
    expect(out.engagementContextId).toBeNull();
  });
});

describe("buildEditingEntry — quantity vs time disambiguation", () => {
  it("a non-time unit becomes quantity, not time", () => {
    const out = buildEditingEntry({
      id: "e2",
      originalText: "12 m2 grindų",
      metrics: [m("quantity", null, 12, "square_meters")],
    });
    expect(out.quantity).toEqual({ value: 12, unitSlug: "square_meters" });
    expect(out.time).toBeNull();
  });
});

describe("buildEditingEntry — text-only edit does not drop structured metrics", () => {
  it("an entry with metrics carries ALL of them into the editing state", () => {
    // The composer preloads these as confirmed and re-sends them on save, so a
    // text-only edit (metrics untouched in the UI) cannot silently drop them.
    const metrics: EditEntryMetricRow[] = [
      m("work_date", "2026-05-01"),
      m("quantity", null, 8, "hours"),
      m("work_direction", "painter"),
    ];
    const out = buildEditingEntry({
      id: "e3",
      originalText: "Dažiau sienas",
      metrics,
      linkedSkillSlugs: ["painting"],
    });
    expect(out.workDate).toBe("2026-05-01");
    expect(out.time).toEqual({ value: 8, unitSlug: "hours" });
    expect(out.workDirectionSlug).toBe("painter");
    expect(out.skillSlugs).toEqual(["painting"]);
  });

  it("a freeform entry with no metrics yields nulls and no skills", () => {
    const out = buildEditingEntry({
      id: "e4",
      originalText: "Tiesiog dirbau",
      metrics: [],
    });
    expect(out).toEqual({
      id: "e4",
      originalText: "Tiesiog dirbau",
      engagementContextId: null,
      workDate: null,
      time: null,
      quantity: null,
      workDirectionSlug: null,
      siteName: null,
      institutionName: null,
      topic: null,
      skillSlugs: [],
      activities: [],
    });
  });
});

describe("buildEditingEntry — index-grouped activity fragments (compact edit)", () => {
  it("pairs each fragment's activity with ITS OWN time by the stored index", () => {
    const out = buildEditingEntry({
      id: "e5",
      originalText: "1 val vairavau, 3 val kasoje",
      metrics: [
        m("parsed_fragment", "1|1 val vairavau"),
        m("fragment_time", "1", 1, "hours"),
        m("fragment_activity", "1|vairavimas"),
        m("parsed_fragment", "2|3 val kasoje"),
        m("fragment_time", "2", 3, "hours"),
        m("fragment_activity", "2|kasininko darbas"),
      ],
    });
    expect(out.activities).toEqual([
      {
        index: 1,
        rawPhrase: "1 val vairavau",
        activityLabel: "vairavimas",
        time: { value: 1, unitSlug: "hours" },
        userLabel: null,
      },
      {
        index: 2,
        rawPhrase: "3 val kasoje",
        activityLabel: "kasininko darbas",
        time: { value: 3, unitSlug: "hours" },
        userLabel: null,
      },
    ]);
  });

  it("keeps a fragment without time and a time without activity separate", () => {
    const out = buildEditingEntry({
      id: "e6",
      originalText: "x",
      metrics: [
        m("parsed_fragment", "1|sandėlio tvarkymas"),
        m("fragment_activity", "1|sandėlio tvarkymas"),
        m("parsed_fragment", "2|dar kažkas"),
        m("fragment_time", "2", 30, "minutes"),
      ],
    });
    expect(out.activities).toHaveLength(2);
    expect(out.activities[0].time).toBeNull();
    expect(out.activities[1].time).toEqual({ value: 30, unitSlug: "minutes" });
    expect(out.activities[1].activityLabel).toBeNull();
  });

  it("carries the unknown-fragment clarification label", () => {
    const out = buildEditingEntry({
      id: "e7",
      originalText: "x",
      metrics: [
        m("parsed_fragment", "1|2 val prie stendo"),
        m("fragment_time", "1", 2, "hours"),
        m("unknown_phrase", "1|2 val prie stendo|stendo montavimas"),
      ],
    });
    expect(out.activities[0].userLabel).toBe("stendo montavimas");
  });

  it("skips malformed index prefixes instead of guessing associations", () => {
    const out = buildEditingEntry({
      id: "e8",
      originalText: "x",
      metrics: [
        m("parsed_fragment", "abc|ne indeksas"),
        m("fragment_time", "not-a-number", 5, "hours"),
      ],
    });
    expect(out.activities).toEqual([]);
  });
});
