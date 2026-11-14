import { describe, expect, it } from "vitest";

import { extractJournalSuggestions } from "./extract-journal-suggestions";
import { deriveIntakeWorkTime, intakeWorkTimeFields } from "@/lib/journal/intake-work-time";

/**
 * A DAY TOTAL THAT CONTAINS ITS PARTS (#3354). A 15-hour day that includes
 * 2 hours of coordination was recorded as two items, 15 + 2, and every
 * reader summed them to 17. Production had live entries of exactly this
 * shape (a labelled total, then one part in brackets); the first sentence
 * below has that shape with invented words.
 */
const minutes = (text: string): number =>
  extractJournalSuggestions(text).fragments.reduce((sum, f) => {
    if (!f.time) return sum;
    if (f.time.unitSlug === "hours") return sum + f.time.value * 60;
    if (f.time.unitSlug === "minutes") return sum + f.time.value;
    return sum;
  }, 0);

const intakeMinutes = (text: string): number => {
  const t = deriveIntakeWorkTime(text, "2026-11-06");
  return t.fragments.reduce(
    (sum, f) => sum + (f.timeUnit === "hours" ? f.timeValue * 60 : f.timeUnit === "minutes" ? f.timeValue : 0),
    0,
  );
};

const LABELLED =
  "2026-11-06. Darbo laikas: 15 valandų. Tikrinau objektus ir derinau grafikus, rašiau ataskaitas bei kalbėjausi su klientais. Vakare vyko koordinavimas su komanda (2 valandos per dieną). Viskas pagal planą; rytoj tęsiu.";

describe("a 15 h day that includes 2 h of coordination is 15 h, never 17", () => {
  it.each([
    ["labelled total, part in brackets (the production shape)", LABELLED],
    ["Lithuanian 'iš jų'", "Dirbau 15 val., iš jų 2 val. koordinavimas."],
    ["Lithuanian 'įskaitant'", "Dirbau 15 val., įskaitant 2 val. koordinavimo."],
    ["English 'including'", "Worked 15 h today, including 2 h coordination."],
    ["English 'of which'", "Worked 15 hours, of which 2 hours coordination."],
  ])("%s", (_name, text) => {
    expect(minutes(text)).toBe(15 * 60);
    expect(intakeMinutes(text)).toBe(15 * 60);
    const s = extractJournalSuggestions(text);
    expect(s.statedTotal).toMatchObject({ value: 15, unitSlug: "hours", includesParts: true, matchesFragments: true });
  });

  it("the part keeps its own 2 h, the rest of the day is 13 h in the person's own words", () => {
    const s = extractJournalSuggestions("Dirbau 15 val., iš jų 2 val. koordinavimas.");
    const times = s.fragments.filter((f) => f.time).map((f) => [f.time!.value, f.time!.unitSlug]);
    expect(times).toContainEqual([2, "hours"]);
    expect(times).toContainEqual([13, "hours"]);
    expect(s.fragments.some((f) => /15 val/.test(f.rawPhrase))).toBe(true);
  });

  it("the chat / MCP save writes no set-aside total: the items already add up to it", () => {
    const fields = intakeWorkTimeFields("Dirbau 15 val., iš jų 2 val. koordinavimas.", "2026-11-06");
    expect(fields.quantity).toBeUndefined();
    const items = JSON.parse(fields.fragments_json) as { timeValue: number; timeUnit: string }[];
    expect(items.reduce((s, f) => s + (f.timeUnit === "hours" ? f.timeValue * 60 : f.timeValue), 0)).toBe(900);
  });

  it("when the parts fill the whole day there is no empty rest", () => {
    const s = extractJournalSuggestions("Dirbau 4 val., iš jų 2 val. koordinavimas ir 2 val. ataskaitos.");
    expect(minutes("Dirbau 4 val., iš jų 2 val. koordinavimas ir 2 val. ataskaitos.")).toBe(240);
    expect(s.fragments.filter((f) => f.time).every((f) => f.time!.value > 0)).toBe(true);
  });
});

describe("nothing is read as a total without a signal", () => {
  it("two items are two items (unchanged)", () => {
    expect(minutes("Klijavau plyteles 6 val., glaisčiau sienas 2 val.")).toBe(8 * 60);
    expect(extractJournalSuggestions("Klijavau plyteles 6 val., glaisčiau sienas 2 val.").statedTotal).toBeNull();
  });

  it("a bare larger figure followed by a smaller one, with no inclusion word, stays two items", () => {
    expect(minutes("Dirbau 8 val. Po to 2 val. vairavau.")).toBe(10 * 60);
  });

  it("parts that exceed the stated total are never squeezed into it", () => {
    const s = extractJournalSuggestions("Dirbau 3 val., iš jų 2 val. koordinavimas ir 2 val. ataskaitos.");
    expect(s.statedTotal?.includesParts).not.toBe(true);
  });

  it("a total that names its own work is an item, not a container", () => {
    expect(extractJournalSuggestions("Klijavau plyteles 6 val., iš jų 2 val. vonioje.").statedTotal?.includesParts).not.toBe(
      true,
    );
  });
});
