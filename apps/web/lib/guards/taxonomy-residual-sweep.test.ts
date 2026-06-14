import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isKnownSector, sectorKeys } from "@/lib/structuring/sectors";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";

/**
 * Locks the construction-only residual sweep:
 *  - match-preview and the operator candidate pool source their work types from
 *    the shared multi-sector taxonomy (lib/taxonomy/work-categories), not a
 *    hardcoded construction TRADE_SLUGS list.
 *  - the recognition lexicon now spans manufacturing day-work too (label-only,
 *    no fake catalogue skill — §7).
 */
const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("taxonomy residual sweep — work-categories is the single source", () => {
  it("match-preview uses the shared taxonomy, not a construction TRADE_SLUGS list", () => {
    const src = read("app/[locale]/(marketing)/match-preview/page.tsx");
    expect(src).toContain("buildWorkCategoryOptions");
    expect(src).not.toMatch(/const TRADE_SLUGS/);
  });

  it("the candidate pool labels come from the shared taxonomy", () => {
    const src = read("app/[locale]/dashboard/admin/candidate-pool/page.tsx");
    expect(src).toContain("buildWorkTypeLabelMap");
    // legacy slugs are kept only as a backward-compatible label fallback
    expect(src).not.toMatch(/const TRADE_SLUGS/);
  });

  it("the match-preview form renders sector optgroups", () => {
    const src = read("components/app/match-preview-form.tsx");
    expect(src).toContain("<optgroup");
  });
});

describe("recognition now covers manufacturing day-work", () => {
  it("manufacturing is a known, shipped sector", () => {
    expect(isKnownSector("manufacturing")).toBe(true);
    expect(sectorKeys()).toContain("manufacturing");
  });

  it("recognises factory/assembly work as an honest label-only fragment", () => {
    const s = extractJournalSuggestions("Dirbau prie konvejerio ir surinkau detales 6 valandas");
    expect(s.hasAny).toBe(true);
    const frag = s.fragments.find((f) => f.activityLabel && /surink|gamyb/i.test(f.activityLabel));
    expect(frag, "expected a manufacturing label fragment").toBeTruthy();
    // No fake catalogue skill behind it.
    expect(frag!.activitySlug).toBeNull();
  });

  it("does not misclassify cooking as manufacturing", () => {
    const s = extractJournalSuggestions("gaminau maistą virtuvėje 4 valandas");
    const frag = s.fragments.find((f) => f.activityLabel && /maist|virtuv/i.test(f.activityLabel));
    expect(frag, "cooking must still read as hospitality, not manufacturing").toBeTruthy();
  });
});
