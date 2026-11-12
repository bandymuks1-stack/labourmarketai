import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  CATALOGUE_PROFESSION_SLUGS,
  SECTOR_ICONS,
  professionCards,
  professionSector,
} from "@/lib/navigation/profession-sectors";
import { WORK_CATEGORIES } from "@/lib/taxonomy/work-categories";
import { WORK_AREA_ICONS } from "@/components/app/work-area-icons";
import { PUBLIC_INTENTS } from "@/lib/navigation/public-intents";

/**
 * PUBLIC BROWSE CAROUSELS (owner P0 2026-11-12).
 *
 *  1. ONE carousel: both rows render the existing area switcher — no second
 *     carousel component may appear;
 *  2. professions cover EVERY sector of the catalogue, never one trade: each
 *     catalogue profession has a named sector (not "other"), every sector
 *     with a profession is on the row, and the first cards are one per sector;
 *  3. every card links to a real route (the public board's own closed-set
 *     profession filter; the function cards are the guarded public intents);
 *  4. motion is off under prefers-reduced-motion and nothing auto-advances;
 *  5. titles are translated in all 11 locales.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("one carousel, reused", () => {
  const src = read("components/marketing/browse-carousels.tsx");
  const switcher = read("components/app/area-switcher.tsx");

  it("both rows render the area switcher", () => {
    expect(src.match(/<AreaSwitcher\b/g)).toHaveLength(2);
    expect(existsSync(join(APP_ROOT, "components/ui/card-carousel.tsx"))).toBe(false);
  });

  it("the switcher keeps its reduced-motion contract and never auto-advances", () => {
    expect(switcher).toMatch(/motion-reduce:transition-none motion-reduce:\[transform:translate3d\(var\(--area-x\),0,0\)\]/);
    expect(switcher).not.toMatch(/setInterval|autoplay/i);
  });

  it("arrow labels reuse the switcher's existing strings (no new vocabulary)", () => {
    expect(src).toMatch(/getTranslations\("common\.nav"\)/);
  });
});

describe("professions cover every sector, not one trade", () => {
  const cards = professionCards();

  it("every catalogue profession has a named sector", () => {
    for (const slug of CATALOGUE_PROFESSION_SLUGS) {
      const sector = professionSector(slug);
      expect(sector, `${slug} has no sector`).not.toBeNull();
      expect(sector, `${slug} fell into "other"`).not.toBe("other");
    }
  });

  it("every profession is a card exactly once", () => {
    expect(cards.map((c) => c.slug).sort()).toEqual([...CATALOGUE_PROFESSION_SLUGS]);
  });

  it("at least twelve sectors are on the row and none holds half of it", () => {
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.sector, (counts.get(c.sector) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(12);
    for (const [sector, n] of counts) {
      expect(n, `${sector} dominates the row`).toBeLessThan(cards.length / 2);
    }
  });

  it("the first cards are one per sector (round-robin), not one trade's list", () => {
    const sectors = new Set(cards.map((c) => c.sector));
    const head = cards.slice(0, sectors.size).map((c) => c.sector);
    expect(new Set(head).size).toBe(sectors.size);
  });

  it("every card is the public board's own profession filter", () => {
    expect(existsSync(join(APP_ROOT, "app/[locale]/(marketing)/jobs/page.tsx"))).toBe(true);
    const board = read("app/[locale]/(marketing)/jobs/page.tsx");
    expect(board).toMatch(/readProfessionSlugParam\(sp\.profession\)/);
    for (const c of cards) expect(c.href).toBe(`/jobs?profession=${c.slug}`);
  });

  it("every sector has an icon and a name in each language the sector list carries", () => {
    for (const c of WORK_CATEGORIES) {
      expect(WORK_AREA_ICONS[SECTOR_ICONS[c.key]], `${c.key} icon`).toBeTruthy();
      // Every label the sector carries (one per routed language it knows).
      const labels = Object.entries(c).filter(([k, v]) => k.length === 2 && typeof v === "string");
      expect(labels.length, `${c.key} labels`).toBeGreaterThanOrEqual(6);
      for (const [loc, value] of labels) {
        expect((value as string).trim(), `${c.key} ${loc}`).not.toBe("");
      }
    }
  });

  it("profession names exist in every locale's catalogue", () => {
    const locales = readdirSync(join(APP_ROOT, "messages")).filter((f) => f.endsWith(".json"));
    for (const f of locales) {
      const loc = f.replace(/\.json$/, "");
      const cat = JSON.parse(read(`messages/${loc}/professions.json`)) as Record<string, string>;
      for (const slug of CATALOGUE_PROFESSION_SLUGS) {
        expect(cat[slug], `${loc} professions.${slug}`).toBeTruthy();
      }
    }
  });
});

describe("function cards are the guarded public intents", () => {
  it("the row is built from PUBLIC_INTENTS and spells no route", () => {
    const src = read("components/marketing/browse-carousels.tsx");
    expect(src).toMatch(/PUBLIC_INTENTS\.flatMap\(/);
    expect(src).not.toMatch(/href[=:]\s*["'`]\//);
    expect(PUBLIC_INTENTS.length).toBe(6);
  });

  it.each(["for-workers", "for-companies", "for-agencies"])(
    "/%s mounts the function row",
    (page) => {
      expect(read(`app/[locale]/(marketing)/${page}/page.tsx`)).toMatch(/<FunctionCarousel \/>/);
    },
  );

  it("the board mounts the profession row only when unfiltered", () => {
    const board = read("app/[locale]/(marketing)/jobs/page.tsx");
    expect(board).toMatch(/\{!profession && !showSaved && \([\s\S]{0,120}<ProfessionCarousel \/>/);
  });
});

describe("titles are translated in all 11 locales", () => {
  const LOCALES = readdirSync(join(APP_ROOT, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  type C = { siteNav: { carousels: Record<string, string> } };
  const en = (JSON.parse(read("messages/en.json")) as C).siteNav.carousels;

  it.each(LOCALES)("%s", (loc) => {
    const c = (JSON.parse(read(`messages/${loc}.json`)) as C).siteNav.carousels;
    for (const key of ["functions", "professions"]) {
      expect(c[key]?.trim(), `${loc} ${key}`).toBeTruthy();
      expect(c[key]).not.toContain("[EN]");
      if (loc !== "en") expect(c[key], `${loc} ${key} untranslated`).not.toBe(en[key]);
    }
  });
});
