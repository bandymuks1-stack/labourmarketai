import { describe, expect, it } from "vitest";
import {
  mapClaimLabelsToCatalogSlugs,
  distinctMappedSlugs,
} from "./claim-catalog-promotion";

/**
 * Canonical-journey P2 — claim → catalogue promotion mapping (pure).
 * The mapping must be exactly the shared deterministic lexicon applied to
 * the label text alone: no fuzzy guessing, no empty-label output, no throw.
 */
describe("mapClaimLabelsToCatalogSlugs", () => {
  it("maps a label whose text triggers the shared lexicon", () => {
    // "plytelių klijavimas" is a core LT tiling needle in SKILL_HINTS_LT.
    const map = mapClaimLabelsToCatalogSlugs(["plytelių klojimas"]);
    const all = distinctMappedSlugs(map);
    // The exact slug comes from the shared lexicon — assert a non-empty,
    // deterministic mapping rather than pinning the slug spelling here.
    expect(all.length).toBeGreaterThan(0);
    // Determinism: same input → same output.
    const again = distinctMappedSlugs(
      mapClaimLabelsToCatalogSlugs(["plytelių klojimas"]),
    );
    expect(again).toEqual(all);
  });

  it("does not invent mappings for out-of-lexicon labels", () => {
    const map = mapClaimLabelsToCatalogSlugs([
      "šunų vedžiojimas parkuose",
      "origami lankstymas",
    ]);
    expect(map.size).toBe(0);
  });

  it("ignores empty / whitespace labels and never throws", () => {
    const map = mapClaimLabelsToCatalogSlugs(["", "   ", "\n"]);
    expect(map.size).toBe(0);
  });

  it("distinctMappedSlugs de-duplicates across labels", () => {
    const map = new Map<string, string[]>([
      ["a", ["x", "y"]],
      ["b", ["y", "z"]],
    ]);
    expect(distinctMappedSlugs(map).sort()).toEqual(["x", "y", "z"]);
  });
});
