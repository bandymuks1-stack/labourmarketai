import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PUBLIC NAV / FOOTER + COMPANY-DEMAND FUNNEL — CANONICAL IA GUARDS.
 *
 * Nav/funnel consistency PR: the public surface must keep ONE coherent
 * structure — labels name their real destinations (no template leftovers
 * like "Solutions"/"Resources"/"Company" pointing at unrelated routes),
 * "Apie" points only at /about, and every company-demand action CTA routes
 * to the single canonical entry /company-need.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

type Json = Record<string, unknown>;
const catalog = (loc: string): Json =>
  JSON.parse(read(`messages/${loc}.json`)) as Json;

const ACTIVE = ["lt", "en", "ru"] as const;

describe("public nav uses the canonical IA (labels match destinations)", () => {
  const nav = read("components/layouts/site-nav.tsx");

  it.each([
    ["workers", "/for-workers"],
    ["companies", "/for-companies"],
    ["agencies", "/for-agencies"],
    // PR-H global landing: "how it works" + "partners" are REAL landing
    // anchors (sections rendered by page.tsx; existence pinned by
    // lib/guards/global-landing.test.ts) — not new routes, not dead links.
    ["how", "/#how-it-works"],
    ["pricing", "/pricing"],
    ["partners", "/#partners"],
    ["about", "/about"],
  ])("nav key %s links to %s", (key, href) => {
    expect(nav).toContain(`{ key: "${key}", href: "${href}"`);
  });

  it("template keys (solutions/resources/company/platform) are gone from the nav", () => {
    for (const gone of ['"solutions"', '"resources"', '"company"', '"platform"']) {
      expect(nav, `site-nav still references template key ${gone}`).not.toContain(gone);
    }
  });

  it("no active-locale catalog carries template nav labels", () => {
    for (const loc of ACTIVE) {
      const n = (catalog(loc) as { nav: Record<string, string> }).nav;
      const keys = Object.keys(n).sort();
      expect(keys).toEqual(
        // themeToDark/themeToLight: the public header theme toggle labels
        // (production UX repair v2, F1 — the public site previously had no
        // theme control at all).
        // how/partners: PR-H global landing anchor links (Kaip veikia /
        // Partneriams) — labels for real landing sections.
        [
          "about",
          "agencies",
          "companies",
          "how",
          "login",
          "partners",
          "pricing",
          "startNow",
          "themeToDark",
          "themeToLight",
          "vision",
          "workers",
        ],
      );
      expect(Object.values(n)).not.toContain("Ištekliai");
      expect(Object.values(n)).not.toContain("Sprendimai");
    }
  });
});

describe("footer matches the public IA and never duplicates 'about'", () => {
  const footer = read("components/layouts/site-footer.tsx");

  it("footer links /about exactly once and never labels /for-agencies as 'about'", () => {
    expect(footer.match(/href="\/about"/g)?.length ?? 0).toBe(1);
    // The old bug: an "Apie mus" label on the /for-agencies link.
    expect(footer).not.toContain('nav("company")');
    expect(footer).not.toContain('nav("solutions")');
    expect(footer).not.toContain('nav("resources")');
  });

  it("footer product column mirrors the three audience pages + pricing", () => {
    for (const href of ["/for-workers", "/for-companies", "/for-agencies", "/pricing"]) {
      expect(footer).toContain(`href="${href}"`);
    }
  });
});

describe("canonical demand funnel — action CTAs route to /company-need only", () => {
  it("landing employer-path card routes to /company-need (not /for-companies)", () => {
    const page = read("app/[locale]/(marketing)/page.tsx");
    expect(page).not.toContain('href="/for-companies"');
    expect(page).toContain('href="/company-need"');
  });

  it("for-companies hero CTA routes into /company-need (educational page, canonical action)", () => {
    const page = read("app/[locale]/(marketing)/for-companies/page.tsx");
    expect(page).toContain('ctaKind="companyNeed"');
  });

  it("PageHero supports the companyNeed CTA kind and links the canonical route", () => {
    const hero = read("components/marketing/page-hero.tsx");
    expect(hero).toContain('ctaKind === "companyNeed"');
    expect(hero).toContain('href="/company-need"');
  });
});

describe("/company-need is honest about being a draft-preparation step", () => {
  it("renders the honest-capability note above the form", () => {
    const page = read("app/[locale]/(marketing)/company-need/page.tsx");
    const note = page.indexOf("company-need-honest-note");
    const form = page.indexOf("<CompanyNeedForm");
    expect(note).toBeGreaterThan(-1);
    expect(form).toBeGreaterThan(-1);
    expect(note, "honest note must render before the form").toBeLessThan(form);
  });

  it("country is a constrained select, not a free-text ISO-code input", () => {
    const form = read("components/app/company-need-form.tsx");
    expect(form).toContain('<select name="country"');
    expect(form).not.toMatch(/<input[^>]*name="country"/);
  });

  it("active locales carry the honest note + 10 localized market names", () => {
    for (const loc of ACTIVE) {
      const cn = (catalog(loc) as { companyNeed: Record<string, unknown> }).companyNeed;
      expect(typeof cn.honestNote).toBe("string");
      expect(Object.keys(cn.countries as Record<string, string>)).toHaveLength(10);
    }
  });
});

describe("the landing player-card is the CANONICAL card (owner audit §3.7)", () => {
  // Supersedes the FUT-card stat-legend contract: the acronym codes left the
  // landing together with the concept cards. The canonical WorkerPlayerCard
  // explains itself with full localized labels, so no legend is needed.
  it("showcase renders WorkerPlayerCard, never the FUT concept card or its stat codes", () => {
    const showcase = read("components/marketing/player-card-showcase.tsx");
    expect(showcase).toMatch(/WorkerPlayerCard/);
    expect(showcase).not.toContain("<PlayerCard ");
    expect(showcase).not.toContain("STAT_KEYS");
    // No universal human score / medal tiers anywhere near the landing card.
    expect(showcase).not.toMatch(/gold|silver|bronze|\bOVR\b/i);
  });

  it("each on-card acronym exposes its meaning as a native title tooltip", () => {
    const card = read("components/app/player-card.tsx");
    expect(card).toMatch(/title=\{t\(`stat\.\$\{k\}`\)\}/);
  });

  it("every active locale defines the legend intro + all six stat names", () => {
    for (const loc of ACTIVE) {
      const pc = (catalog(loc) as { playercards: { statLegendIntro: string; stat: Record<string, string> } })
        .playercards;
      expect(typeof pc.statLegendIntro).toBe("string");
      for (const k of ["SKL", "REL", "SPD", "SAF", "ADP", "TRS"]) {
        expect(typeof pc.stat[k]).toBe("string");
      }
    }
  });
});

describe("public positioning is consistent (Europe, no Baltic-only footer claim)", () => {
  it("footer tagline aligns with the Europe-wide meta positioning in every active locale", () => {
    for (const loc of ACTIVE) {
      const tagline = (catalog(loc) as { footer: { tagline: string } }).footer.tagline;
      expect(tagline, `${loc} footer.tagline still claims Baltic-only scope`).not.toMatch(
        /Baltijos|Baltic|Балти/i,
      );
      expect(tagline, `${loc} footer.tagline must mention Europe`).toMatch(/Europ|Европ/i);
    }
  });
});
