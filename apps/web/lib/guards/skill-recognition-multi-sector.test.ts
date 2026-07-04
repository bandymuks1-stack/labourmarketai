import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SECTORS,
  DEFAULT_SECTOR,
  sectorKeys,
  isKnownSector,
} from "@/lib/structuring/sectors";
import {
  ACTIVITY_HINTS_LT,
  CONSTRUCTION_SKILL_HINT_SLUGS,
} from "@/lib/structuring/keywords";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";

/**
 * Guard: skill recognition is MULTI-SECTOR, not construction-only.
 *
 * Locks in the requirement that construction is one sector among many — never
 * the system default — and that the journal recognition layer produces honest
 * label-only suggestions for non-construction work without faking a catalogue
 * skill or any verification (PLATFORM_DOCTRINE §7).
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: the sector registry is sector-agnostic", () => {
  it("lists more than one sector", () => {
    expect(SECTORS.length).toBeGreaterThan(3);
  });

  it("includes construction as ONE ordinary sector (not the only one)", () => {
    const keys = sectorKeys();
    expect(keys).toContain("construction");
    expect(keys.filter((k) => k !== "construction").length).toBeGreaterThan(3);
  });

  it("does NOT default to construction", () => {
    expect(DEFAULT_SECTOR).not.toBe("construction");
    expect(DEFAULT_SECTOR).toBe("other");
  });

  it("source has no construction default constant", () => {
    const src = read("lib/structuring/sectors.ts");
    expect(src).toMatch(/DEFAULT_SECTOR[^\n]*=\s*"other"/);
    expect(src).not.toMatch(/DEFAULT_SECTOR[^\n]*=\s*"construction"/);
  });

  it("recognises every key it ships", () => {
    for (const k of sectorKeys()) expect(isKnownSector(k)).toBe(true);
    expect(isKnownSector("not-a-sector")).toBe(false);
  });
});

describe("Guard: the activity lexicon spans many sectors", () => {
  const sectorsCovered = new Set(
    ACTIVITY_HINTS_LT.map((r) => r.sector).filter(Boolean),
  );

  it("covers at least five distinct sectors", () => {
    expect(sectorsCovered.size).toBeGreaterThanOrEqual(5);
  });

  it("covers at least four NON-construction sectors", () => {
    const nonConstruction = [...sectorsCovered].filter(
      (s) => s !== "construction",
    );
    expect(nonConstruction.length).toBeGreaterThanOrEqual(4);
  });

  it("covers the owner-named sectors end-to-end", () => {
    // The lexicon must recognise day-work across these sectors (construction
    // is just one of them). "other" is the honest fallback, not a lexicon row.
    for (const s of [
      "construction",
      "transport_logistics",
      "retail_sales",
      "hospitality_food",
      "care_health",
      "office_admin",
      "it_software",
      "education",
      "cleaning_facility",
      "agriculture",
    ]) {
      expect(
        sectorsCovered.has(s as never),
        `activity lexicon is missing sector "${s}"`,
      ).toBe(true);
    }
  });

  it("every tagged sector is a known sector key", () => {
    for (const r of ACTIVITY_HINTS_LT) {
      if (r.sector) expect(isKnownSector(r.sector)).toBe(true);
    }
  });
});

describe("Guard: non-construction entries produce FIRST-CLASS non-construction suggestions", () => {
  // Universal promotion (2026-07-04, owner mandate): each input is real
  // day-work in a different sector. The parser must recognise the activity AND
  // attach the universal catalogue skill for it (skill-names.json + migration
  // 20260704120000) — first-class, exactly like a construction trade — while
  // NEVER leaking a construction slug. Suggestions stay reviewable (§7);
  // first-class ≠ auto-verified.
  const NON_CONSTRUCTION_INPUTS: { text: string; label: RegExp; skill: string }[] = [
    { text: "Dirbau 3 valandas kasininku parduotuvėje", label: /kasinink|parduotuv/i, skill: "cashier" },
    { text: "2 valandas programavau ir taisiau kodą", label: /programav/i, skill: "programming" },
    { text: "1 valandą vairavau ir vežiau klientus", label: /vairav|pavež/i, skill: "driving" },
    { text: "gaminau maistą virtuvėje 4 valandas", label: /maist|virtuv/i, skill: "cooking" },
    { text: "tvarkiau buhalteriją biure 3 valandas", label: /biuro|administ/i, skill: "bookkeeping" },
  ];

  for (const { text, label, skill } of NON_CONSTRUCTION_INPUTS) {
    it(`recognises "${text}" with the first-class ${skill} skill`, () => {
      const s = extractJournalSuggestions(text);
      expect(s.hasAny).toBe(true);
      const frag = s.fragments.find(
        (f) => f.activityLabel && label.test(f.activityLabel),
      );
      expect(frag, `expected a fragment matching ${label}`).toBeTruthy();
      // First-class: the universal catalogue skill is suggested…
      expect(s.skillSlugs).toContain(skill);
      // …and construction NEVER leaks in as a default.
      for (const slug of s.skillSlugs) {
        expect(
          CONSTRUCTION_SKILL_HINT_SLUGS.has(slug),
          `construction slug '${slug}' leaked into non-construction text`,
        ).toBe(false);
      }
    });
  }
});

describe("Guard: construction still works (no regression)", () => {
  it("recognises a construction skill from a construction entry", () => {
    const s = extractJournalSuggestions("Klojau plyteles 5 valandas");
    expect(s.skillSlugs).toContain("tiling");
  });
});
