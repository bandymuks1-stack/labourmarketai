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
});

describe("normalizeClaimLabel", () => {
  it("trims, lowercases, collapses whitespace", () => {
    expect(normalizeClaimLabel("  Programavimas  ")).toBe("programavimas");
    expect(normalizeClaimLabel("Namų   statyba")).toBe("namų statyba");
    expect(normalizeClaimLabel("ELEKTROS\tDARBAI")).toBe("elektros darbai");
  });
});
