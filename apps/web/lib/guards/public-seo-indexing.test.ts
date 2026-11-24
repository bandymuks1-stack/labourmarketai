import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEO_AUDIT_FILES,
  auditPublicSeoIndexing,
} from "@/lib/seo/seo-indexing-audit";
import { BRAND_NAME, BRAND_SEO, PAGE_SEO } from "@/lib/seo/metadata";
import { activeLocales } from "@/lib/i18n/config";
import {
  SEO_PROFESSIONS,
  SEO_PROBLEMS,
} from "@/lib/seo/profession-problem-content";

/** A construction-first signal in any active language. */
const CONSTRUCTION = /construction|statyb|строит|стройк/i;
/** At least one cross-sector / general labour-market token must be present. */
const CROSS_SECTOR =
  /workers|employers|skills|labour\s*market|opportun|darbuotoj|darbdav|įgūdži|galimyb|работник|работодател|навык|возможност/i;

/**
 * CI guard (has teeth — runs under `pnpm -F web test`) for the public
 * SEO indexing foundation. Locks the apex-canonical / www→apex /
 * robots / sitemap / brand / no-fake-claims invariants. See
 * lib/seo/seo-indexing-audit.ts for the checks and
 * docs/audit/public-seo-indexing-foundation-v1.md for the rationale.
 */
const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string | null {
  try {
    return readFileSync(join(APP_ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

describe("public SEO indexing foundation guard", () => {
  // buildPageMetadata appends " · LabourMarket.ai" exactly once. A curated
  // title that already ends in the brand rendered "Open jobs — LabourMarket.ai
  // · LabourMarket.ai" on /jobs in all five locales (SEO/GEO gap, 2026-09-20).
  it("no PAGE_SEO title ends in the brand (the suffix is appended once)", () => {
    const offenders: string[] = [];
    // Any dash/dot separator followed by the brand at the very end of a title.
    const suffix = /[—·|-]\s*LabourMarket\.ai\s*$/i;
    expect(suffix.test(`Open jobs — ${BRAND_NAME}`)).toBe(true); // the guard has teeth
    for (const [key, byLocale] of Object.entries(PAGE_SEO)) {
      for (const [locale, copy] of Object.entries(byLocale)) {
        if (suffix.test(copy.title)) offenders.push(`${key}.${locale}: ${copy.title}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("all audited SEO files exist", () => {
    for (const rel of SEO_AUDIT_FILES) {
      expect(read(rel), `${rel} missing`).not.toBeNull();
    }
  });

  it("passes the public SEO indexing audit (no violations)", () => {
    const { violations } = auditPublicSeoIndexing(read);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // Cross-sector positioning (owner 2026-06-15): the brand title/description
  // must not be construction-first; construction is one sector among many.
  describe("brand SEO is cross-sector, not construction-first", () => {
    for (const locale of activeLocales) {
      it(`${locale}: brand title has no construction-first signal`, () => {
        expect(BRAND_SEO[locale].title).not.toMatch(CONSTRUCTION);
      });
      it(`${locale}: brand description has no construction-first signal`, () => {
        expect(BRAND_SEO[locale].description).not.toMatch(CONSTRUCTION);
      });
      it(`${locale}: brand title carries a cross-sector labour-market token`, () => {
        expect(BRAND_SEO[locale].title).toMatch(CROSS_SECTOR);
      });
    }
  });

  // A missing record (a vacancy, business, question, category or country that
  // does not exist) is a 404 whose title comes from not-found.tsx (UX-9). Its
  // metadata says noindex and nothing else: a title of its own put the home
  // page's title on the missing vacancy (#3149), and a canonical or hreflang
  // would point search engines at a page that is not there.
  describe("a missing record's metadata is noindex only", () => {
    const DYNAMIC_PUBLIC_PAGES = [
      "app/[locale]/(marketing)/jobs/[id]/page.tsx",
      "app/[locale]/(marketing)/labour-market/[country]/page.tsx",
      "app/[locale]/(marketing)/questions/[slug]/page.tsx",
      "app/[locale]/(marketing)/questions/category/[category]/page.tsx",
      "app/[locale]/business/[slug]/page.tsx",
    ];
    const NOINDEX_RETURN = /return\s*\{[^;]*?robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}\s*\}/g;

    for (const file of DYNAMIC_PUBLIC_PAGES) {
      it(`${file}: the missing branch declares no title, canonical or alternates`, () => {
        const src = read(file);
        expect(src, `${file} must exist`).not.toBeNull();
        const meta = src!.slice(src!.indexOf("export async function generateMetadata"));
        const returns = meta.match(NOINDEX_RETURN) ?? [];
        expect(returns.length, `${file} has no noindex return for a missing record`).toBeGreaterThan(0);
        for (const r of returns) {
          expect(r).not.toMatch(/\btitle\s*:/);
          expect(r).not.toMatch(/\balternates\s*:/);
          expect(r).not.toMatch(/buildPageMetadata|buildStaticQuestionsMetadata|buildQuestionMetadata/);
        }
      });
    }

    it("the invitation page names itself instead of carrying the home title", () => {
      const src = read("app/[locale]/invite/[token]/page.tsx")!;
      expect(src).toContain('title: brandedTitle(t("pageTitle")), robots: { index: false, follow: false }');
      expect(src).not.toMatch(/export const metadata: Metadata = \{ robots/);
    });
  });

  // The SEO strategy must COVER breadth — many professions across many
  // sectors (construction included, never alone). Professions are NOT hidden.
  describe("SEO covers many professions and sectors (not one)", () => {
    it("names a broad set of professions", () => {
      expect(SEO_PROFESSIONS.length).toBeGreaterThanOrEqual(15);
    });

    it("spans at least 5 distinct sectors", () => {
      const sectors = new Set(SEO_PROFESSIONS.map((p) => p.sector));
      expect(sectors.size).toBeGreaterThanOrEqual(5);
    });

    it("includes construction AND at least 4 non-construction sectors", () => {
      const sectors = new Set(SEO_PROFESSIONS.map((p) => p.sector));
      expect(sectors.has("construction")).toBe(true); // not hidden
      const nonConstruction = [...sectors].filter((s) => s !== "construction");
      expect(nonConstruction.length).toBeGreaterThanOrEqual(4);
    });

    it("covers a broad set of real labour-market problems", () => {
      expect(SEO_PROBLEMS.length).toBeGreaterThanOrEqual(8);
      const audiences = new Set(SEO_PROBLEMS.map((p) => p.audience));
      expect(audiences.has("worker")).toBe(true);
      expect(audiences.has("employer")).toBe(true);
    });
  });
});
