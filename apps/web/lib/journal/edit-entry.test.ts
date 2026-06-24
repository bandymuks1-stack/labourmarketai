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
      workDate: null,
      time: null,
      quantity: null,
      workDirectionSlug: null,
      siteName: null,
      institutionName: null,
      topic: null,
      skillSlugs: [],
    });
  });
});
