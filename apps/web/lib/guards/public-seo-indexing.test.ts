import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEO_AUDIT_FILES,
  auditPublicSeoIndexing,
} from "@/lib/seo/seo-indexing-audit";
import { BRAND_SEO } from "@/lib/seo/metadata";
import { activeLocales } from "@/lib/i18n/config";

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
});
