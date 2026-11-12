import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  matchProfessionAcrossLocales,
  matchProfessionByLabel,
  professionRedirectHref,
} from "./public-vacancy-profession-match";

const LT = [
  { slug: "baker", label: "Kepėjas" },
  { slug: "cleaner", label: "Valytojas" },
  { slug: "cook", label: "Virėjas" },
  { slug: "kitchen_helper", label: "Virtuvės pagalbininkas" },
  { slug: "warehouse_worker", label: "Sandėlio darbuotojas" },
  { slug: "driver", label: "Vairuotojas" },
  { slug: "welder", label: "Suvirintojas" },
];

describe("a typed catalogue profession becomes its filter", () => {
  it("maps the exact label, any case, with or without diacritics", () => {
    expect(matchProfessionByLabel("valytojas", LT)).toBe("cleaner");
    expect(matchProfessionByLabel("Kepėjas", LT)).toBe("baker");
    expect(matchProfessionByLabel("kepejas", LT)).toBe("baker");
    expect(matchProfessionByLabel("  VIRĖJAS ", LT)).toBe("cook");
    expect(matchProfessionByLabel("sandelio darbuotojas", LT)).toBe("warehouse_worker");
  });

  it("maps a typed beginning and an inflected form when unambiguous", () => {
    expect(matchProfessionByLabel("valyt", LT)).toBe("cleaner");
    expect(matchProfessionByLabel("valytoja", LT)).toBe("cleaner");
    expect(matchProfessionByLabel("kepeju", LT)).toBe("baker");
  });

  it("never guesses: unknown, too short and ambiguous input stay plain text", () => {
    expect(matchProfessionByLabel("lagerarbetare", LT)).toBeNull();
    expect(matchProfessionByLabel("va", LT)).toBeNull();
    // "vair" and "valy" are unique, but "v" + 3 letters shared by several is not.
    expect(matchProfessionByLabel("virt", LT)).toBe("kitchen_helper");
    expect(
      matchProfessionByLabel("vir", [
        { slug: "a", label: "Virėjas" },
        { slug: "b", label: "Virtuvės pagalbininkas" },
      ]),
    ).toBeNull();
  });
});

describe("the same word in another active language", () => {
  const EN = [
    { slug: "cleaner", label: "Cleaner" },
    { slug: "welder", label: "Welder" },
  ];
  const RU = [
    { slug: "cleaner", label: "Уборщик" },
    { slug: "welder", label: "Сварщик" },
  ];

  it("resolves an English word on the Lithuanian board and vice versa", () => {
    expect(matchProfessionAcrossLocales("welder", LT, [EN, RU])).toBe("welder");
    expect(matchProfessionAcrossLocales("valytojas", EN, [LT, RU])).toBe("cleaner");
  });

  it("the reader's own catalogue wins", () => {
    expect(matchProfessionAcrossLocales("valytojas", LT, [EN])).toBe("cleaner");
  });

  it("never guesses when two catalogues disagree", () => {
    const X = [{ slug: "baker", label: "Welder" }];
    expect(matchProfessionAcrossLocales("welder", LT, [EN, X])).toBeNull();
    expect(matchProfessionAcrossLocales("lagerarbetare", LT, [EN, RU])).toBeNull();
  });
});

describe("the real catalogue: a word people type for a profession stays the filter", () => {
  const ACTIVE = ["en", "lt", "ru", "nl", "de", "pl"] as const;
  const catalogue = (l: string) =>
    Object.entries(
      JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", l, "professions.json"), "utf8")) as Record<string, string>,
    ).map(([slug, label]) => ({ slug, label }));

  it("elektriker goes to the electrician filter on every active board, not to free text", () => {
    for (const board of ACTIVE) {
      const others = ACTIVE.filter((l) => l !== board).map(catalogue);
      expect(matchProfessionAcrossLocales("elektriker", catalogue(board), others), board).toBe("electrician");
    }
  });

  it("schweisser is the same word as the catalogue's Schweißer, on every active board", () => {
    for (const board of ACTIVE) {
      const others = ACTIVE.filter((l) => l !== board).map(catalogue);
      for (const term of ["schweißer", "schweisser", "Schweisser", "SCHWEISSER"]) {
        expect(matchProfessionAcrossLocales(term, catalogue(board), others), `${board} ${term}`).toBe("welder");
      }
    }
  });

  it("ae, oe and ue typed for ä, ö and ü reach the catalogue's label", () => {
    const de = [{ slug: "kitchen_helper", label: "Küchenhilfe" }, { slug: "baker", label: "Bäcker" }, { slug: "tax", label: "Steuerberater" }];
    for (const [term, slug] of [["kuechenhilfe", "kitchen_helper"], ["küchenhilfe", "kitchen_helper"], ["kuchenhilfe", "kitchen_helper"], ["baecker", "baker"], ["backer", "baker"], ["steuerberater", "tax"]] as const) {
      expect(matchProfessionByLabel(term, de), term).toBe(slug);
    }
    expect(matchProfessionByLabel("zzqxue", de)).toBeNull();
  });

  it("a word no label names reaches its profession, on every active board", () => {
    const words: readonly (readonly [string, string])[] = [
      ["truck driver", "driver"],
      ["Sunkvezimio vairuotojas", "driver"],
      ["LKW-Fahrer", "driver"],
      ["дальнобойщик", "driver"],
      ["szef kuchni", "cook"],
      ["Küchenchef", "cook"],
      ["ontwikkelaar", "software_developer"],
      ["учитель", "teacher"],
      ["SANDELININKAS", "warehouse_worker"],
      ["magazynier", "warehouse_worker"],
    ];
    for (const board of ACTIVE) {
      const others = ACTIVE.filter((l) => l !== board).map(catalogue);
      for (const [term, slug] of words) {
        expect(matchProfessionAcrossLocales(term, catalogue(board), others), `${board} ${term}`).toBe(slug);
      }
      // Publisher words on the Swedish and Norwegian supply stay a text search.
      for (const term of ["chef", "programmer", "lagerist"]) {
        expect(matchProfessionAcrossLocales(term, catalogue(board), others), `${board} ${term}`).toBeNull();
      }
    }
  });

  it("words the catalogue does not name stay free text", () => {
    const others = ACTIVE.filter((l) => l !== "lt").map(catalogue);
    for (const term of ["kock", "el", "ab", "ter", "snickare", "undersköterska", "zzqx"]) {
      expect(matchProfessionAcrossLocales(term, catalogue("lt"), others), term).toBeNull();
    }
  });
});

describe("professionRedirectHref (SR-4)", () => {
  it("keeps a page past the first", () => {
    expect(professionRedirectHref("electrician", "2")).toBe("/jobs?profession=electrician&page=2");
  });

  it("adds nothing for the first page, no page or a page that is not a number", () => {
    for (const raw of [undefined, "1", "0", "-3", "abc", ""]) {
      expect(professionRedirectHref("electrician", raw)).toBe("/jobs?profession=electrician");
    }
  });
});
