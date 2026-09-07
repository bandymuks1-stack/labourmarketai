import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { landingTreeSource } from "./landing-composition";

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
    // The public job board — the highest-intent destination on the marketing
    // site, and one that shipped with no nav entry at all.
    ["jobs", "/jobs"],
    // Owner window 11 §17 — the market map section's anchor.
    ["market", "/#market"],
    // PR-H global landing: "how it works" is a REAL landing anchor (the
    // section that carries it is pinned by lib/guards/global-landing.test.ts)
    // — not a new route, not a dead link.
    //
    // "partners" was REMOVED on 2026-07-31: its landing section left with the
    // rebuild, so the item scrolled nowhere. See site-nav.tsx for the full
    // reason. Its absence is asserted below so it cannot silently return.
    ["how", "/#how-it-works"],
    ["pricing", "/pricing"],
    ["about", "/about"],
  ])("nav key %s links to %s", (key, href) => {
    expect(nav).toContain(`{ key: "${key}", href: "${href}"`);
  });

  /**
   * THE THREE AUDIENCE PAGES LEFT THE BAR AND STAYED REACHABLE
   * (owner window 11 §16).
   *
   * `Darbuotojams · Įmonėms · Agentūroms` in the primary navigation told every
   * visitor they were one of three fixed kinds of person before they read a
   * word of the page. The pages themselves are good and were NOT removed — so
   * the guarantee this file used to make ("the nav names them") is replaced
   * with the stronger one the owner actually asked for: **they remain reachable
   * by name, from surfaces a person actually uses.**
   *
   * Two independent paths are required, so losing one is a failure rather than
   * a silent single point of contact.
   */
  it.each([
    ["/for-workers"],
    ["/for-companies"],
    ["/for-agencies"],
  ])("%s is reachable from BOTH the footer and the starting-contexts section", (href) => {
    const footer = read("components/layouts/site-footer.tsx");
    const doors = read("lib/marketing/public-doors.ts");
    expect(footer, `footer no longer links ${href}`).toContain(`href="${href}"`);
    expect(doors, `no starting context offers ${href}`).toContain(`"${href}"`);
  });

  it("the starting-contexts section actually renders those learn-more links", () => {
    const band = read("components/marketing/starting-contexts-band.tsx");
    expect(band).toMatch(/learnMore/);
    expect(band).toMatch(/context-learn-more-/);
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
        // how: the PR-H landing anchor link (Kaip veikia) — a label for a
        // real landing section.
        //
        // "partners" was removed with its nav item on 2026-07-31 (its landing
        // section left with the rebuild). The key is gone from all 11 locale
        // catalogues; this list is what stops it drifting back in unused.
        //
        // menuOpen/menuClose: the mobile disclosure button's accessible name
        // (beta foundation audit M1). Below `lg` the six primary links are
        // display:none, so the phone header needs its own labelled control.
        //
        // agencies/companies/workers: the LABELS stay in the catalogue after
        // owner window 11 §16 removed their nav ITEMS, because the
        // starting-contexts section and the footer still render them by name.
        // A label without a nav item is not a template leftover — it is the
        // audience page named where a person is actually choosing.
        [
          "about",
          "agencies",
          "companies",
          "how",
          // jobs: the public job board link (2026-08-18). A real label for a
          // real route over 39,241 live vacancies — the opposite of the
          // template leftovers this list exists to keep out.
          "jobs",
          "login",
          // market: the §17 market-map anchor (owner window 11).
          "market",
          "menuClose",
          "menuOpen",
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
    // The canonical page delegates through the shared V1 server assembler to
    // the command surface, so depth 2 reaches the CTA without walking into
    // unrelated application chrome.
    // Both href forms — the JSX attribute and the CTA descriptor object. See
    // the note in `public-market-entry.test.ts`.
    const landing = landingTreeSource(APP_ROOT, 2);
    const entryStart = landing.indexOf("className={styles.entryBand}");
    const entryEnd = landing.indexOf("</section>", entryStart);
    const employerPath = landing.slice(entryStart, entryEnd);
    expect(entryStart).toBeGreaterThan(-1);
    expect(employerPath).not.toMatch(/href[=:]\s*"\/for-companies"/);
    expect(employerPath).toMatch(/href[=:]\s*"\/company-need"/);
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

  it("the stat-code legend died with the concept card in every active locale (S3)", () => {
    // S3 player-card honesty: the six-acronym stat fiction (SKL/REL/…)
    // belonged to the deleted FUT card. Its i18n keys are gone and may not
    // come back — the canonical card explains itself with full labels.
    for (const loc of ACTIVE) {
      const pc = (catalog(loc) as { playercards: Record<string, unknown> }).playercards;
      expect(pc.statLegendIntro, `${loc} playercards.statLegendIntro`).toBeUndefined();
      expect(pc.stat, `${loc} playercards.stat`).toBeUndefined();
      expect(pc.tier, `${loc} playercards.tier`).toBeUndefined();
      expect(pc.status, `${loc} playercards.status`).toBeUndefined();
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
