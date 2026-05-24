import { describe, expect, it } from "vitest";
import {
  extractProfileSkillClaims,
  normalizeClaimLabel,
} from "./skill-claim-extractor";

describe("extractProfileSkillClaims", () => {
  it("returns empty for empty / null / non-string input", () => {
    expect(extractProfileSkillClaims("")).toEqual([]);
    expect(extractProfileSkillClaims("   ")).toEqual([]);
    expect(extractProfileSkillClaims(null)).toEqual([]);
    expect(extractProfileSkillClaims(undefined)).toEqual([]);
  });

  // Anchor example from the slice goal — both Lithuanian skills must surface.
  it("extracts 'Programavimas' and 'Namų statyba' from the goal example", () => {
    const result = extractProfileSkillClaims(
      "Moku gerai programuoti ir statyti namus",
    );
    const labels = result.map((r) => r.label);
    expect(labels).toContain("Programavimas");
    expect(labels).toContain("Namų statyba");
  });

  it("maps 'programuoti' (LT verb) → 'Programavimas'", () => {
    const result = extractProfileSkillClaims("Aš moku programuoti C# kalba.");
    expect(result.map((r) => r.label)).toContain("Programavimas");
  });

  it("maps 'statyti namus' → 'Namų statyba'", () => {
    const result = extractProfileSkillClaims(
      "Per 10 metų pastatėme daug namų — moku statyti namus nuo nulio.",
    );
    expect(result.map((r) => r.label)).toContain("Namų statyba");
  });

  it("maps English 'coding' → 'Programavimas'", () => {
    const result = extractProfileSkillClaims("I've been coding for ten years.");
    expect(result.map((r) => r.label)).toContain("Programavimas");
  });

  it("maps English 'plumbing' → 'Santechnika'", () => {
    const result = extractProfileSkillClaims(
      "Mostly residential plumbing work.",
    );
    expect(result.map((r) => r.label)).toContain("Santechnika");
  });

  // Anchor: the owner's PR #46 follow-up production sentence. The first
  // three skills were already mapped by PR #46; the cooking phrase
  // ("gaminti lietuviškos virtuvės patiekalus") was the dictionary gap
  // the hotfix fills.
  it("extracts all four canonical claims from the extended owner sentence", () => {
    const result = extractProfileSkillClaims(
      "Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti lietuviškos virtuvės patiekalus",
    );
    const labels = result.map((r) => r.label);
    expect(labels).toContain("Programavimas");
    expect(labels).toContain("Namų statyba");
    expect(labels).toContain("Stogų dengimas");
    expect(labels).toContain("Maisto gamyba");
  });

  it("maps 'dengti stogus' → 'Stogų dengimas' (new label)", () => {
    const result = extractProfileSkillClaims(
      "Per 5 metus dengėme stogus visoje Lietuvoje.",
    );
    expect(result.map((r) => r.label)).toContain("Stogų dengimas");
    // Old label gone — preventing accidental dual-label drift if a future
    // PR re-introduces "Stogo darbai" alongside.
    expect(result.map((r) => r.label)).not.toContain("Stogo darbai");
  });

  it("maps 'gaminti lietuviškos virtuvės patiekalus' → 'Maisto gamyba'", () => {
    const result = extractProfileSkillClaims(
      "Mėgstu gaminti lietuviškos virtuvės patiekalus.",
    );
    expect(result.map((r) => r.label)).toContain("Maisto gamyba");
  });

  it("maps English 'cooking' / 'chef' → 'Maisto gamyba'", () => {
    expect(
      extractProfileSkillClaims("Have a passion for cooking traditional dishes.").map(
        (r) => r.label,
      ),
    ).toContain("Maisto gamyba");
    expect(
      extractProfileSkillClaims("Worked as a chef in two restaurants.").map(
        (r) => r.label,
      ),
    ).toContain("Maisto gamyba");
  });

  it("does not duplicate when multiple needles for the same label hit", () => {
    const result = extractProfileSkillClaims(
      "Programuoju, programavimas yra mano stiprybė, frontend ir backend.",
    );
    const programmingCount = result.filter(
      (r) => r.label === "Programavimas",
    ).length;
    expect(programmingCount).toBe(1);
  });

  it("returns labels in stable dictionary order across runs", () => {
    const a = extractProfileSkillClaims(
      "Dažau, muriju ir programuoju.",
    ).map((r) => r.label);
    const b = extractProfileSkillClaims(
      "Programuoju, muriju, dažau.",
    ).map((r) => r.label);
    // Same set of labels regardless of input order — dictionary ordering wins.
    expect(new Set(a)).toEqual(new Set(b));
    expect(a).toEqual(b);
  });

  it("each suggestion carries a lowercased normalizedLabel", () => {
    const result = extractProfileSkillClaims("Dirbu statybose");
    for (const r of result) {
      expect(r.normalizedLabel).toBe(r.label.toLowerCase());
    }
  });

  it("returns empty for unrelated narrative (no false positives)", () => {
    const result = extractProfileSkillClaims(
      "Mėgstu skaityti knygas ir keliauti.",
    );
    expect(result).toEqual([]);
  });

  it("hard caps input length and still extracts cleanly", () => {
    const long = "x ".repeat(3000) + " programuoti";
    const result = extractProfileSkillClaims(long);
    // The "programuoti" sits past the MAX_INPUT_CHARS cap, so the extractor
    // should NOT find it — proves the cap is enforced.
    expect(result.map((r) => r.label)).not.toContain("Programavimas");
  });

  // ── Idea-based extraction anchors (feat/cc/profile-save-state-and-idea-extraction) ──
  // Goal upgrade: the dictionary now covers PHRASES + TOOLS + RESPONSIBILITIES,
  // not just exact-string skill needles. Each describe-block below is one
  // principle from the goal doc (activity / tool / responsibility / domain).

  describe("Activity phrase → Medienos apdirbimas", () => {
    it("drožti iš medžio (activity verb + material)", () => {
      const labels = extractProfileSkillClaims(
        "Mokam drožti iš medžio nuo vaikystės.",
      ).map((r) => r.label);
      expect(labels).toContain("Medienos apdirbimas");
    });
    it("medžio darbai (material + work)", () => {
      const labels = extractProfileSkillClaims(
        "Dirbu medžio darbus daugiau nei 10 metų.",
      ).map((r) => r.label);
      expect(labels).toContain("Medienos apdirbimas");
    });
    it("EN carpentry / woodwork", () => {
      expect(
        extractProfileSkillClaims("Hobby: carpentry on weekends.").map(
          (r) => r.label,
        ),
      ).toContain("Medienos apdirbimas");
      expect(
        extractProfileSkillClaims("20 years of woodwork experience.").map(
          (r) => r.label,
        ),
      ).toContain("Medienos apdirbimas");
    });
  });

  describe("Tool mention → Dokumentų tvarkymas", () => {
    it("dokumentai", () => {
      expect(
        extractProfileSkillClaims("Tvarkau dokumentus biure.").map(
          (r) => r.label,
        ),
      ).toContain("Dokumentų tvarkymas");
    });
    it("Word / Excel / PDF", () => {
      const labels = extractProfileSkillClaims(
        "Dirbu su Word, Excel ir PDF failais kasdien.",
      ).map((r) => r.label);
      expect(labels).toContain("Dokumentų tvarkymas");
    });
  });

  describe("Business-tool mention → Apskaitos sistemos", () => {
    it("Rivilė ERP", () => {
      expect(
        extractProfileSkillClaims("Pildau dokumentus Rivilė aplinkoje.").map(
          (r) => r.label,
        ),
      ).toContain("Apskaitos sistemos");
    });
    it("generic apskaita stem", () => {
      expect(
        extractProfileSkillClaims("Dirbu su apskaitos programa.").map(
          (r) => r.label,
        ),
      ).toContain("Apskaitos sistemos");
    });
  });

  describe("Responsibility phrase → Komandos koordinavimas / Darbuotojų paieška", () => {
    it("koordinuoti komandą → Komandos koordinavimas", () => {
      const labels = extractProfileSkillClaims(
        "Galiu koordinuoti komandą nuo 5 iki 20 žmonių.",
      ).map((r) => r.label);
      expect(labels).toContain("Komandos koordinavimas");
    });
    it("ieškoti darbuotojų → Darbuotojų paieška", () => {
      const labels = extractProfileSkillClaims(
        "Per kelias savaites surandu ir atrenku naujus darbuotojus.",
      ).map((r) => r.label);
      expect(labels).toContain("Darbuotojų paieška");
    });
    it("EN recruit / hiring → Darbuotojų paieška", () => {
      expect(
        extractProfileSkillClaims("Have led recruit campaigns.").map(
          (r) => r.label,
        ),
      ).toContain("Darbuotojų paieška");
      expect(
        extractProfileSkillClaims("Hiring engineers for a startup.").map(
          (r) => r.label,
        ),
      ).toContain("Darbuotojų paieška");
    });
  });

  describe("Full owner sentence — at least 8 capabilities from one paragraph", () => {
    // Anchor: the owner's PR #48 follow-up production smoke text. The
    // dictionary upgrade must produce at least the listed broad set so
    // the test fails if a future PR narrows or breaks the phrase-stem
    // matching that this slice introduced.
    it("extends the four-chip baseline to ~10 broader capabilities", () => {
      const text =
        "Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti " +
        "lietuviškos virtuvės patiekalus. taip pat moku drožti iš medžio, " +
        "bei dirbti su word, excel ir pdf dokumentais rivilė aplinkoje ir " +
        "galiu koordinuoti komanda bei ieškoti naujų žmonių ir darbuotojų";
      const labels = extractProfileSkillClaims(text).map((r) => r.label);

      // Baseline chips from prior PRs — must continue to appear.
      expect(labels).toContain("Programavimas");
      expect(labels).toContain("Namų statyba");
      expect(labels).toContain("Stogų dengimas");
      expect(labels).toContain("Maisto gamyba");

      // New idea-based chips — the actual upgrade this slice ships.
      expect(labels).toContain("Medienos apdirbimas");
      expect(labels).toContain("Dokumentų tvarkymas");
      expect(labels).toContain("Apskaitos sistemos");
      expect(labels).toContain("Komandos koordinavimas");
      expect(labels).toContain("Darbuotojų paieška");

      // Catches a regression that narrows the new dictionary by
      // accident — the prior 4-chip baseline should be at least
      // doubled.
      expect(labels.length).toBeGreaterThanOrEqual(8);
    });
  });
});

describe("normalizeClaimLabel", () => {
  it("trims, lowercases, collapses whitespace", () => {
    expect(normalizeClaimLabel("  Programavimas  ")).toBe("programavimas");
    expect(normalizeClaimLabel("Namų   statyba")).toBe("namų statyba");
    expect(normalizeClaimLabel("ELEKTROS\tDARBAI")).toBe("elektros darbai");
  });
});
