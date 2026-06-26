import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";

/**
 * Guard: Work Journal recognition is sector-neutral (owner cross-sector smoke,
 * PR #490). Construction must never be a default/fallback; "svetainės dizainas"
 * must surface the honest website-design reading (NOT the interior/construction
 * reading — production-trust-bugs-p0 issue B), not empty/unknown-only; and a
 * non-construction entry must never produce a construction suggestion.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const engine = read("lib/structuring/universal-recognition.ts");
const sectors = read("lib/structuring/sectors.ts");

const CONSTRUCTION_SLUGS = new Set(
  [...read("lib/structuring/keywords.ts").matchAll(/slug:\s*"([a-z-]+)"/g)].map((m) => m[1]),
);

describe("no construction default / fallback", () => {
  it("the default sector is 'other', never construction", () => {
    expect(sectors).toMatch(/DEFAULT_SECTOR:\s*SectorKey\s*=\s*"other"/);
    expect(sectors).not.toMatch(/DEFAULT_SECTOR[^;]*"construction"/);
    expect(engine).not.toMatch(/DEFAULT_DOMAIN\s*=\s*"construction"/);
  });
  it("the web-design rule does NOT fire on bare 'svetainė' (no silent website pick)", () => {
    // Bare "svetain" must not be a web_design object — the ambiguity is handled
    // by the capability layer, not silently resolved to web.
    const webRule = engine.match(/domain: "web_design"[^}]*}/)?.[0] ?? "";
    expect(webRule).not.toMatch(/"svetain"/);
    expect(webRule).not.toMatch(/"svetaines dizain"/);
  });
});

describe("website-design entry surfaces the honest reading, not empty/unknown-only", () => {
  it("'svetainės dizainas' surfaces the website reading and NOT the interior one", () => {
    const caps = extractJournalSuggestions("Dirbau su svetainės dizainu 9 h").capabilitySuggestions;
    const labels = caps.map((c) => c.label);
    expect(labels).toContain("Interneto svetainės dizainas");
    expect(labels).not.toContain("Interjero dizainas");
    expect(caps.length).toBeGreaterThan(0);
  });
});

describe("non-construction entries never yield a construction suggestion", () => {
  for (const text of [
    "Vairavau CE kategorijos sunkvežimį 10 h",
    "Vertėjavau iš rusų į lietuvių kalbą 3 h",
    "Gaminau lietuviškus patiekalus 6 h",
    "Dariau visokius dalykus 5 h",
  ]) {
    it(`"${text}" → no construction slug`, () => {
      const { skillSlugs } = extractJournalSuggestions(text);
      for (const slug of skillSlugs) expect(CONSTRUCTION_SLUGS.has(slug)).toBe(false);
    });
  }
});
