import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Global landing guard (PR-H global landing + motion).
 *
 * The public landing presents a GLOBAL AI-first work platform — not
 * Europe-only, not construction-only. This guard pins four facts:
 *  (a) the landing hero renders the WORLD map (world-geo), not the old
 *      Europe-bounded map (europe-geo);
 *  (b) no "across Europe"-style hardcode remains in the landing render tree
 *      or the landing i18n namespaces;
 *  (c) every final-CTA href resolves to a real route file under
 *      app/[locale]/ — no dead links;
 *  (d) the landing motion components handle prefers-reduced-motion.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

const LANDING_FILES = [
  "app/[locale]/(marketing)/page.tsx",
  "components/app/live-world-map.tsx",
  "components/marketing/how-it-works-band.tsx",
  "components/marketing/conversation-os-panel.tsx",
  "components/marketing/audience-value-sections.tsx",
  "components/marketing/trust-band.tsx",
  "components/marketing/final-cta-band.tsx",
  "components/marketing/reveal.tsx",
] as const;

describe("(a) the landing renders the world map, not the Europe-only map", () => {
  it("page.tsx imports live-world-map and not live-map / europe-geo", () => {
    const page = read("app/[locale]/(marketing)/page.tsx");
    expect(page).toMatch(/components\/app\/live-world-map/);
    expect(page).not.toMatch(/components\/app\/live-map/);
    expect(page).not.toMatch(/europe-geo/);
  });

  it("live-world-map renders the generated world-geo module", () => {
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
    expect(anchors.length).toBeGreaterThanOrEqual(2);
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
