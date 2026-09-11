import { describe, expect, it } from "vitest";

import { deriveIntakeWorkTime, intakeWorkTimeFields } from "./intake-work-time";
import { parseFragments } from "./journal-write-core";
import { deriveEntryWorkTime } from "./work-time";

const TODAY = "2026-09-11";

describe("deriveIntakeWorkTime — the stated time becomes time on the record", () => {
  it("per-fragment durations become fragments the write core understands, with machine provenance", () => {
    const t = deriveIntakeWorkTime("Klijavau plyteles 6 val., glaisčiau sienas 2 val.", TODAY);
    expect(t.quantityMinutes).toBeNull();
    const fragments = parseFragments(t.fragmentsJson);
    expect(fragments.map((f) => [f.timeValue, f.timeUnit, f.source, f.selected])).toEqual([
      [6, "hours", "ai_extracted", false],
      [2, "hours", "ai_extracted", false],
    ]);
    // never declares a skill: `selected` stays false on every fragment
    expect(fragments.every((f) => f.selected === false)).toBe(true);
  });

  it("the canonical rule then derives exactly the stated hours, once", () => {
    const t = deriveIntakeWorkTime("Klijavau plyteles 6 val., glaisčiau sienas 2 val.", TODAY);
    const fragments = parseFragments(t.fragmentsJson);
    const metrics = fragments.flatMap((f, i) => [
      { metric_slug: "parsed_fragment", value_text: `${i + 1}|${f.rawPhrase}`, value_numeric: null, unit_slug: null, source: f.source ?? null },
      { metric_slug: "fragment_time", value_text: String(i + 1), value_numeric: f.timeValue ?? null, unit_slug: f.timeUnit ?? null, source: f.source ?? null },
    ]);
    const time = deriveEntryWorkTime({ entryId: "e", createdAt: `${TODAY}T10:00:00Z`, metrics });
    expect(time.totalHours).toBe(8);
    expect(time.lines.every((l) => l.metricSource === "ai_extracted")).toBe(true);
  });

  it("a stated span wins: the break is subtracted and NEVER counted as a work fragment", () => {
    const t = deriveIntakeWorkTime("Šiandien dirbau nuo 8 iki 17, 30 min pertrauka, montavau langus", TODAY);
    expect(t.fragmentsJson).toBeNull();
    expect(t.quantityMinutes).toBe(510);
    expect(intakeWorkTimeFields("Šiandien dirbau nuo 8 iki 17, 30 min pertrauka, montavau langus", TODAY)).toEqual({
      quantity: "510",
      unit_slug: "minutes",
      quantity_source: "ai_extracted",
    });
  });

  it("no time in the text → nothing is invented", () => {
    expect(deriveIntakeWorkTime("Montavau langus objekte", TODAY)).toEqual({ fragmentsJson: null, quantityMinutes: null });
    expect(intakeWorkTimeFields("Montavau langus objekte", TODAY)).toEqual({});
    expect(intakeWorkTimeFields("", TODAY)).toEqual({});
  });

  it("works in the other served languages", () => {
    const en = deriveIntakeWorkTime("Laid tiles for 4 hours", TODAY);
    const ru = deriveIntakeWorkTime("Клал плитку 3 часа", TODAY);
    // English explicit hours: the fragment recognizer is LT/RU-lexicon based,
    // the work-log parser still reads them → entry-level minutes.
    expect(en).toEqual({ fragmentsJson: null, quantityMinutes: 240 });
    expect(parseFragments(ru.fragmentsJson).map((f) => [f.timeValue, f.timeUnit])).toEqual([[3, "hours"]]);
  });
});
