import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";

/**
 * A WRITTEN NUMBER IS A DURATION IN EVERY ACTIVE LANGUAGE (owner P0
 * 2026-11-23, #3679; SIMPLIFICATION_PLAN M9, DUPLICATION_AUDIT AI-9).
 *
 * The chat preview read "two hours" through the shared `parseWordNumber`, but
 * the saved entry went through the journal recognizer. That recognizer knew
 * only Lithuanian words, capped at 20, so English, Polish and German word
 * durations, and "dvidešimt penkias minutes" (read as 5), never reached the
 * entry as said. One lexicon now serves both: `lib/structuring/word-numbers.ts`.
 */

const WEB = join(__dirname, "..", "..");
const time = (s: string) => extractJournalSuggestions(s).time ?? null;

describe("journal durations from written numbers (AI-9)", () => {
  it("reads a written number before a duration unit, in the active languages", () => {
    expect(time("dirbau dvi valandas")).toEqual({ value: 2, unitSlug: "hours" });
    expect(time("dirbau dvi valandas")).toEqual(time("dirbau 2 valandas"));
    expect(time("Šiandien dirbau dvidešimt penkias minutes")).toEqual({ value: 25, unitSlug: "minutes" });
    expect(time("Laid tiles for three hours")).toEqual({ value: 3, unitSlug: "hours" });
    expect(time("pracowałem dwie godziny")).toEqual({ value: 2, unitSlug: "hours" });
    expect(time("zwei Stunden gearbeitet")).toEqual({ value: 2, unitSlug: "hours" });
    expect(time("свободен два дня")).toEqual(time("свободен 2 дня"));
  });

  it("a written number counts only before a whole unit word", () => {
    // Dutch "ten minste" (at least): the English "ten" is no ten minutes.
    expect(time("De opslag moet ten minste één bron hebben.")).toBeNull();
    // The idioms still read as before.
    expect(time("pusvalandį tvarkiau")).toEqual({ value: 0.5, unitSlug: "hours" });
    expect(time("один час работал")).toEqual({ value: 1, unitSlug: "hours" });
  });

  it("the journal recognizer keeps no number lexicon of its own", () => {
    const src = readFileSync(join(WEB, "lib/structuring/extract-journal-suggestions.ts"), "utf8");
    expect(src).not.toMatch(/LT_NUMBER_WORDS|const\s+\w*NUMBER_WORDS\s*[:=]/);
    expect(src).toMatch(/from\s+"\.\/word-numbers"/);
  });
});
