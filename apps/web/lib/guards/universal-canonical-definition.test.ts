/**
 * Universal canonical-definition guard.
 *
 * Locks the canonical product definition (PRODUCT_CONSTITUTION §7.1) and the
 * machine-readable public product definition (SEO BRAND_SEO) as UNIVERSAL:
 * every profession, education level, experience and life stage, across Europe.
 * It fails if the platform's own self-definition is narrowed to a single sector
 * — including by a priority construct ("primary vertical", "construction-first",
 * "default industry", …) or by a construction/trades/"labour-force agency"/
 * job-board self-label.
 *
 * This is the anti-regression backstop for the Universal Labour-Market
 * Realignment (owner directive 2026-07-17). It complements the existing
 * public-copy guards (public-trust-positioning, whole-labour-market-copy,
 * public-seo-indexing) which cover hero/footer/brand SEO; this one pins the
 * canonical DEFINITION itself.
 *
 * Scope note: the §7.1 *constraint prose* deliberately NAMES the forbidden
 * phrases in order to forbid them, so the phrase-ban is asserted only against
 * (a) the positive canonical definition blockquote and (b) the real public
 * BRAND_SEO strings — never against the whole §7 prose.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BRAND_SEO } from "@/lib/seo/metadata";
import { activeLocales } from "@/lib/i18n/config";

const webRoot = resolve(__dirname, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");

const constitution = (): string =>
  readFileSync(resolve(repoRoot, "docs", "PRODUCT_CONSTITUTION.md"), "utf-8");

/**
 * Priority / single-sector narrowing constructs that must never appear in the
 * platform's own definition. (Item G.10 of the realignment spec.)
 */
const PRIORITY_NARROWING: RegExp[] = [
  /primary vertical/i,
  /initial vertical/i,
  /first vertical/i,
  /construction[- ]first/i,
  /default industry/i,
  /default occupation/i,
  /preferred sector/i,
  /pilot sector/i,
  /sector boost/i,
  /industry boost/i,
  /ranking boost/i,
];

/**
 * Sector self-label tokens that must never appear as the platform's OWN
 * identity in the canonical definition / public brand strings. (A user-chosen
 * sector is fine; the platform defining ITSELF this way is not.)
 */
const SELF_LABEL_NARROWING: RegExp[] = [
  /\bconstruction\b/i,
  /\bstatyb\w*/i,
  /\bстрои\w*/i,
  /labour[- ]force agency/i,
  /darbo jėgos agentūra/i,
  /\bjob board\b/i,
];

/** Cross-sector / universal marker required per active locale in BRAND_SEO. */
const UNIVERSAL_MARKER: Readonly<Record<string, RegExp>> = {
  en: /sector/i,
  lt: /sektori/i,
  ru: /сектор/i,
  nl: /sector/i,
  de: /branche/i,
};

/** Extract the positive canonical-definition blockquote from §7.1. */
function canonicalDefinitionQuote(md: string): string {
  const start = md.indexOf("### 7.1 Canonical product definition");
  expect(start, "§7.1 canonical product definition heading present").toBeGreaterThan(-1);
  const after = md.slice(start);
  // The positive definition is the blockquote block ending before the English
  // reference translation.
  const end = after.indexOf("**English (reference translation):**");
  expect(end, "§7.1 English reference marker present").toBeGreaterThan(-1);
  return after.slice(0, end);
}

describe("canonical product definition — present and universal", () => {
  it("§7.1 enshrines the universal owner definition verbatim", () => {
    const md = constitution();
    expect(md).toContain(
      "universali Europos darbo rinkos ir profesinių galimybių",
    );
    expect(md).toContain("visų profesijų, išsilavinimo lygių");
    expect(md).toContain("persikvalifikuoti");
  });

  it("§7.1 states the definition is an architecture rule, not marketing", () => {
    expect(constitution()).toContain(
      "product-architecture rule, not marketing text",
    );
  });

  it("§7.1 forbids single-sector identity even by negation", () => {
    expect(constitution()).toContain("not even by negation");
  });

  it("the positive canonical definition carries no priority-narrowing phrase", () => {
    const quote = canonicalDefinitionQuote(constitution());
    for (const re of PRIORITY_NARROWING) {
      expect(re.test(quote), `canonical definition matched ${re}`).toBe(false);
    }
  });

  it("the positive canonical definition names no single-sector self-label", () => {
    const quote = canonicalDefinitionQuote(constitution());
    for (const re of SELF_LABEL_NARROWING) {
      expect(re.test(quote), `canonical definition matched ${re}`).toBe(false);
    }
  });
});

describe("public product definition (SEO BRAND_SEO) — universal per active locale", () => {
  it.each(activeLocales as readonly string[])(
    "%s brand title+description is sector-agnostic",
    (locale) => {
      const copy = BRAND_SEO[locale as keyof typeof BRAND_SEO];
      expect(copy, `BRAND_SEO has ${locale}`).toBeTruthy();
      const text = `${copy.title} ${copy.description}`;
      for (const re of [...PRIORITY_NARROWING, ...SELF_LABEL_NARROWING]) {
        expect(re.test(text), `${locale} BRAND_SEO matched ${re}`).toBe(false);
      }
    },
  );

  it.each(activeLocales as readonly string[])(
    "%s brand description carries a cross-sector marker",
    (locale) => {
      const copy = BRAND_SEO[locale as keyof typeof BRAND_SEO];
      const marker = UNIVERSAL_MARKER[locale];
      expect(marker, `universal marker defined for ${locale}`).toBeTruthy();
      expect(
        marker.test(copy.description),
        `${locale} brand description must carry a cross-sector marker`,
      ).toBe(true);
    },
  );
});
