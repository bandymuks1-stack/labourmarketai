import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";

/**
 * Composer skill-suggestion guard (fix/cv).
 *
 * Pins, at the source + recognition level (no DOM needed):
 *   1. the composer opens in EDIT mode with the original entry text prefilled,
 *      so suggestions can be reviewed while editing;
 *   2. the skills bucket renders the friendly heading + one honest note, with
 *      NO per-card technical provenance triad;
 *   3. the owner example "Dirbau su svetainės dizainu 9 h" surfaces BOTH design
 *      readings (web + interior) and NO construction.
 */

const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
const COMPOSER = "components/app/journal-entry-composer.tsx";

describe("Guard: composer shows suggestions in edit mode (text prefilled)", () => {
  const src = read(COMPOSER);
  it("prefills the textarea from the edited entry's original text", () => {
    expect(src).toMatch(/useState\(editingEntry\?\.originalText \?\? ""\)/);
  });
  it("renders the skills suggestion bucket + friendly heading (no note paragraph)", () => {
    expect(src).toMatch(/tBucket\("skills"\)/);
    expect(src).toMatch(/tS\("groupEyebrow"\)/);
    // Quiet UI: the bucket-level note paragraph was removed.
    expect(src).not.toMatch(/skillProvenanceNote/);
  });
  it("does not render the per-card technical provenance triad", () => {
    expect(src).not.toMatch(/SuggestionProvenanceLabel/);
  });
});

describe("Guard: 'Dirbau su svetainės dizainu 9 h' → web + interior, no construction", () => {
  const CONSTRUCTION = new Set(SKILL_HINTS_LT.map((h) => h.slug));
  const r = extractJournalSuggestions("Dirbau su svetainės dizainu 9 h");
  // The composer renders the named-capability readings from `capabilitySuggestions`.
  const caps = (r.capabilitySuggestions ?? []).map((s) => s.label);

  it("shows the web-design reading", () => {
    expect(caps.some((c) => /interneto svetainės dizainas/i.test(c)), `caps: ${caps.join(", ")}`).toBe(true);
  });
  it("shows the interior reading", () => {
    expect(caps.some((c) => /interjero dizainas/i.test(c)), `caps: ${caps.join(", ")}`).toBe(true);
  });
  it("surfaces NO construction skill for this text", () => {
    const got = r.skillSlugs.filter((s) => CONSTRUCTION.has(s));
    expect(got, `unexpected construction: ${got.join(", ")}`).toEqual([]);
  });
});
