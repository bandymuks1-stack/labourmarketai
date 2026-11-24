import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  classifySkillInput,
  coOccurrencePairs,
  normalizeSkillLabel,
  CANDIDATE_TRUST,
  type KnownSkill,
} from "@/lib/skills/candidate-skills";

/**
 * Adaptive skill discovery honesty guard (slice adaptive-skill-discovery-v1).
 * Unknown = candidate (never error); candidate is self-declared / needs
 * clarification (never verified); co-occurrence is a human-review signal only.
 */

const KNOWN: KnownSkill[] = [
  { slug: "tiling", nameLt: "Plytelių klojimas", nameEn: "Tiling" },
  { slug: "welding", nameLt: "Suvirinimas", nameEn: "Welding" },
];

describe("unknown skill is a candidate signal, not an error", () => {
  it("a catalogue match is classified as known", () => {
    expect(classifySkillInput("tiling", KNOWN)).toMatchObject({ kind: "known", slug: "tiling" });
    expect(classifySkillInput("  Plytelių   klojimas ", KNOWN)).toMatchObject({
      kind: "known",
      slug: "tiling",
    });
  });
  it("an unknown label becomes a candidate needing clarification (not rejected)", () => {
    const r = classifySkillInput("monolitinis betonavimas", KNOWN);
    expect(r).toMatchObject({ kind: "candidate", needsClarification: true });
    expect(r?.kind === "candidate" && r.label).toBe("monolitinis betonavimas");
  });
  it("only empty input returns null", () => {
    expect(classifySkillInput("   ", KNOWN)).toBeNull();
    expect(classifySkillInput("x", KNOWN)).not.toBeNull();
  });
});

describe("candidates are self-declared, never verified", () => {
  it("candidate trust posture is self_declared", () => {
    expect(CANDIDATE_TRUST).toBe("self_declared");
  });
  it("no classification ever yields a 'verified' status", () => {
    const r = classifySkillInput("anything-new", KNOWN);
    expect(JSON.stringify(r)).not.toMatch(/verified|confirmed|ai/i);
  });
});

describe("co-occurrence is a deterministic human-review signal", () => {
  it("counts how many workers declared each pair", () => {
    const pairs = coOccurrencePairs([
      ["tiling", "grouting"],
      ["tiling", "grouting", "waterproofing"],
      ["welding"],
    ]);
    const tg = pairs.find((p) => p.a === "grouting" && p.b === "tiling");
    expect(tg?.count).toBe(2);
    // a single-skill worker contributes no pair
    expect(pairs.some((p) => p.a === "welding" || p.b === "welding")).toBe(false);
  });
  it("is deterministic + normalized", () => {
    const a = coOccurrencePairs([["A", "b"], ["b ", " a"]]);
    expect(a).toEqual([{ a: "a", b: "b", count: 2 }]);
    expect(normalizeSkillLabel("  Foo  BAR ")).toBe("foo bar");
  });
});

describe("design doc states the honesty boundaries", () => {
  const doc = readFileSync(
    join(__dirname, "..", "..", "..", "..", "docs", "audits", "adaptive-skill-discovery-v1.md"),
    "utf8",
  );
  it("candidate not error; self-declared not verified; review signal only", () => {
    expect(doc).toMatch(/candidate signal, not an error/i);
    expect(doc).toMatch(/never "verified"|not\s+verified/i);
    expect(doc).toMatch(/review signal only|human review/i);
  });
});
