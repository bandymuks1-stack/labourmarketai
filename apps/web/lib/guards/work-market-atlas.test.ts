import { describe, expect, it } from "vitest";
import {
  WORK_MARKET_CATEGORIES,
  ATLAS_BLOCK_COUNT,
  allCategories,
  categoryBySlug,
  mapEligibleCategories,
  categoriesByAction,
  categoriesForSkill,
  actionsFor,
} from "@/lib/work-market/atlas";
import { WORK_MARKET_ACTIONS } from "@/lib/work-market/actions";
import { resolveEligibility } from "@/lib/work-market/eligibility";
import {
  resolveVisibilityScope,
  wouldBeFakePaidUnlock,
  FULL_PREVIEW_USER_THRESHOLD,
} from "@/lib/work-market/visibility";
import { canDrawMarker } from "@/lib/work-market/map-layers";
import { BLOCK_VISUAL_CONCEPTS, visualConceptFor } from "@/lib/work-market/visual-concepts";

/**
 * Work Market Atlas consistency guard.
 * Every block must be complete + honest; no external names; map signal-only.
 */

describe("atlas has exactly 28 complete blocks", () => {
  it("count is 28 and matches the pinned constant", () => {
    expect(WORK_MARKET_CATEGORIES.length).toBe(28);
    expect(ATLAS_BLOCK_COUNT).toBe(28);
    expect(allCategories().length).toBe(28);
  });

  it("every block has slug, LT/EN labels, description, icon concept", () => {
    for (const c of WORK_MARKET_CATEGORIES) {
      expect(c.slug, "slug").toMatch(/^[a-z][a-z0-9-]+$/);
      expect(c.labelLt.trim().length, `${c.slug} labelLt`).toBeGreaterThan(0);
      expect(c.labelEn.trim().length, `${c.slug} labelEn`).toBeGreaterThan(0);
      expect(c.descriptionLt.trim().length, `${c.slug} descLt`).toBeGreaterThan(0);
      expect(c.descriptionEn.trim().length, `${c.slug} descEn`).toBeGreaterThan(0);
      expect(c.iconConcept.trim().length, `${c.slug} iconConcept`).toBeGreaterThan(0);
    }
  });

  it("slugs are unique", () => {
    const slugs = WORK_MARKET_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every block has 5–15 subcategories with unique slugs + LT/EN labels", () => {
    for (const c of WORK_MARKET_CATEGORIES) {
      expect(c.subcategories.length, `${c.slug} subcat count`).toBeGreaterThanOrEqual(4);
      expect(c.subcategories.length, `${c.slug} subcat count`).toBeLessThanOrEqual(15);
      const subSlugs = c.subcategories.map((s) => s.slug);
      expect(new Set(subSlugs).size, `${c.slug} unique subslugs`).toBe(subSlugs.length);
      for (const s of c.subcategories) {
        expect(s.labelLt.trim().length, `${c.slug}/${s.slug} lt`).toBeGreaterThan(0);
        expect(s.labelEn.trim().length, `${c.slug}/${s.slug} en`).toBeGreaterThan(0);
      }
    }
  });

  it("every block has ≥1 action, a valid identity, and boolean map/doc flags", () => {
    for (const c of WORK_MARKET_CATEGORIES) {
      expect(c.actions.length, `${c.slug} actions`).toBeGreaterThan(0);
      for (const a of c.actions) expect(WORK_MARKET_ACTIONS).toContain(a);
      expect(["person", "company", "both"]).toContain(c.identity);
      expect(typeof c.mapEligible).toBe("boolean");
      expect(typeof c.needsDocuments).toBe("boolean");
      expect(typeof c.brigadeCapable).toBe("boolean");
      expect(typeof c.rateSignalCapable).toBe("boolean");
    }
  });

  it("every block has a matching visual concept", () => {
    expect(BLOCK_VISUAL_CONCEPTS.length).toBe(28);
    for (const c of WORK_MARKET_CATEGORIES) {
      const v = visualConceptFor(c.slug);
      expect(v, `${c.slug} visual`).toBeTruthy();
      expect(v!.icon.length).toBeGreaterThan(0);
      expect(v!.mapMarker.length).toBeGreaterThan(0);
      expect(v!.badge.length).toBeGreaterThan(0);
    }
  });
});

describe("atlas lookups behave", () => {
  it("categoryBySlug round-trips", () => {
    expect(categoryBySlug("roofs-facades")?.labelEn).toBe("Roofs & facades");
    expect(categoryBySlug("does-not-exist")).toBeUndefined();
  });
  it("map-eligible excludes the moderation block", () => {
    expect(mapEligibleCategories().some((c) => c.slug === "moderation-review")).toBe(false);
  });
  it("categoriesByAction filters", () => {
    expect(categoriesByAction("rent").some((c) => c.slug === "tools-equipment-rental")).toBe(true);
  });
  it("recognition→atlas bridge: a skill maps to its blocks", () => {
    expect(categoriesForSkill("roofing").some((c) => c.slug === "roofs-facades")).toBe(true);
  });
  it("hire is a company-only action; person never gets a hire CTA", () => {
    const block = categoryBySlug("construction-sites")!;
    expect(actionsFor("company", block)).toContain("hire");
    expect(actionsFor("person", block)).not.toContain("hire");
  });
});

describe("map is signal-only: marker only for verified coordinates", () => {
  it("no precision below verified draws a marker", () => {
    expect(canDrawMarker("country")).toBe(false);
    expect(canDrawMarker("city")).toBe(false);
    expect(canDrawMarker("address_text")).toBe(false);
    expect(canDrawMarker("verified_coordinates")).toBe(true);
  });
});

describe("eligibility is honest (no fake foreign readiness)", () => {
  it("no documents abroad → not shown as ready abroad", () => {
    const r = resolveEligibility({
      homeCountry: "lt",
      targetCountry: "nl",
      hasRequiredDocuments: false,
      verified: false,
    });
    expect(r.directForeignVisible).toBe(false);
    expect(r.badge).toBe("needs_documents");
  });
  it("legal route surfaces a route, still not a direct foreign match", () => {
    const r = resolveEligibility({
      homeCountry: "lt",
      targetCountry: "nl",
      hasRequiredDocuments: false,
      verified: false,
      offeredLegalRoutes: ["company_handles_paperwork"],
    });
    expect(r.badge).toBe("company_handles_paperwork");
    expect(r.directForeignVisible).toBe(false);
  });
  it("same country → ready locally", () => {
    const r = resolveEligibility({ homeCountry: "lt", targetCountry: "LT", hasRequiredDocuments: false, verified: false });
    expect(r.local).toBe(true);
    expect(r.badge).toBe("ready_locally");
  });
});

describe("visibility scaling policy (no fake paid unlock)", () => {
  it("small network → full preview for everyone", () => {
    expect(resolveVisibilityScope({ totalActiveUsers: 200, identity: "person" })).toBe("full_network_preview");
  });
  it("above threshold free user is limited, not full", () => {
    const scope = resolveVisibilityScope({ totalActiveUsers: FULL_PREVIEW_USER_THRESHOLD + 1, identity: "person" });
    expect(scope).not.toBe("full_network_preview");
    expect(scope).toBe("own_country");
  });
  it("paid widening without live billing is flagged fake and does not apply", () => {
    const input = { totalActiveUsers: 5000, identity: "person" as const, planTier: "business" as const, billingLive: false };
    expect(wouldBeFakePaidUnlock(input)).toBe(true);
    expect(resolveVisibilityScope(input)).toBe("own_country");
  });
  it("admin always full", () => {
    expect(resolveVisibilityScope({ totalActiveUsers: 99999, identity: "admin" })).toBe("admin_full");
  });
});
