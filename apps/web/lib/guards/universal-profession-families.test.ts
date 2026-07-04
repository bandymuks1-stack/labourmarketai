import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SKILL_HINTS_LT,
  SKILL_HINT_SECTORS,
  CONSTRUCTION_SKILL_HINT_SLUGS,
  PROFESSION_HINTS_LT,
} from "@/lib/structuring/keywords";
import { isKnownSector } from "@/lib/structuring/sectors";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import { classifyEntrySkillSource } from "@/lib/journal/entry-skill-source";

/**
 * UNIVERSAL PROFESSION FAMILIES — the permanent anti-regression guard for the
 * 2026-07-04 owner mandate ("the system must treat all professions and work
 * activities as first-class, not construction as the default catalogue").
 *
 * Root cause it locks out: the original seed catalogue (0002/0008/0011) was
 * 100% construction and SKILL_HINTS_LT (the only lexicon that emits catalogue
 * skill slugs) contained only construction trades, so every other profession
 * was fenced into second-class label-only suggestions. This guard fails if:
 *   1. a non-construction journal text starts returning construction skills;
 *   2. construction text stops returning construction skills;
 *   3. the first-class lexicon shrinks back to construction-only;
 *   4. the required profession families lose their catalogue skills or their
 *      locale names (any of the 11 locales);
 *   5. an unrelated linked profile skill is presented as clean entry evidence.
 */

const APP_ROOT = join(__dirname, "..", "..");
const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];
const readJson = (rel: string): Record<string, string> =>
  JSON.parse(readFileSync(join(APP_ROOT, rel), "utf8")) as Record<string, string>;

const skillNamesLt = readJson("messages/lt/skill-names.json");
const professionsLt = readJson("messages/lt/professions.json");

function slugsOf(text: string): string[] {
  return recognizeSkills(text, 8).map((r) => r.slug);
}

// ── 1. The owner's example sentences resolve to the RIGHT sector ──────────
// Non-construction wording must yield first-class non-construction skills and
// NEVER a construction catalogue slug. Construction wording keeps working.
// (furniture assembly is carpentry-adjacent by owner decision — the ONLY
// construction-family slug allowed from an assembly sentence is
// furniture-fitting, never a wall trade.)
describe("owner sentences: no construction catalogue by default", () => {
  const NON_CONSTRUCTION: { text: string; expect: string }[] = [
    { text: "Tvarkiau ofisą 2 val.", expect: "cleaning-services" },
    { text: "Rinkome laikrodžius renginiui 5 val.", expect: "event-setup" },
    { text: "Programavau Labourmarket.ai 3 val.", expect: "programming" },
    { text: "Vairavau krovinį į Olandiją", expect: "driving" },
    { text: "Dirbau virtuvėje", expect: "cooking" },
    { text: "Prižiūrėjau sodą", expect: "gardening" },
    { text: "Kalbėjau su klientais", expect: "customer-service" },
    { text: "Pildžiau dokumentus", expect: "document-handling" },
    { text: "Valiau patalpas", expect: "cleaning-services" },
  ];
  for (const c of NON_CONSTRUCTION) {
    it(`"${c.text}" → ${c.expect}, zero construction slugs`, () => {
      const s = extractJournalSuggestions(c.text);
      expect(s.skillSlugs, c.text).toContain(c.expect);
      for (const slug of s.skillSlugs) {
        expect(
          CONSTRUCTION_SKILL_HINT_SLUGS.has(slug),
          `construction slug '${slug}' leaked from "${c.text}"`,
        ).toBe(false);
      }
    });
  }

  it('"Montavau baldus" → furniture-fitting (assembly/carpentry), no wall trade', () => {
    const s = extractJournalSuggestions("Montavau baldus");
    expect(s.skillSlugs).toContain("furniture-fitting");
    for (const slug of s.skillSlugs) {
      if (slug === "furniture-fitting") continue;
      expect(CONSTRUCTION_SKILL_HINT_SLUGS.has(slug), slug).toBe(false);
    }
    // Owner-correction pass: furniture assembly is a first-class profession.
    expect(s.fragments.some((f) => f.activitySlug === "furniture_assembler")).toBe(true);
  });

  it('"Mūrijau sieną" still returns the masonry construction skill', () => {
    expect(extractJournalSuggestions("Mūrijau sieną").skillSlugs).toContain("bricklaying");
  });

  it("construction wording keeps its trades (no over-correction)", () => {
    expect(slugsOf("Klojau plyteles vonioje")).toContain("tiling");
    expect(slugsOf("Tinkavau sienas")).toContain("plastering");
  });
});

// ── 2. The first-class lexicon spans the required profession families ─────
describe("first-class recognition covers the universal profession families", () => {
  const REQUIRED_SECTORS = [
    "construction",
    "manufacturing",
    "transport_logistics",
    "cleaning_facility",
    "office_admin",
    "it_software",
    "retail_sales",
    "hospitality_food",
    "agriculture",
    "care_health",
    "education",
  ] as const;

  it("SKILL_HINTS_LT has first-class rows for every required sector", () => {
    const covered = new Set(SKILL_HINTS_LT.map((r) => r.sector));
    for (const s of REQUIRED_SECTORS) {
      expect(covered.has(s), `no first-class skill rows for sector "${s}"`).toBe(true);
    }
  });

  it("construction is a minority of the recognisable catalogue, not the whole", () => {
    const all = new Set(SKILL_HINTS_LT.map((r) => r.slug));
    const nonConstruction = [...all].filter((s) => !CONSTRUCTION_SKILL_HINT_SLUGS.has(s));
    expect(nonConstruction.length).toBeGreaterThanOrEqual(30);
  });

  it("every sector tag is a known sector and sector tags are consistent per slug", () => {
    // SKILL_HINT_SECTORS construction throws on conflict at import time; here
    // we pin that every tag is a real SectorKey.
    for (const [slug, sector] of SKILL_HINT_SECTORS) {
      expect(isKnownSector(sector), `${slug} → unknown sector ${sector}`).toBe(true);
    }
  });

  it("the required universal skills exist in the catalogue registry", () => {
    for (const slug of [
      "driving", "warehouse-operations", "assembly-work", "production-line",
      "cleaning-services", "administration", "document-handling", "programming",
      "customer-service", "cooking", "gardening", "farm-work", "elderly-care",
      "childcare", "event-setup", "translation", "teaching", "equipment-operation",
      "first-aid",
    ]) {
      expect(skillNamesLt[slug], `skill-names.json missing '${slug}'`).toBeTruthy();
    }
  });

  it("professions.json is not construction-only", () => {
    for (const slug of [
      "driver", "cleaner", "cook", "office_administrator", "software_developer",
      "customer_service_specialist", "warehouse_worker", "production_worker",
      "gardener", "caregiver", "teacher", "translator", "event_organizer",
    ]) {
      expect(professionsLt[slug], `professions.json missing '${slug}'`).toBeTruthy();
    }
  });

  it("owner mandatory skill list (2026-07-04 correction) is installed in the registry", () => {
    for (const slug of [
      "cleaning-services", "programming", "driving", "cooking", "gardening",
      "customer-service", "document-handling", "event-setup",
      "furniture-fitting", "bricklaying",
    ]) {
      expect(skillNamesLt[slug], `mandatory skill '${slug}' missing`).toBeTruthy();
    }
  });

  it("owner mandatory profession list (2026-07-04 correction) is installed in the registry", () => {
    for (const slug of [
      "cleaner", "software_developer", "driver", "cook", "gardener",
      "event_organizer", "customer_service_specialist", "office_administrator",
      "furniture_assembler", "builder", "rebar_worker", "site_manager",
    ]) {
      expect(professionsLt[slug], `mandatory profession '${slug}' missing`).toBeTruthy();
    }
    // "bricklayer" is deliberately the CANONICAL mason slug (LT Mūrininkas is
    // the bricklayer trade; a second slug would duplicate it — doctrine §2).
    // The EN alias is recognised by the profession lexicon instead.
    expect(professionsLt["mason"], "canonical bricklayer trade (mason) missing").toBeTruthy();
    const mason = PROFESSION_HINTS_LT.find((r) => r.slug === "mason");
    expect(mason?.needles.some((n) => n.includes("bricklay"))).toBe(true);
  });
});

// ── 3. Locale parity: every locale ships the same taxonomy keys ───────────
describe("all 11 locales carry the universal taxonomy (doctrine §2)", () => {
  const ltSkillKeys = Object.keys(skillNamesLt).sort();
  const ltProfKeys = Object.keys(professionsLt).sort();
  for (const loc of LOCALES) {
    it(`${loc}: skill-names.json and professions.json key parity with lt`, () => {
      expect(Object.keys(readJson(`messages/${loc}/skill-names.json`)).sort()).toEqual(ltSkillKeys);
      expect(Object.keys(readJson(`messages/${loc}/professions.json`)).sort()).toEqual(ltProfKeys);
    });
  }
});

// ── 4. The seed migration mirrors the registry (no drift) ─────────────────
describe("catalogue migration 20260704120000 mirrors the locale registry", () => {
  const migration = readFileSync(
    join(APP_ROOT, "..", "..", "supabase", "migrations", "20260704120000_universal_profession_skill_catalogue.sql"),
    "utf8",
  );
  it("every seeded skill slug has a locale name", () => {
    const inserted = [...migration.matchAll(/^\s*\('([a-z-]+)',\s*'[a-z_.]+\./gm)].map((m) => m[1]);
    expect(inserted.length).toBeGreaterThanOrEqual(30);
    for (const slug of inserted) {
      expect(skillNamesLt[slug], `migration seeds '${slug}' but skill-names.json lacks it`).toBeTruthy();
    }
  });
  it("every seeded profession slug has a locale name", () => {
    // Post-0012 shape: insert into public.professions (slug, sector) — names
    // live only in the locale JSON (the truth audit's apply-bug fix).
    const block = migration.match(/insert into public\.professions[\s\S]*?;/i)?.[0] ?? "";
    const inserted = [...block.matchAll(/\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inserted.length).toBeGreaterThanOrEqual(15);
    for (const slug of inserted) {
      expect(professionsLt[slug], `migration seeds '${slug}' but professions.json lacks it`).toBeTruthy();
    }
  });
  it("is strictly additive (INSERT … ON CONFLICT DO NOTHING only)", () => {
    expect(migration).not.toMatch(/\b(update|delete|drop|alter|grant|revoke|truncate)\b\s/i);
    expect(migration).toMatch(/on conflict \(slug\) do nothing/);
  });
});

// ── 5. Unrelated linked profile skills are never clean entry evidence ─────
describe("manual profile skills are not injected into unrelated entries", () => {
  it("a linked construction skill unsupported by the entry text needs review", () => {
    // e.g. old bricklaying link on an office-cleaning entry: the recogniser
    // knows bricklaying, the text doesn't support it → review bucket, never a
    // clean chip.
    expect(
      classifyEntrySkillSource({
        linked: true,
        verified: false,
        recognizedFromText: false,
        recognizable: true,
      }),
    ).toBe("stale_needs_review");
  });
  it("an unlinked profile skill is only OFFERED behind the link disclosure", () => {
    expect(
      classifyEntrySkillSource({
        linked: false,
        verified: false,
        recognizedFromText: false,
        recognizable: true,
      }),
    ).toBe("profile_skill_available_to_link");
  });
});
