import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  CATALOGUE_PROFESSION_SLUGS,
  professionCards,
  professionSector,
} from "@/lib/navigation/profession-sectors";
import { WORK_CATEGORIES } from "@/lib/taxonomy/work-categories";

/**
 * THE PROFESSION CATALOGUE COVERS EVERY SECTOR (owner P0 2026-11-12, "every
 * sector, not one trade"): each catalogue profession has a named sector (not
 * "other"), at least twelve sectors are present, none dominates, the first
 * cards are one per sector, and every card is the public board's own
 * closed-set profession filter.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

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

  it("every sector has a name in each language the sector list carries", () => {
    for (const c of WORK_CATEGORIES) {
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

