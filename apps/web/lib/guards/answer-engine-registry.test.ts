/**
 * Multilingual Answer Engine — Wave 0 registry guard (behavior-neutral).
 *
 * Locks the 25 required invariants of the canonical question registry, its
 * contract, and the Wave-0 architecture/policies. It changes no product
 * behaviour — it validates committed data + docs. Nothing here publishes,
 * indexes, or touches routes/sitemap/robots.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ANSWER_QUESTIONS,
  validateRegistry,
  localizedPageFloor,
} from "@/lib/answer-engine/registry";
import {
  ANSWER_ENGINE_LOCALES,
  CANONICAL_QUESTION_MINIMUM,
} from "@/lib/answer-engine/contract";

const webRoot = resolve(__dirname, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");
const readRepo = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf-8");
const jsonKeys = (rel: string) => Object.keys(JSON.parse(read(rel)) as Record<string, unknown>);

const V = validateRegistry();

const CAPABILITY_ALLOWLIST = new Set([
  "opportunity-board", "matching", "adjacent-directions", "work-journal", "skills",
  "profile", "cv", "intelligence", "professions", "country-readiness", "scouting",
  "company", "teams", "privacy", "none",
]);
const REVIEW_OWNER_ALLOWLIST = new Set(["unassigned", "editorial", "editorial-legal"]);
const CONSTRUCTION_PROFS = new Set([
  "electrician", "welder", "carpenter", "mason", "plumber", "roofer", "tiler",
  "plasterer", "painter", "concrete_worker", "rebar_worker", "drywaller",
  "general_laborer", "builder", "foreman",
]);

describe("answer-engine registry — Wave 0 invariants", () => {
  it("1. holds >= 500 canonical questions", () => {
    expect(ANSWER_QUESTIONS.length).toBeGreaterThanOrEqual(CANONICAL_QUESTION_MINIMUM);
    expect(V.categoryShortfalls).toEqual([]);
    expect(localizedPageFloor()).toBe(ANSWER_QUESTIONS.length * ANSWER_ENGINE_LOCALES.length);
  });

  it("2. all canonicalQuestionIds are unique", () => expect(V.duplicateIds).toEqual([]));
  it("3. all canonicalSlugs are unique and kebab-case", () => {
    expect(V.duplicateSlugs).toEqual([]);
    expect(V.slugNotKebab).toEqual([]);
  });
  it("4. no near-identical questions without a shared duplicate cluster", () =>
    expect(V.nearDuplicatesWithoutCluster).toEqual([]));
  it("5. every question has a category", () => expect(V.missingCategory).toEqual([]));
  it("6. every question has at least one audience", () => expect(V.missingAudience).toEqual([]));
  it("7. every question has a search intent", () => expect(V.missingIntent).toEqual([]));
  it("8. every question has a freshness class", () => expect(V.missingFreshness).toEqual([]));
  it("9. every HIGH-risk question has an evidence requirement + a source", () => {
    expect(V.highRiskWithoutEvidence).toEqual([]);
    expect(V.highRiskWithoutSource).toEqual([]);
  });

  it("10. no single-sector priority (cross-sector professions; construction a minority)", () => {
    const profs = new Set<string>();
    for (const q of ANSWER_QUESTIONS) for (const p of q.applicableProfessions) profs.add(p);
    expect(profs.size).toBeGreaterThanOrEqual(5);
    const construction = [...profs].filter((p) => CONSTRUCTION_PROFS.has(p)).length;
    expect(construction * 2).toBeLessThan(profs.size); // construction < half
    // At least 3 clearly non-manual/knowledge professions are represented.
    for (const p of ["software_developer", "teacher", "caregiver"]) {
      expect(profs.has(p)).toBe(true);
    }
  });

  it("11. no single-country priority (all 9 markets, balanced, agnostic majority)", () => {
    const MARKETS = ["lt", "lv", "ee", "nl", "de", "dk", "no", "se", "pl"];
    const counts = new Map<string, number>();
    let bound = 0;
    for (const q of ANSWER_QUESTIONS) {
      if (q.applicableCountries.length > 0) bound += 1;
      for (const c of q.applicableCountries) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const m of MARKETS) expect(counts.get(m) ?? 0, `market ${m}`).toBeGreaterThan(0);
    const vals = [...counts.values()];
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1); // balanced
    expect(ANSWER_QUESTIONS.length - bound).toBeGreaterThan(bound); // agnostic majority
    // No country outside the 9 launch markets.
    for (const c of counts.keys()) expect(MARKETS).toContain(c);
  });

  it("12. every relatedProductCapability is a real, existing capability", () => {
    for (const q of ANSWER_QUESTIONS) {
      expect(CAPABILITY_ALLOWLIST.has(q.relatedProductCapability), q.relatedProductCapability).toBe(true);
    }
  });

  it("13. no fake authors (reviewOwner is a role label, never a person)", () => {
    for (const q of ANSWER_QUESTIONS) {
      expect(REVIEW_OWNER_ALLOWLIST.has(q.reviewOwner), q.reviewOwner).toBe(true);
    }
  });

  it("14. no fake ratings/reviews", () => {
    const blob = JSON.stringify(ANSWER_QUESTIONS);
    expect(blob).not.toMatch(/"?(aggregateRating|reviewCount|ratingValue)"?\s*:/i);
    for (const q of ANSWER_QUESTIONS) {
      expect(q.canonicalQuestion).not.toMatch(/\b\d(\.\d)?\s*(stars?|\/\s*5)\b/i);
    }
  });

  it("15. structured-data policy bans QAPage for a single editorial answer", () => {
    const adr = readRepo("docs/DECISIONS/0009-multilingual-answer-engine.md");
    expect(adr).toContain("single editorial answer");
    expect(adr).toMatch(/single editorial answer must\s+NOT use/i);
    // Only the allowed JSON-LD types are named as permitted.
    expect(adr).toContain("FAQPage");
    expect(adr).toContain("QAPage");
  });

  it("16. no question is indexable while any active locale is not published", () =>
    expect(V.indexableButNotReady).toEqual([]));

  it("17. status maps cover EXACTLY the active locales (no disabled locale leaks)", () => {
    expect([...ANSWER_ENGINE_LOCALES].sort()).toEqual(["de", "en", "lt", "nl", "ru"]);
    for (const q of ANSWER_QUESTIONS) {
      expect(Object.keys(q.translationStatusByLocale).sort()).toEqual(["de", "en", "lt", "nl", "ru"]);
      expect(Object.keys(q.indexingStatusByLocale).sort()).toEqual(["de", "en", "lt", "nl", "ru"]);
    }
  });

  it("18. no locale-key leakage in question text", () => {
    expect(V.localeKeyLeakInText).toEqual([]);
    expect(V.localeStatusIncomplete).toEqual([]);
  });

  it("19. robots does NOT block a future /questions surface", () => {
    const robots = read("app/robots.ts");
    expect(robots).not.toMatch(/disallow[^]*questions/i);
    expect(robots).toContain('allow: "/"');
  });

  it("20. architecture keeps the main answer public and login-free", () => {
    const adr = readRepo("docs/DECISIONS/0009-multilingual-answer-engine.md");
    expect(adr).toContain("publicly accessible without login");
  });

  it("21. architecture keeps main content server-rendered", () => {
    const adr = readRepo("docs/DECISIONS/0009-multilingual-answer-engine.md");
    expect(adr.toLowerCase()).toContain("server-rendered");
  });

  it("22. references the SINGLE canonical taxonomy (no second professions/skills system)", () => {
    const professionSlugs = new Set(jsonKeys("messages/en/professions.json"));
    const skillSlugs = new Set(jsonKeys("messages/en/skill-names.json"));
    for (const q of ANSWER_QUESTIONS) {
      for (const p of q.applicableProfessions) expect(professionSlugs.has(p), `profession ${p}`).toBe(true);
      for (const s of q.applicableSkills) expect(skillSlugs.has(s), `skill ${s}`).toBe(true);
    }
    // The registry module must not declare a second taxonomy map.
    const contract = read("lib/answer-engine/contract.ts");
    const registry = read("lib/answer-engine/registry.ts");
    expect(contract + registry).not.toMatch(/\bPROFESSION_SKILLS\b\s*[:=]/);
  });

  it("23. no IndexNow secret can reach the client (readiness is server-only)", () => {
    const audit = readRepo("docs/audit/multilingual-answer-engine-reality-audit-v1.md");
    expect(audit.toLowerCase()).toContain("server-only");
    // No IndexNow key literal in the client-importable answer-engine modules/data.
    for (const rel of [
      "lib/answer-engine/contract.ts",
      "lib/answer-engine/registry.ts",
      "content/answer-engine/question-registry.json",
    ]) {
      expect(read(rel).toLowerCase()).not.toMatch(/indexnow[^a-z]*key\s*[:=]/i);
    }
  });

  it("24. every question can carry related-question links", () => {
    for (const q of ANSWER_QUESTIONS) expect(Array.isArray(q.relatedQuestionIds)).toBe(true);
  });

  it("25. every question has a per-locale indexing status (all NOT_READY in Wave 0)", () => {
    for (const q of ANSWER_QUESTIONS) {
      for (const l of ANSWER_ENGINE_LOCALES) {
        expect(q.indexingStatusByLocale[l], `${q.canonicalQuestionId}/${l}`).toBe("NOT_READY");
        expect(q.translationStatusByLocale[l]).toBe("TRANSLATION_PENDING");
      }
    }
  });
});
