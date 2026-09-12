import { describe, expect, it } from "vitest";

import { deriveIntakeWorkTime, intakeOutputFields, intakeWorkTimeFields } from "./intake-work-time";
import { parseFragments } from "./journal-write-core";
import { deriveEntryWorkTime } from "./work-time";

const TODAY = "2026-09-11";

/** The owner's own day (2026-09-11): the total is stated ONCE and itemised. */
const OWNER_DAY =
  "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val. testavau, 2 val. ieškojau partnerių.";

const toMetrics = (fragmentsJson: string | null) =>
  parseFragments(fragmentsJson).flatMap((f, i) => [
    { metric_slug: "parsed_fragment", value_text: `${i + 1}|${f.rawPhrase}`, value_numeric: null, unit_slug: null, source: f.source ?? null },
    { metric_slug: "fragment_time", value_text: String(i + 1), value_numeric: f.timeValue ?? null, unit_slug: f.timeUnit ?? null, source: f.source ?? null },
  ]);

describe("deriveIntakeWorkTime — the stated total is not one more fragment (P0, 2026-09-11)", () => {
  it("the owner's day records 5 + 2 + 2 — the 9 h header is NOT a fourth fragment", () => {
    const t = deriveIntakeWorkTime(OWNER_DAY, TODAY);
    expect(t.fragments.map((f) => [f.timeValue, f.timeUnit, f.rawPhrase])).toEqual([
      [5, "hours", "5 val. programavau"],
      [2, "hours", "2 val. testavau"],
      [2, "hours", "2 val. ieškojau partnerių"],
    ]);
    expect(t.quantityMinutes).toBeNull();
    // the items add up to the stated 9 h → nothing else is recorded
    expect(t.statedTotalMinutes).toBeNull();
    expect(intakeWorkTimeFields(OWNER_DAY, TODAY)).toEqual({ fragments_json: t.fragmentsJson });
  });

  it("the canonical rule then reads 9 h once, with every phrase's kind of work", () => {
    const t = deriveIntakeWorkTime(OWNER_DAY, TODAY);
    const time = deriveEntryWorkTime({ entryId: "e", createdAt: `${TODAY}T10:00:00Z`, metrics: toMetrics(t.fragmentsJson) });
    expect(time.totalHours).toBe(9);
    expect(time.conflict).toBeNull();
    expect(t.fragments.map((f) => f.activitySlug ?? f.activityLabel)).toEqual([
      "software_developer",
      null,
      "Partnerių paieška / bendradarbiavimas",
    ]);
  });

  it("when the items do NOT add up, the stated total goes to the slot the rule sets aside and names — never added", () => {
    const text = "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val. testavau.";
    const t = deriveIntakeWorkTime(text, TODAY);
    expect(t.fragments.map((f) => f.timeValue)).toEqual([5, 2]);
    expect(t.statedTotalMinutes).toBe(540);
    const fields = intakeWorkTimeFields(text, TODAY);
    expect(fields).toEqual({
      fragments_json: t.fragmentsJson,
      quantity: "540",
      unit_slug: "minutes",
      quantity_source: "ai_extracted",
    });
    const metrics = [
      ...toMetrics(t.fragmentsJson),
      { metric_slug: "quantity", value_text: null, value_numeric: 540, unit_slug: "minutes", source: "ai_extracted" },
    ];
    const time = deriveEntryWorkTime({ entryId: "e", createdAt: `${TODAY}T10:00:00Z`, metrics });
    expect(time.totalHours).toBe(7);
    expect(time.conflict).toEqual({ reason: "entry_quantity_ignored_fragments_present", value: 540, unit: "minutes" });
  });

  it("a stated output keeps the one entry-level slot; the mismatched total is then not written as anything", () => {
    const text = "Šiandien 9 val. dirbau: 5 val. klojau plyteles, 2 val. glaisčiau, 30 m².";
    const fields = intakeWorkTimeFields(text, TODAY);
    expect(fields.unit_slug).toBe("square_meters");
    expect(fields.quantity).toBe("30");
  });

  it("the same day in Russian", () => {
    const t = deriveIntakeWorkTime("Сегодня 9 часов работал: 5 ч. программировал, 2 ч. тестировал, 2 ч. искал партнеров.", TODAY);
    expect(t.fragments.map((f) => f.timeValue)).toEqual([5, 2, 2]);
    expect(t.statedTotalMinutes).toBeNull();
  });
});

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
    expect(deriveIntakeWorkTime("Montavau langus objekte", TODAY)).toEqual({
      fragmentsJson: null,
      fragments: [],
      quantityMinutes: null,
      statedTotalMinutes: null,
    });
    expect(intakeWorkTimeFields("Montavau langus objekte", TODAY)).toEqual({});
    expect(intakeWorkTimeFields("", TODAY)).toEqual({});
  });

  it("works in the other served languages", () => {
    const en = deriveIntakeWorkTime("Laid tiles for 4 hours", TODAY);
    const ru = deriveIntakeWorkTime("Клал плитку 3 часа", TODAY);
    // English explicit hours are a TIMED PHRASE like the LT / RU ones (issue
    // #1689, measured 2026-09-12): before, "4 hours" reached only the
    // entry-level minutes and the skill the phrase names could claim nothing.
    expect(parseFragments(en.fragmentsJson).map((f) => [f.rawPhrase, f.timeValue, f.timeUnit])).toEqual([
      ["Laid tiles for 4 hours", 4, "hours"],
    ]);
    expect(en.quantityMinutes).toBeNull();
    expect(parseFragments(ru.fragmentsJson).map((f) => [f.timeValue, f.timeUnit])).toEqual([[3, "hours"]]);
  });

  it("reads the unit forms of every routed language, and a bare `d` is never a day (#1689)", () => {
    const timed = (text: string) =>
      deriveIntakeWorkTime(text, TODAY).fragments.map((f) => [f.timeValue, f.timeUnit]);
    expect(timed("5 hrs laying tiles")).toEqual([[5, "hours"]]);
    expect(timed("5 uur tegels gelegd")).toEqual([[5, "hours"]]);
    expect(timed("5 Std. Fliesen verlegt")).toEqual([[5, "hours"]]);
    expect(timed("5 Stunden Fliesen verlegt")).toEqual([[5, "hours"]]);
    expect(timed("2 Tage gestrichen")).toEqual([[2, "days"]]);
    expect(timed("2 dagen geschilderd")).toEqual([[2, "days"]]);
    expect(timed("30 Minuten geputzt")).toEqual([[30, "minutes"]]);
    // A header in Dutch / German / English is the day's total, its items the work.
    const nl = deriveIntakeWorkTime("Vandaag 9 uur gewerkt: 5 uur getegeld, 4 uur geschilderd", TODAY);
    expect(nl.fragments.map((f) => [f.rawPhrase, f.timeValue])).toEqual([
      ["5 uur getegeld", 5],
      ["4 uur geschilderd", 4],
    ]);
    expect(nl.statedTotalMinutes).toBeNull(); // 5 + 4 = 9 — the items add up
    expect(timed("5 Std. Fliesen verlegt und 4 Std. gestrichen")).toEqual([[5, "hours"], [4, "hours"]]);
    // Quantities that begin with a unit letter are never durations.
    expect(timed("Sumontavau 5 duris")).toEqual([]);
    expect(timed("Pakroviau 5 dėžes")).toEqual([]);
    expect(timed("Installed 5 doors")).toEqual([]);
    expect(timed("5 Stühle repariert")).toEqual([]);
    expect(timed("Išvežiau 5 užsakymus")).toEqual([]);
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
