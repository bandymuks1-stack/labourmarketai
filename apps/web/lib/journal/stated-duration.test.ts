import { describe, expect, it } from "vitest";

import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { statedDurationCount } from "@/lib/journal/unconfirmed-work-time";

/**
 * FULL_JOURNAL_HOURS_NOT_STRUCTURED — the full form reads a stated duration
 * with the SAME recognizer chat and quick-record use, and never invents one.
 */
const count = (text: string) => statedDurationCount(extractJournalSuggestions(text));

describe("a duration the worker states is found; vague text invents nothing", () => {
  it("'2 valandas' / '2h' are one duration", () => {
    expect(count("dirbau 2 valandas montavau gipso pertvaras")).toBe(1);
    expect(count("montavau pertvaras 2h")).toBe(1);
  });

  it("per-item durations count per item, not as an extra total", () => {
    expect(count("Klijavau plyteles 6 val., glaisčiau sienas 2 val.")).toBe(2);
  });

  it("text with no time states none — nothing is made up", () => {
    expect(count("montavau gipso pertvaras")).toBe(0);
    expect(count("dirbau visą dieną")).toBe(0);
    expect(count("")).toBe(0);
  });
});
