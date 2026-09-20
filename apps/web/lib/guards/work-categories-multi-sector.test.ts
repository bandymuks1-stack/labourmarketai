import { describe, it, expect } from "vitest";
import {
  WORK_CATEGORIES,
  ALL_WORK_TYPE_SLUGS,
  buildWorkCategoryOptions,
} from "@/lib/taxonomy/work-categories";

/**
 * Locks the P0 work taxonomy as a broad, multi-sector list so the intake/need
 * selects can never silently regress to a construction-only menu (which made
 * the product read as a construction platform). Config-only; no fake taxonomy.
 */
describe("P0 work-category taxonomy is broad, not construction-only", () => {
  it("offers at least the ten P0 sectors", () => {
    expect(WORK_CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });

  it("construction is one sector among many, not the whole list", () => {
    const construction = WORK_CATEGORIES.filter((c) => c.key === "construction");
    expect(construction).toHaveLength(1);
    const nonConstruction = WORK_CATEGORIES.filter((c) => c.key !== "construction");
    expect(nonConstruction.length).toBeGreaterThanOrEqual(8);
  });

  it("covers the required broad sectors", () => {
    const keys = new Set(WORK_CATEGORIES.map((c) => c.key));
    for (const required of [
      "construction",
      "manufacturing",
      "warehouse_logistics",
      "transport",
      "agriculture",
      "cleaning_facility",
      "hospitality_food",
      "care_support",
      "machinery_operators",
      "other",
    ] as const) {
      expect(keys.has(required), `missing sector ${required}`).toBe(true);
    }
  });

  // Widened 2026-09-20: nl + de added to the pinned label key set. NL and DE
  // have been ACTIVE UI locales since 2026-07-11, but the taxonomy carried no
  // Dutch/German labels, so those visitors were served Lithuanian names.
  it("every sector has at least one work type and full lt/en/ru/nl/de labels", () => {
    for (const c of WORK_CATEGORIES) {
      expect(c.types.length, `${c.key} has no work types`).toBeGreaterThanOrEqual(1);
      for (const label of [c, ...c.types]) {
        expect(label.lt.length).toBeGreaterThan(0);
        expect(label.en.length).toBeGreaterThan(0);
        expect(label.ru.length).toBeGreaterThan(0);
        expect(label.nl.length, `${c.key}: missing nl label`).toBeGreaterThan(0);
        expect(label.de.length, `${c.key}: missing de label`).toBeGreaterThan(0);
      }
    }
  });

  // Added 2026-09-20 with the same fix: the resolver used to fall through to
  // the Lithuanian label for nl/de, which is the exact leak this pins shut.
  it("resolves nl and de to Dutch/German sector names, not Lithuanian", () => {
    const lt = buildWorkCategoryOptions("lt");
    const nl = buildWorkCategoryOptions("nl");
    const de = buildWorkCategoryOptions("de");

    expect(nl[0].sector).toBe("Bouw");
    expect(de[0].sector).toBe("Bau");
    expect(nl[0].sector).not.toBe(lt[0].sector);
    expect(de[0].sector).not.toBe(lt[0].sector);
    expect(nl[0].sector).not.toBe(de[0].sector);

    // work types are localized too, not just the sector heading
    expect(nl[0].options[0].label).toBe("Algemeen bouwmedewerker");
    expect(de[0].options[0].label).toBe("Bauhelfer");
    expect(nl[0].options[0].label).not.toBe(lt[0].options[0].label);
    expect(de[0].options[0].label).not.toBe(lt[0].options[0].label);
  });

  it("an inactive locale still falls back to Lithuanian (unchanged)", () => {
    const lt = buildWorkCategoryOptions("lt");
    expect(buildWorkCategoryOptions("sv")[0].sector).toBe(lt[0].sector);
  });

  it("keeps the core construction slugs (backward compatible)", () => {
    for (const slug of ["general_laborer", "carpenter", "electrician", "welder"]) {
      expect(ALL_WORK_TYPE_SLUGS, `lost backward-compatible slug ${slug}`).toContain(slug);
    }
  });

  it("has no duplicate slugs across sectors", () => {
    expect(new Set(ALL_WORK_TYPE_SLUGS).size).toBe(ALL_WORK_TYPE_SLUGS.length);
  });

  it("builds localized grouped options (labels differ by locale)", () => {
    const lt = buildWorkCategoryOptions("lt");
    const en = buildWorkCategoryOptions("en");
    const ru = buildWorkCategoryOptions("ru");
    expect(lt.length).toBe(WORK_CATEGORIES.length);
    expect(lt[0].sector).not.toBe(en[0].sector);
    expect(en[0].sector).not.toBe(ru[0].sector);
    // first option of the first sector is localized too
    expect(lt[0].options[0].label).not.toBe(en[0].options[0].label);
  });
});
