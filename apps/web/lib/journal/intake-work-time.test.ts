import { describe, expect, it } from "vitest";

import { deriveIntakeWorkTime, intakeOutputFields, intakeWorkTimeFields } from "./intake-work-time";
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

describe("intakeOutputFields — what the work produced rides the same intake (registry 20260911130000)", () => {
  it("a stated output is written as the entry-level quantity in its own unit, beside the fragments", () => {
    const fields = intakeWorkTimeFields("Nuvažiavau 320 km į Klaipėdą, vairavau 8 val.", TODAY);
    expect(fields.fragments_json).toBeTruthy();
    expect(fields.quantity).toBe("320");
    expect(fields.unit_slug).toBe("kilometers");
    expect(fields.quantity_source).toBe("ai_extracted");
    // the canonical rule reads the fragments as time and the km as OUTPUT — never a conflict
    const fragments = parseFragments(fields.fragments_json ?? null);
    const metrics = [
      ...fragments.flatMap((f, i) => [
        { metric_slug: "parsed_fragment", value_text: `${i + 1}|${f.rawPhrase}`, value_numeric: null, unit_slug: null, source: f.source ?? null },
        { metric_slug: "fragment_time", value_text: String(i + 1), value_numeric: f.timeValue ?? null, unit_slug: f.timeUnit ?? null, source: f.source ?? null },
      ]),
      { metric_slug: "quantity", value_text: null, value_numeric: 320, unit_slug: "kilometers", source: "ai_extracted" },
    ];
    const time = deriveEntryWorkTime({ entryId: "e", createdAt: `${TODAY}T10:00:00Z`, metrics });
    expect(time.totalHours).toBe(8);
    expect(time.conflict).toBeNull();
  });

  it("output alone, no time: the quantity is recorded and no duration is invented", () => {
    expect(intakeWorkTimeFields("Iškroviau 36 paletes", TODAY)).toEqual({
      quantity: "36",
      unit_slug: "pallets",
      quantity_source: "ai_extracted",
    });
    expect(intakeOutputFields("Sudėjau 35 m² plytelių")).toEqual({
      quantity: "35",
      unit_slug: "square_meters",
      quantity_source: "ai_extracted",
    });
  });

  it("a span owns the quantity slot: the day's minutes are written and the output is NOT written as time", () => {
    const fields = intakeWorkTimeFields("Dirbau nuo 8 iki 17, 30 min pertrauka, nuvažiavau 200 km", TODAY);
    expect(fields).toEqual({ quantity: "510", unit_slug: "minutes", quantity_source: "ai_extracted" });
  });

  it("nothing stated → nothing; a time figure is never an output", () => {
    expect(intakeOutputFields("Montavau langus objekte")).toEqual({});
    expect(intakeOutputFields("")).toEqual({});
    expect(intakeOutputFields("Dirbau 8 val.")).toEqual({});
  });
});
