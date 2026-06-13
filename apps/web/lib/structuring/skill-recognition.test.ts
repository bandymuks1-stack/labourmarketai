import { describe, expect, it } from "vitest";
import {
  recognizeSkills,
  RECOGNITION_LIMIT,
} from "./skill-recognition";
import { foldText, boundedEditDistance } from "./normalize";
import { extractJournalSuggestions } from "./extract-journal-suggestions";

// Helper: the set of recognised slugs for a phrase.
const slugs = (t: string) => recognizeSkills(t).map((s) => s.slug);
const top = (t: string) => recognizeSkills(t)[0];

describe("normalize.foldText", () => {
  it("folds Lithuanian diacritics to ASCII", () => {
    expect(foldText("Dažiau sieną, šlavau")).toBe("daziau siena, slavau");
  });
  it("leaves Cyrillic unchanged (lowercased)", () => {
    expect(foldText("Плитка")).toBe("плитка");
  });
});

describe("boundedEditDistance", () => {
  it("is 0 for equal, 1 for one edit, >max past the bound", () => {
    expect(boundedEditDistance("plytel", "plytel", 1)).toBe(0);
    expect(boundedEditDistance("plitel", "plytel", 1)).toBe(1);
    expect(boundedEditDistance("abcdef", "uvwxyz", 1)).toBeGreaterThan(1);
  });
});

describe("recognition — Lithuanian incl. missing diacritics / slang / short", () => {
  it("1 'montavau langus' → carpentry (window/door synonym)", () => {
    expect(slugs("montavau langus 6 val")).toContain("carpentry");
  });
  it("2 'dazem sienas' (no diacritics) → painting", () => {
    expect(slugs("dazem sienas")).toContain("painting");
  });
  it("3 'liejau betona, klojiniai, armatura' → concrete + formwork + rebar", () => {
    const s = slugs("liejau betona, klojiniai, armatura");
    expect(s).toContain("concrete-pouring");
    expect(s).toContain("formwork");
    expect(s).toContain("rebar-cutting");
  });
  it("4 'gipsas lubos' → drywall + ceiling-systems", () => {
    const s = slugs("gipsas lubos");
    expect(s).toContain("drywall");
    expect(s).toContain("ceiling-systems");
  });
  it("5 'plyteles vonioj' (short) → tiling", () => {
    expect(slugs("plyteles vonioj")).toContain("tiling");
  });
  it("6 'tinkavau' (one word) → plastering", () => {
    expect(slugs("tinkavau")).toContain("plastering");
  });
  it("7 'murijau siena' (no diacritics) → bricklaying", () => {
    expect(slugs("murijau siena")).toContain("bricklaying");
  });
  it("9 'suvirinau remus' → welding", () => {
    expect(slugs("suvirinau remus")).toContain("welding-blueprint");
  });
  it("10 'kasiau transeja' → earthworks", () => {
    expect(slugs("kasiau transeja")).toContain("earthworks");
  });
  it("12 'elektros instaliacija' → electrical-install", () => {
    expect(slugs("elektros instaliacija")).toContain("electrical-install");
  });
  it("13 'dažymas' → painting", () => {
    expect(slugs("dažymas")).toContain("painting");
  });
  it("14 'gipsa' (truncated) → drywall, weaker than exact", () => {
    const s = recognizeSkills("gipsa");
    expect(s.map((x) => x.slug)).toContain("drywall");
    expect(["medium", "low"]).toContain(
      s.find((x) => x.slug === "drywall")!.confidence,
    );
  });
});

describe("recognition — Russian", () => {
  it("15 клал плитку → tiling", () => {
    expect(slugs("клал плитку в ванной")).toContain("tiling");
  });
  it("16 штукатурил → plastering", () => {
    expect(slugs("штукатурил стены")).toContain("plastering");
  });
  it("17 заливал бетон → concrete", () => {
    expect(slugs("заливал бетон")).toContain("concrete-pouring");
  });
  it("18 вязал арматуру → rebar", () => {
    expect(slugs("вязал арматуру")).toContain("rebar-cutting");
  });
  it("19 ставил окна → carpentry", () => {
    expect(slugs("ставил окна")).toContain("carpentry");
  });
  it("20 монтаж гипсокартона → drywall", () => {
    expect(slugs("монтаж гипсокартона")).toContain("drywall");
  });
  it("21 копал траншею → earthworks", () => {
    expect(slugs("копал траншею")).toContain("earthworks");
  });
  it("22 красил стены → painting", () => {
    expect(slugs("красил стены, 3 часа")).toContain("painting");
  });
});

describe("recognition — English", () => {
  it("23 window install → carpentry", () => {
    expect(slugs("window install, 4h")).toContain("carpentry");
  });
  it("24 painted walls → painting", () => {
    expect(slugs("painted walls")).toContain("painting");
  });
  it("25 laid tiles → tiling", () => {
    expect(slugs("laid tiles in bathroom")).toContain("tiling");
  });
  it("26 rebar and formwork → rebar + formwork", () => {
    const s = slugs("rebar and formwork");
    expect(s).toContain("rebar-cutting");
    expect(s).toContain("formwork");
  });
});

describe("recognition — weak / unknown → manual-pick path", () => {
  it("27 'montavau' (verb only) → no skill (manual pick)", () => {
    expect(recognizeSkills("montavau")).toHaveLength(0);
  });
  it("28 vague entries invent nothing", () => {
    expect(recognizeSkills("darbas buvo geras")).toHaveLength(0);
    expect(recognizeSkills("сегодня устал")).toHaveLength(0);
  });
});

describe("recognition — fuzzy is gated and never false-positives klijav", () => {
  it("11 'klijavau tapetus' → wallpapering, NOT tiling", () => {
    const s = slugs("klijavau tapetus");
    expect(s).toContain("wallpapering");
    expect(s).not.toContain("tiling");
  });
  it("generic gluing alone never suggests tiling", () => {
    expect(slugs("klijavau")).not.toContain("tiling");
  });
  it("'kasininku' (cashier) does NOT fuzzy-match earthworks/digging", () => {
    expect(slugs("Dirbau 3 valandas kasininku parduotuvėje")).not.toContain(
      "earthworks",
    );
  });
  it("a 1-edit typo can fuzzy-match at LOW confidence only", () => {
    const s = recognizeSkills("pliteles"); // 'plytel' with i/y swap
    const tiling = s.find((x) => x.slug === "tiling");
    expect(tiling?.confidence).toBe("low");
  });
});

describe("recognition — confidence tiers + reason + cap", () => {
  it("exact base needle → high", () => {
    expect(top("plyteles")?.confidence).toBe("high");
  });
  it("curated synonym → medium", () => {
    expect(top("painted walls")?.confidence).toBe("medium");
  });
  it("every suggestion carries a non-empty reason (matchedText)", () => {
    for (const s of recognizeSkills("liejau betona, klojiniai, armatura")) {
      expect(s.matchedText.length).toBeGreaterThan(0);
    }
  });
  it("never exceeds the cap (max 3–5; we use 4)", () => {
    const busy =
      "plyteles, gipso, tinkavau, glaisciau, daziau, grindis, santechnika, " +
      "elektra, murijau, betonavau, suvirinau, siltinau";
    expect(recognizeSkills(busy).length).toBeLessThanOrEqual(RECOGNITION_LIMIT);
    expect(RECOGNITION_LIMIT).toBeLessThanOrEqual(5);
  });
  it("a narrow entry does NOT produce a broad unrelated cloud", () => {
    expect(recognizeSkills("tinkavau").length).toBeLessThanOrEqual(2);
  });
  it("suggestions are evidence-ordered (exact before fuzzy)", () => {
    // exact tiling must rank above a fuzzy-only slug in a mixed entry
    const s = recognizeSkills("plyteles pliteles");
    expect(s[0].via).toBe("exact");
  });
});

describe("recognition — never auto-verifies (suggestions only)", () => {
  it("RecognizedSkill has no verified/confirmed field", () => {
    const s = recognizeSkills("plyteles")[0] as unknown as Record<
      string,
      unknown
    >;
    expect("verified" in s).toBe(false);
    expect("confirmed" in s).toBe(false);
    expect("manager_confirmed" in s).toBe(false);
  });
});

describe("extractJournalSuggestions exposes rich skillSuggestions", () => {
  it("returns skillSuggestions with slug + confidence + reason", () => {
    const s = extractJournalSuggestions("4 valandas klijavau plyteles vonioje.");
    expect(s.skillSlugs).toContain("tiling");
    expect(s.skillSuggestions[0]).toHaveProperty("confidence");
    expect(s.skillSuggestions[0]).toHaveProperty("matchedText");
  });
  it("empty entry → empty skillSuggestions", () => {
    expect(extractJournalSuggestions("").skillSuggestions).toHaveLength(0);
  });
});
