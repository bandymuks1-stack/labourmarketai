import { describe, expect, it } from "vitest";

import {
  allocateHours,
  canonicalPlaces,
  classifySegment,
  extractSiteFromText,
  placeParts,
  resolvePlace,
  segmentsOf,
  similarity,
  splitContextLabel,
  toSegment,
} from "./work-context";

/**
 * Every case below is a real line of the owner's `work_history_2025_part3.xlsx`
 * (2026-09-16), re-read locally with the reader production used. The rules
 * are the owner command §5–§7: `A; B` is two objects, an activity is not a
 * site, a typo with the same house number is the same place, a different
 * number never is, and a total is never split by guess.
 */

const OBJ = (id: string, name: string) => ({ id, name });

describe("a composite cell is several contexts, never one object", () => {
  it("splits on semicolons and keeps every spelling", () => {
    expect(splitContextLabel("Hoofdgracht 3; Kantoor")).toEqual(["Hoofdgracht 3", "Kantoor"]);
    expect(splitContextLabel("Hoofdgracht 1; Hoofdgracht 3; Hoofdgracht 13; Kantoor")).toEqual([
      "Hoofdgracht 1",
      "Hoofdgracht 3",
      "Hoofdgracht 13",
      "Kantoor",
    ]);
  });
  it("three unique objects across the owner's two examples", () => {
    const all = new Set([
      ...splitContextLabel("Hoofdgracht 3; Kantoor"),
      ...splitContextLabel("Hoofdgracht 3; Hoofdgracht 5"),
    ]);
    expect([...all].sort()).toEqual(["Hoofdgracht 3", "Hoofdgracht 5", "Kantoor"]);
  });
  it("a slash does not split — it is one activity label", () => {
    expect(splitContextLabel("Administraciniai/koordinavimo darbai")).toEqual([
      "Administraciniai/koordinavimo darbai",
    ]);
  });
  it("a repeated place inside one cell is one context", () => {
    expect(splitContextLabel("Travers 19; Travers 19")).toEqual(["Travers 19"]);
  });
  it("never produces a composite label", () => {
    for (const s of segmentsOf("Hoofdgracht 3; Hoofdgracht 5; Nieuwe Havenweg 81; Kantoor")) {
      expect(s.label).not.toContain(";");
    }
  });
});

describe("a place, an activity and a duration note are told apart by their words", () => {
  it("addresses and named places are places", () => {
    for (const l of ["Hoofdgracht 3", "Nieuwe Havenweg 81", "Kantoor", "Bussum", "2e Nieuwstraat", "Walgang 12"]) {
      expect(classifySegment(l), l).toBe("place");
    }
  });
  it("administrative / coordination work is an activity, not a site", () => {
    expect(classifySegment("Administraciniai/koordinavimo darbai")).toBe("activity");
    expect(classifySegment("Administratie werk")).toBe("activity");
  });
  it("a duration is a note, not a site", () => {
    expect(classifySegment("2 uur - garantie")).toBe("note");
    expect(classifySegment("7 val.")).toBe("note");
  });
  it("house numbers are read off the folded key, with or without a space", () => {
    expect(placeParts("hoofdgracht 13")).toEqual({ street: "hoofdgracht", number: "13" });
    expect(placeParts("hofdracht3")).toEqual({ street: "hofdracht", number: "3" });
    expect(placeParts("2e nieuwstraat")).toEqual({ street: "2e nieuwstraat", number: null });
    expect(placeParts("kantoor")).toEqual({ street: "kantoor", number: null });
  });
});

describe("resolution merges typos with the same house number and never different numbers", () => {
  const known = [
    OBJ("a", "Hoofdgracht 3"),
    OBJ("b", "Hoofdgracht 5"),
    OBJ("c", "Hoofdgracht 13"),
    OBJ("d", "Anne Franklaan 16"),
    OBJ("e", "Kantoor"),
    OBJ("f", "Travers 19"),
  ];
  it("the exact label matches at confidence 1", () => {
    const r = resolvePlace(toSegment("Hoofdgracht 3"), known);
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(r.place.id).toBe("a");
  });
  it.each([
    ["Hoofdgraht 13", "c"],
    ["Hoofdraht 13", "c"],
    ["Hoofdgrat 5", "b"],
    ["Hofdracht3", "a"],
    ["Anna Franklin 16", "d"],
  ])("%s is proposed as the same place, visibly derived", (label, id) => {
    const r = resolvePlace(toSegment(label), known);
    expect(r.kind).toBe("proposed");
    if (r.kind === "proposed") {
      expect(r.place.id).toBe(id);
      expect(r.method).toBe("typo_same_house_number");
      expect(r.confidence).toBeLessThan(1);
      expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });
  it("a different house number on the same street is a different place", () => {
    expect(resolvePlace(toSegment("Hoofdgracht 1"), known).kind).toBe("new");
    expect(resolvePlace(toSegment("Hoofdgraht 1"), known).kind).toBe("new");
  });
  it("a street too far from any spelling is a genuine question, not a merge", () => {
    // `Hoofddienst 13` shares the number with Hoofdgracht 13 but not the street.
    const r = resolvePlace(toSegment("Hoofddienst 13"), known);
    expect(r.kind).toBe("new");
    expect(similarity("hoofddienst", "hoofdgracht")).toBeLessThan(0.6);
  });
  it("a street without a number resolves to its single numbered place at low confidence", () => {
    const r = resolvePlace(toSegment("Travers"), known);
    expect(r.kind).toBe("proposed");
    if (r.kind === "proposed") {
      expect(r.place.id).toBe("f");
      expect(r.method).toBe("street_without_number");
      expect(r.confidence).toBe(0.6);
    }
  });
  it("a street shared by several numbered places is AMBIGUOUS — the human decides", () => {
    const r = resolvePlace(toSegment("Hoofdgracht"), known);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("an unknown town is new, not forced onto anything", () => {
    expect(resolvePlace(toSegment("Bussum"), known).kind).toBe("new");
  });
  it("an activity segment is never resolved to a place", () => {
    expect(resolvePlace(toSegment("Administraciniai/koordinavimo darbai"), known).kind).toBe("new");
  });
});

describe("the file's own places cluster by most frequent spelling", () => {
  it("rarer typos fold into the frequent spelling; distinct numbers stay distinct", () => {
    const segs = [
      ...Array.from({ length: 40 }, () => "Hoofdgracht 3"),
      "Hoofdgraht 3",
      "Hofdracht3",
      ...Array.from({ length: 8 }, () => "Hoofdgracht 5"),
      "Hoofdgrat 5",
      "Travers 19",
      "Travers 19",
      "Travers",
      "Kantoor",
      "Kantoor",
      "Administraciniai/koordinavimo darbai",
      "2 uur - garantie",
    ].map(toSegment);
    const places = canonicalPlaces(segs, []);
    const names = places.map((p) => p.name).sort();
    expect(names).toEqual(["Hoofdgracht 3", "Hoofdgracht 5", "Kantoor", "Travers 19"]);
    const h3 = places.find((p) => p.name === "Hoofdgracht 3")!;
    expect(h3.rows).toBe(42);
    expect(h3.spellings.map((s) => s.label).sort()).toEqual(["Hofdracht3", "Hoofdgraht 3"]);
    const t = places.find((p) => p.name === "Travers 19")!;
    expect(t.spellings.map((s) => s.label)).toEqual(["Travers"]);
    // Not places: never clustered, never created.
    expect(names).not.toContain("Administraciniai/koordinavimo darbai");
    expect(names).not.toContain("2 uur - garantie");
  });
  it("each canonical place is resolved once against the organization's objects", () => {
    const places = canonicalPlaces(
      ["Hoofdgracht 3", "Hoofdgracht 3", "Walgang 12"].map(toSegment),
      [OBJ("x", "Hoofdgracht 3")],
    );
    const h3 = places.find((p) => p.name === "Hoofdgracht 3")!;
    expect(h3.existing?.id).toBe("x");
    expect(h3.existingMethod).toBe("exact_label");
    expect(places.find((p) => p.name === "Walgang 12")!.existing).toBeNull();
  });
});

describe("the site is read from the leading words of the text when the cell is empty", () => {
  const known = [
    { id: null, name: "Hoofdgracht 13" },
    { id: null, name: "Anne Franklaan 16" },
    { id: null, name: "Hoofdgracht 3" },
  ];
  it.each([
    ["Hoofdgraht 13 (7 uur) Dakmontage, dakpannen tillen.", "Hoofdgraht 13"],
    ["Hofdracht3 - raaminstallatie op de 3e verdieping", "Hofdracht3"],
    ["Anna Franklin 16 Voor het waterdicht maken van de vloer", "Anna Franklin 16"],
    ["Hoofddienst 13 Verwijdering van dakshingles", "Hoofddienst 13"],
  ])("an address opening: %s", (text, label) => {
    const s = extractSiteFromText(text, known);
    expect(s?.label).toBe(label);
    expect(s?.method).toBe("address_at_text_start");
    expect(s?.confidence).toBeLessThan(1);
  });
  it("a known street without a number at the start is found through the known places", () => {
    const s = extractSiteFromText("anna franklaan Meubels in elkaar zetten", known);
    expect(s?.label).toBe("anna franklaan");
    expect(s?.method).toBe("known_place_at_text_start");
  });
  it("a text that names no recognisable site leaves the site UNKNOWN", () => {
    expect(extractSiteFromText("Viktar", known)).toBeNull();
    expect(extractSiteFromText("Bussum Montage van OSB en gipsplaten.", known)).toBeNull();
    expect(extractSiteFromText("", known)).toBeNull();
    expect(extractSiteFromText(null, known)).toBeNull();
  });
  it("a duration at the start is not an address", () => {
    expect(extractSiteFromText("2 uur garantie werk", known)).toBeNull();
  });
});

describe("per-place hours come from the text or stay unknown — never divided", () => {
  const H13 = { name: "Hoofdgracht 13", spellings: ["Hoofdgraht 13"] };
  const H3 = { name: "Hoofdgracht 3", spellings: ["Hoofdgraht 3"] };
  const H5 = { name: "Hoofdgracht 5", spellings: [] as string[] };
  it("a single place carries the day's total", () => {
    expect(allocateHours("anything", [H3], 9)).toEqual({ method: "single_place", hours: [9], consistent: null });
  });
  it("explicit figures per section are read and checked against the total", () => {
    const a = allocateHours(
      "Hoofdgraht 13 (7 uur) Dakmontage, dakpannen tillen, schoonmaken. Hoofdgraht 3 (2 uur) Gbk zagen volgens Roni's afmetingen.",
      [H13, H3],
      9,
    );
    expect(a).toEqual({ method: "explicit_in_text", hours: [7, 2], consistent: true });
  });
  it("Dutch prose with the figure after the sentence, comma decimals included", () => {
    const a = allocateHours(
      "Hoofdgracht 3\n\nAankoop van bouwmaterialen, plaatsen van dakpannen 8 uur\n\nHoofdgracht 5\n\nTegels uitsnijden. 1 uur",
      [H3, H5],
      9,
    );
    expect(a).toEqual({ method: "explicit_in_text", hours: [8, 1], consistent: true });
    const b = allocateHours("Hoofdgraht 13 Dakpannen demonteren 2,5 uur. Hoofdgraht 3 Rest.", [H13, H3], 9);
    expect(b).toEqual({ method: "partial_in_text", hours: [2.5, null], consistent: null });
  });
  it("figures that do not add up are reported as inconsistent, not corrected", () => {
    const a = allocateHours("Hoofdgracht 3 4 uur. Hoofdgracht 5 4 uur.", [H3, H5], 9);
    expect(a).toEqual({ method: "explicit_in_text", hours: [4, 4], consistent: false });
  });
  it("no figures in the text: the split stays UNKNOWN, the total is not divided", () => {
    const a = allocateHours("Hoofdgracht 3 werk. Hoofdgracht 5 werk.", [H3, H5], 9);
    expect(a).toEqual({ method: "unknown_split", hours: [null, null], consistent: null });
    expect(allocateHours(null, [H3, H5], 9).method).toBe("unknown_split");
  });
});
