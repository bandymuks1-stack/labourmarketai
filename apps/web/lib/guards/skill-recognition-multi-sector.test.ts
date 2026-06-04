import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SECTORS,
  DEFAULT_SECTOR,
  sectorKeys,
  isKnownSector,
} from "@/lib/structuring/sectors";
import { ACTIVITY_HINTS_LT } from "@/lib/structuring/keywords";
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

  it("every tagged sector is a known sector key", () => {
    for (const r of ACTIVITY_HINTS_LT) {
      if (r.sector) expect(isKnownSector(r.sector)).toBe(true);
    }
  });
});

describe("Guard: non-construction entries produce honest label-only suggestions", () => {
  // Each input is real day-work in a different sector. The parser must
  // recognise the activity (a confirmable label) but attach NO catalogue
  // skill slug — there is no verified construction skill behind cashier /
  // driver / programmer / cook / cleaner work.
  const NON_CONSTRUCTION_INPUTS: { text: string; label: RegExp }[] = [
    { text: "Dirbau 3 valandas kasininku parduotuvėje", label: /kasinink|parduotuv/i },
    { text: "2 valandas programavau ir taisiau kodą", label: /programav/i },
    { text: "1 valandą vairavau ir vežiau klientus", label: /vairav|pavež/i },
    { text: "gaminau maistą virtuvėje 4 valandas", label: /maist|virtuv/i },
    { text: "tvarkiau buhalteriją biure 3 valandas", label: /biuro|administ/i },
  ];

  for (const { text, label } of NON_CONSTRUCTION_INPUTS) {
    it(`recognises "${text}" as a label-only fragment`, () => {
      const s = extractJournalSuggestions(text);
      expect(s.hasAny).toBe(true);
      const frag = s.fragments.find(
        (f) => f.activityLabel && label.test(f.activityLabel),
      );
      expect(frag, `expected a fragment matching ${label}`).toBeTruthy();
      // Honest: a recognised label, but NO fake catalogue skill slug.
      expect(frag!.activitySlug).toBeNull();
      // And no construction skill slug leaks into the catalogue bucket.
      expect(s.skillSlugs).toEqual([]);
    });
  }
});

describe("Guard: construction still works (no regression)", () => {
  it("recognises a construction skill from a construction entry", () => {
    const s = extractJournalSuggestions("Klojau plyteles 5 valandas");
    expect(s.skillSlugs).toContain("tiling");
  });
});
