/**
 * Universal profession-directions neutrality guard.
 *
 * The worker-intake starter list (PROFESSION_DIRECTIONS) must not lead with a
 * single-sector bloc. It previously opened with 17 construction/trades slugs
 * before the universal families; that ordering bias implied a default sector.
 * This guard locks a sector-neutral ordering (alphabetical by slug) and asserts
 * the list spans multiple sectors with construction as a minority of the front.
 * Part of the Universal Labour-Market Realignment (owner directive 2026-07-17).
 */
import { describe, it, expect } from "vitest";
import { PROFESSION_DIRECTIONS } from "@/lib/staffing/worker-intake";

/** Construction/trades slugs present in the starter set. */
const CONSTRUCTION_SLUGS = new Set<string>([
  "carpenter",
  "concrete_worker",
  "drywaller",
  "electrician",
  "formwork_carpenter",
  "general_laborer",
  "hvac_ventilation",
  "mason",
  "painter",
  "plasterer",
  "plumber",
  "rebar_worker",
  "roofer",
  "tiler",
  "welder",
]);

/** Clearly non-construction professions that must be present (diversity). */
const REQUIRED_NON_CONSTRUCTION = [
  "software_developer",
  "teacher",
  "caregiver",
  "driver",
  "office_administrator",
];

describe("profession-directions starter list is sector-neutral", () => {
  it("is ordered neutrally (alphabetical by slug — no sector bloc leads)", () => {
    const sorted = [...PROFESSION_DIRECTIONS].sort((a, b) => a.localeCompare(b));
    expect([...PROFESSION_DIRECTIONS]).toEqual(sorted);
  });

  it("spans multiple sectors (required non-construction professions present)", () => {
    for (const slug of REQUIRED_NON_CONSTRUCTION) {
      expect(PROFESSION_DIRECTIONS as readonly string[]).toContain(slug);
    }
  });

  it("does not open with a construction-only bloc (front is mixed)", () => {
    const front = PROFESSION_DIRECTIONS.slice(0, 6);
    const nonConstructionInFront = front.filter(
      (s) => !CONSTRUCTION_SLUGS.has(s),
    );
    expect(
      nonConstructionInFront.length,
      `first entries must not be a single-sector bloc: ${front.join(", ")}`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("construction is a minority of the whole starter set", () => {
    const construction = PROFESSION_DIRECTIONS.filter((s) =>
      CONSTRUCTION_SLUGS.has(s),
    ).length;
    expect(construction * 2).toBeLessThan(PROFESSION_DIRECTIONS.length);
  });
});
