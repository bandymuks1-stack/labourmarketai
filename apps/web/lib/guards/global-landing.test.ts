import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { landingTreeFiles } from "./landing-composition";

/**
 * Global landing guard (PR-H global landing + motion; landing rebuild
 * 2026-07-29 — owner directive).
 *
 * The public landing presents a GLOBAL AI-first work platform — not
 * Europe-only, not construction-only. This guard pins four facts:
 *  (a) the landing hero renders the LIVE PRODUCT DEMO (the real core loop,
 *      honestly labelled as a sample sequence) — the wall-sized static map
 *      is gone, and no Europe-bounded map (europe-geo) may return;
 *  (b) no "across Europe"-style hardcode remains in the landing render tree
 *      or the landing i18n namespaces;
 *  (c) every final-CTA href resolves to a real route file under
 *      app/[locale]/ — no dead links;
 *  (d) the landing motion components handle prefers-reduced-motion.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

/**
 * The landing's REAL sections, derived from what page.tsx renders.
 *
 * This was a hardcoded list, and it rotted: it still named
 * `live-product-demo`, `market-moment`, `proof-band` and
 * `conversation-os-panel` long after the landing stopped rendering them. A
 * hardcoded list is a promise that someone will remember to update it, and the
 * Europe-only check below silently stopped covering the sections that ARE on
 * the landing. Deriving it means new sections are covered the moment they are
 * mounted, and removed ones stop being asserted about.
 */
const LANDING_FILES = landingTreeFiles(WEB_ROOT, 1).filter(
  (f) =>
    f.startsWith("components/marketing/") ||
    // page.tsx ITSELF is part of the landing, and leaving it out is not a
    // detail: the page carries the `#how-it-works` anchor wrapper directly, so
    // a components-only list made a live anchor look dead. That mistake was
    // caught in a browser after a "fix" had already added a duplicate id.
    f === "app/[locale]/(marketing)/page.tsx",
);

describe("(a) the landing hero is the live product demo, never a Europe-only map", () => {
  it("page.tsx imports the canonical hero demo and not live-map / europe-geo", () => {
    // `live-product-demo` was SUPERSEDED by `hero-live-demo`, which mounts the
    // canonical <MarketMap> the authenticated ResultPanel uses — one map
    // engine for the whole product instead of a landing-only illustration.
    // The old component was dead (referenced by a stale comment only) and has
    // been deleted; this guard now pins the replacement.
    const page = read("app/[locale]/(marketing)/page.tsx");
    expect(page).toMatch(/components\/marketing\/hero-live-demo/);
    expect(page).not.toMatch(/components\/app\/live-map/);
    expect(page).not.toMatch(/europe-geo/);
    // The superseded component must not come back alongside its replacement.
    expect(existsSync(join(WEB_ROOT, "components/marketing/live-product-demo.tsx"))).toBe(
      false,
    );
  });

  it("the demo is honestly labelled and reduced-motion safe", () => {
    const demo = read("components/marketing/hero-live-demo.tsx");
    expect(demo).toMatch(/prefers-reduced-motion/);
    // A scripted scenario on real geography must SAY it is a demonstration.
    expect(demo).toMatch(/t\("demoBadge"\)/);
  });

  it("live-world-map (kept in repo, restorable) renders the generated world-geo module", () => {
    const map = read("components/app/live-world-map.tsx");
    expect(map).toMatch(/components\/app\/world-geo/);
    expect(map).not.toMatch(/europe-geo/);
  });

  it("world-geo covers the full world and carries the 11 target directions", () => {
    const geo = read("components/app/world-geo.ts");
    for (const code of [
      "LT", "LV", "EE", "PL", "DE", "NL", "DK", "SE", "NO", "GE", "US",
    ]) {
      expect(geo, `target ${code} present`).toContain(`"code":"${code}"`);
    }
    // Full-world projection bounds, not the old Europe box ([-10,40]×[34,71]).
    expect(geo).toMatch(/LNG0 = -180/);
    expect(geo).toMatch(/LNG1 = 180/);
  });
});

describe("(b) no Europe-only hardcode in the landing render tree", () => {
  const EUROPE_ONLY = [
    /across Europe/i,
    /Darbas Europoje/i,
    /visoje Europoje/i,
    /по всей Европе/i,
  ];

  for (const rel of LANDING_FILES) {
    it(`${rel} carries no Europe-only phrasing`, () => {
      const src = read(rel);
      for (const re of EUROPE_ONLY) {
        expect(src, `${rel} ~ ${re}`).not.toMatch(re);
      }
    });
  }

  it("the landing i18n namespaces (landing/hero/live.chip/map.world) are market-neutral", () => {
    for (const loc of ["lt", "en", "ru"]) {
      const catalog = JSON.parse(read(`messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      const blob = JSON.stringify({
        landing: catalog.landing,
        hero: catalog.hero,
        chip: (catalog.live as Record<string, unknown>)?.chip,
        world: (catalog.map as Record<string, unknown>)?.world,
      });
      for (const re of EUROPE_ONLY) {
        expect(blob, `${loc} ~ ${re}`).not.toMatch(re);
      }
    }
  });

  it("the answer-engine chrome no longer says 'across Europe'", () => {
    const chrome = read("lib/answer-engine/chrome.ts");
    expect(chrome).not.toMatch(/across Europe/i);
    expect(chrome).not.toMatch(/Darbas Europoje/i);
  });
});

describe("(c) every final-CTA href resolves to a real app/[locale]/ route", () => {
  const src = read("components/marketing/final-cta-band.tsx");
  const hrefs = [...src.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

  it("the CTA band declares the four audience links", () => {
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
  });

  const resolves = (href: string): boolean => {
    const clean = href.replace(/[#?].*$/, "").replace(/^\//, "");
    const candidates = [
      join(WEB_ROOT, "app", "[locale]", ...clean.split("/"), "page.tsx"),
      join(WEB_ROOT, "app", "[locale]", "(marketing)", ...clean.split("/"), "page.tsx"),
    ];
    return candidates.some((p) => existsSync(p));
  };

  for (const href of [...new Set(hrefs)]) {
    it(`${href} → page.tsx exists`, () => {
      expect(resolves(href), `dead link: ${href}`).toBe(true);
    });
  }

  it("the nav anchor targets exist on the landing page", () => {
    const nav = read("components/layouts/site-nav.tsx");
    const anchors = [...nav.matchAll(/href:\s*"\/#([\w-]+)"/g)].map((m) => m[1]);
    // One since "partners" was removed as a dead anchor (2026-07-31). The
    // floor stays >= 1 so the nav cannot quietly lose every landing anchor.
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    const landingTree = LANDING_FILES.map(read).join("\n");
    for (const a of anchors) {
      // Matches a JSX literal (id="partners") OR the data-driven form
      // (id: "partners" fed into id={b.id}); the mandatory closing quote
      // keeps prose like `id="partners.logo.N"` from false-positive matching.
      expect(landingTree, `#${a} section exists`).toMatch(
        new RegExp(`id[=:]\\s*\\{?["']${a}["']`),
      );
    }
  });
});

describe("(d) landing motion honours prefers-reduced-motion", () => {
  it("Reveal gates all motion on useReducedMotion + mounted", () => {
    const reveal = read("components/marketing/reveal.tsx");
    expect(reveal).toMatch(/useReducedMotion/);
    expect(reveal).toMatch(/useMounted/);
    expect(reveal).toMatch(/initial=\{false\}/);
  });

  it("the world map's decorative pulse uses the reduced-motion-covered class", () => {
    const map = read("components/app/live-world-map.tsx");
    expect(map).toMatch(/map-marker/);
    const css = read("app/globals.css");
    const reduced =
      css.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/)?.[0] ??
      "";
    expect(reduced).toMatch(/\.map-marker/);
  });

  it("CTA micro-interaction is disabled under reduced motion", () => {
    const cta = read("components/marketing/final-cta-band.tsx");
    expect(cta).toMatch(/motion-reduce:/);
  });
});
