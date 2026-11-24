import { describe, expect, it } from "vitest";

import { addressKeyOf, objectCodesOf, proposeConsolidation, type ConsolidationInputProject } from "./historical-consolidation";

// Name SHAPES from the 2026-10-13 production table (object cells of an import);
// ids are synthetic.
let n = 0;
const row = (name: string, records = 1, firstDate = "2023-10-10", lastDate = firstDate): ConsolidationInputProject => ({
  id: `p${String(++n).padStart(3, "0")}`,
  title: name,
  createdAt: `2026-10-04T00:00:${String(n % 60).padStart(2, "0")}Z`,
  objectNames: [name],
  records,
  firstDate,
  lastDate,
});

describe("what a cell names", () => {
  it("object codes, including the w22:073 spelling", () => {
    expect(objectCodesOf("Cerero beton, W22.073")).toEqual(["W22.073"]);
    expect(objectCodesOf("w22:073 afdichten")).toEqual(["W22.073"]);
    expect(objectCodesOf("W22.073 (adresas nerastas žodyne), W22.057 (adresas nerastas žodyne)")).toEqual(["W22.073", "W22.057"]);
  });

  it("the address is the LAST street + number; spacing, case and city are not identity", () => {
    expect(addressKeyOf("montage deurkozijn, blokken 1 rij, Travers 19")).toBe("travers 19");
    expect(addressKeyOf("plamuur, Travers 19")).toBe("travers 19");
    expect(addressKeyOf("borneolaan48")).toBe("borneolaan 48");
    expect(addressKeyOf("Borneolaan 48 Hilversum")).toBe("borneolaan 48");
    expect(addressKeyOf("Melkpad 49 (5)")).toBe("melkpad 49");
    expect(addressKeyOf("Hoofdgracht 43/45")).toBe("hoofdgracht 43/45");
    expect(addressKeyOf("Kantoor")).toBeNull();
  });
});

describe("the proposal", () => {
  const code = [
    row("W22.073 (adresas nerastas žodyne)", 593, "2023-01-13", "2023-09-23"),
    row("Cerero beton, W22.073", 5, "2023-11-03", "2023-12-01"),
    row("w22:073 afdichten", 1, "2023-03-28"),
    row("Hoofdgracht 45, W22.073 (adresas nerastas žodyne)", 1, "2023-03-30"),
  ];
  const travers = [
    row("Travers 19", 29, "2023-03-27", "2024-11-23"),
    row("plamuur, Travers 19", 2, "2023-10-11", "2023-10-12"),
    row("montage deurkozijn, blokken 1 rij, Travers 19", 1, "2023-10-17"),
  ];
  const borneo = [row("Borneolaan 48 Hilversum", 103, "2025-05-19", "2025-10-11"), row("borneolaan48", 6, "2025-05-21", "2025-08-20")];
  const wijk = [row("Wijkplaats 4", 120, "2024-03-25", "2025-07-26"), row("wijkplaats 4,Naarden", 1, "2023-03-30")];
  const hg = [row("Hoofdgracht 43", 45, "2024-07-16", "2025-07-21"), row("Hoofdgracht 43/45", 7, "2024-08-27", "2024-08-28")];
  const untouched = [
    row("W22.073 (adresas nerastas žodyne), W22.057 (adresas nerastas žodyne)", 33),
    row("Havenweg 81", 2),
    row("Nieuwe Havenweg 81", 1),
    row("Vivaldipark 54", 2),
    row("Vivaldipaark 56", 3),
    row("Kantoor", 48),
    row("Hotel", 40),
  ];
  const groups = proposeConsolidation([...code, ...travers, ...borneo, ...wijk, ...hg, ...untouched]);
  const g = (k: string) => groups.find((x) => x.key.startsWith(k));

  it("one object code → one project; the bare-code row is kept as canonical", () => {
    expect(g("code:W22.073")).toMatchObject({ level: "A", canonicalId: code[0]!.id });
    expect(g("code:W22.073")!.fragmentIds).toEqual([code[1]!.id, code[2]!.id, code[3]!.id].sort());
  });

  it("same street + number → one project, including a row whose work text has another number in it", () => {
    expect(g("addr:travers 19")).toMatchObject({ level: "A", canonicalId: travers[0]!.id });
    expect(g("addr:travers 19")!.fragmentIds).toHaveLength(2);
    expect(g("addr:borneolaan 48")).toMatchObject({ level: "A", canonicalId: borneo[0]!.id, fragmentIds: [borneo[1]!.id] });
  });

  it("work periods far apart, or two house numbers → B, never merged on its own", () => {
    expect(g("addr:wijkplaats 4")).toMatchObject({ level: "B", caution: "periods-apart" });
    expect(g("addr:hoofdgracht 43")).toMatchObject({ level: "B", caution: "two-numbers" });
  });

  it("two codes, similar-but-different addresses and places without a number are never proposed", () => {
    const touched = new Set(groups.flatMap((x) => [x.canonicalId, ...x.fragmentIds]));
    for (const u of untouched) expect(touched.has(u.id), u.title!).toBe(false);
  });
});
