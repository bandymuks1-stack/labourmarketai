import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { deriveNeedSkills, detectNeedProfession } from "@/lib/market/need-skills";
import {
  matchWorkerToNeed,
  sourceToEvidence,
  type MatchNeed,
  type MatchSubject,
} from "@/lib/market/match-v1";
import { computeContextFit } from "@/lib/market/fit";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import {
  PROFESSION_SKILLS,
  skillsForProfession,
  professionRelatedness,
} from "@/lib/taxonomy/profession-skills";

/**
 * MATCHING CANONICAL GUARDS (PR4, Task 7) — the permanent rules that keep
 * matching honest and non-inert:
 *   1. matching must NOT depend on ESCO URIs being non-null;
 *   2. matching identity is the canonical skill slug;
 *   3. every match explains WHY (reasons/gaps/missing data);
 *   4. display names are NEVER matching identity;
 *   5. evidence tiers come only from real sources (no fake trust);
 *   6. demand-text recognition IS the offline journal recognizer (one
 *      pipeline, 12 languages);
 *   7. the static profession_skills mirror cannot drift from the seed
 *      migrations (so a new catalogue skill in profession_skills is never
 *      silently ignored by matching).
 * (Ranking sanity for the core market scenarios lives in
 *  matching-market-scenarios.test.ts.)
 */

const APP_ROOT = join(__dirname, "..", "..");
const CATALOGUE: Set<string> = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(join(APP_ROOT, "messages", "lt", "skill-names.json"), "utf8"),
    ) as Record<string, string>,
  ),
);
const PROFESSION_CATALOGUE: Set<string> = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(join(APP_ROOT, "messages", "lt", "professions.json"), "utf8"),
    ) as Record<string, string>,
  ),
);

describe("1. matching never depends on ESCO", () => {
  it("a slug-only need vs a slug-only subject matches (no esco_uri anywhere)", () => {
    const need: MatchNeed = {
      skillIds: ["order-picking", "warehouse-operations"],
      needSource: "human_structured",
    };
    const subject: MatchSubject = {
      skills: [
        { uri: "order-picking", evidence: "work_journal" },
        { uri: "warehouse-operations", evidence: "manager_confirmed" },
      ],
      availabilityStatus: "available",
    };
    const m = matchWorkerToNeed(need, subject);
    expect(m.status).toBe("strong");
    expect(m.skillFit?.matchedTotal).toBe(2);
  });

  it("the supply read layer no longer discards NULL-esco skills (source pin)", () => {
    const src = readFileSync(join(APP_ROOT, "lib", "market", "match-subject.ts"), "utf8");
    // The historical bug line was `const uri = s.skills?.esco_uri` +
    // `if (!uri) continue` — the read layer must key on slug first.
    expect(src).toMatch(/skills\s*\(\s*slug/);
    expect(src).toMatch(/slug\s*\?\?\s*s\.skills\?\.esco_uri/);
  });
});

describe("2./4. canonical slug identity — display names never match", () => {
  it("need slugs derived from text are always catalogue slugs", () => {
    const texts = [
      "We need warehouse workers for order picking and pallet handling.",
      "Ieškome virėjo — maisto gaminimas ir indų plovimas.",
      "Нужен электрик: монтаж проводки и установка розеток.",
      "Wir suchen eine Reinigungskraft, Büro gereinigt und Fenster geputzt.",
      "Etsimme siivoojaa toimistolle, ikkunanpesu ja siivous.",
    ];
    for (const t of texts) {
      const d = deriveNeedSkills({ needSummary: t });
      expect(d.skillSlugs.length, t).toBeGreaterThan(0);
      for (const slug of d.skillSlugs) {
        expect(CATALOGUE.has(slug), `derived '${slug}' is not a catalogue slug`).toBe(true);
      }
    }
  });

  it("a display name on either side never matches a canonical slug", () => {
    // "Order picking & packing" is the EN DISPLAY NAME of order-picking.
    const needBySlug: MatchNeed = { skillIds: ["order-picking"] };
    const subjectWithDisplayName: MatchSubject = {
      skills: [{ uri: "Order picking & packing", evidence: "work_journal" }],
    };
    expect(
      matchWorkerToNeed(needBySlug, subjectWithDisplayName).skillFit?.matchedTotal,
    ).toBe(0);

    const needByDisplayName: MatchNeed = { skillIds: ["Order picking & packing"] };
    const subjectBySlug: MatchSubject = {
      skills: [{ uri: "order-picking", evidence: "work_journal" }],
    };
    expect(
      matchWorkerToNeed(needByDisplayName, subjectBySlug).skillFit?.matchedTotal,
    ).toBe(0);
  });

  it("detected need professions are catalogue professions", () => {
    for (const t of ["Looking for a warehouse worker", "Ieškome virėjos", "Нужен сварщик"]) {
      const p = detectNeedProfession(t);
      if (p !== null) expect(PROFESSION_CATALOGUE.has(p), `${t} → ${p}`).toBe(true);
    }
  });
});

describe("3. every match explains why", () => {
  it("a computable match always carries a skill_fit reason and full basis", () => {
    const need: MatchNeed = {
      skillIds: ["cooking", "dishwashing"],
      needSource: "human_structured",
    };
    const m = matchWorkerToNeed(need, {
      skills: [{ uri: "cooking", evidence: "work_journal" }],
    });
    expect(m.reasons.some((r) => r.code === "skill_fit")).toBe(true);
    expect(m.skillFit?.matchedUris).toEqual(["cooking"]);
    expect(m.gaps.some((g) => g.code === "skills_missing")).toBe(true);
    expect(m.nextAction).toBeTruthy();
  });

  it("an unstructured need is insufficient_data with an explicit note + action", () => {
    const m = matchWorkerToNeed({ skillIds: [] }, { skills: [] });
    expect(m.status).toBe("insufficient_data");
    expect(m.missingData).toContain("need_not_structured");
    expect(m.nextAction).toBe("structure_demand");
  });

  it("a recognized-from-text need is flagged for human confirmation", () => {
    const d = deriveNeedSkills({ needSummary: "We need order picking staff." });
    expect(d.source).toBe("recognized_from_text");
    const m = matchWorkerToNeed(
      { skillIds: d.skillSlugs, needSource: d.source },
      { skills: [{ uri: "order-picking", evidence: "work_journal" }] },
    );
    expect(m.missingData).toContain("need_recognized_not_confirmed");
    expect(m.nextAction).toBe("confirm_recognized_need");
  });
});

describe("5. no fake trust / evidence", () => {
  it("unknown worker_skills.source degrades to self_declared, never upgrades", () => {
    expect(sourceToEvidence("manager_confirmed")).toBe("manager_confirmed");
    expect(sourceToEvidence("work_journal")).toBe("work_journal");
    expect(sourceToEvidence("self_declared")).toBe("self_declared");
    expect(sourceToEvidence("totally_unknown")).toBe("self_declared");
    expect(sourceToEvidence(null)).toBe("self_declared");
    expect(sourceToEvidence(undefined)).toBe("self_declared");
  });

  it("evidence breakdown counts only MATCHED skills and sums exactly", () => {
    const need: MatchNeed = { skillIds: ["cooking", "baking"], needSource: "human_structured" };
    const m = matchWorkerToNeed(need, {
      skills: [
        { uri: "cooking", evidence: "manager_confirmed" },
        { uri: "baking", evidence: "self_declared" },
        { uri: "driving", evidence: "manager_confirmed" }, // not required → not counted
      ],
    });
    const e = m.evidence;
    expect(e.matchedManagerConfirmed + e.matchedJournalSupported + e.matchedSelfDeclared).toBe(
      m.skillFit?.matchedTotal,
    );
    expect(e.matchedManagerConfirmed).toBe(1);
    expect(e.matchedSelfDeclared).toBe(1);
  });
});

describe("6. demand recognition IS the offline journal recognizer", () => {
  it("deriveNeedSkills equals recognizeSkills (non-fuzzy) on the same text", () => {
    const text = "Ich habe im Lager gearbeitet und Paletten gestapelt — wir suchen genau das.";
    const derived = deriveNeedSkills({ needSummary: text });
    const direct = [
      ...new Set(
        recognizeSkills(text, 8)
          .filter((s) => s.via !== "fuzzy")
          .map((s) => s.slug),
      ),
    ].sort();
    expect([...derived.skillSlugs]).toEqual(direct);
  });
});

describe("7. static profession_skills mirror cannot drift from the seeds", () => {
  /** Same parser as the installation-chain guard. */
  function seededLinks(): Record<string, string[]> {
    const MIGRATIONS_DIR = join(APP_ROOT, "..", "..", "supabase", "migrations");
    const out: Record<string, string[]> = {};
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
        .split("\n")
        .map((l) => l.replace(/--.*$/, ""))
        .join("\n");
      if (!/insert into public\.profession_skills/i.test(sql)) continue;
      const cte = sql.match(
        /with link\s*\([^)]*\)\s*as\s*\(([\s\S]*?)\)\s*insert into public\.profession_skills/i,
      );
      if (!cte) continue;
      for (const m of cte[1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9-]+)'/g)) {
        (out[m[1]] ??= []).push(m[2]);
      }
    }
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].sort();
    return out;
  }

  it("PROFESSION_SKILLS === the profession_skills seed migrations, link for link", () => {
    const seeded = seededLinks();
    const staticMap: Record<string, string[]> = Object.fromEntries(
      Object.entries(PROFESSION_SKILLS).map(([k, v]) => [k, [...v].sort()]),
    );
    expect(staticMap).toEqual(seeded);
  });

  it("every linked skill slug is a catalogue slug (new skills cannot be silently ignored)", () => {
    for (const [prof, skills] of Object.entries(PROFESSION_SKILLS)) {
      expect(PROFESSION_CATALOGUE.has(prof), `unknown profession '${prof}'`).toBe(true);
      for (const s of skills) {
        expect(CATALOGUE.has(s), `${prof} links unknown skill '${s}'`).toBe(true);
      }
    }
  });

  it("profession expansion feeds matching (a linked skill is matchable end-to-end)", () => {
    for (const [prof, skills] of Object.entries(PROFESSION_SKILLS)) {
      const need: MatchNeed = {
        skillIds: skillsForProfession(prof),
        needSource: "profession_expanded",
      };
      const subject: MatchSubject = {
        skills: skills.map((uri) => ({ uri, evidence: "work_journal" as const })),
      };
      const m = matchWorkerToNeed(need, subject);
      expect(m.skillFit?.matchedTotal, prof).toBe(skills.length);
    }
  });

  it("relatedness is sane: identical professions 1, disjoint 0", () => {
    expect(professionRelatedness("mason", "mason")).toBe(1);
    expect(professionRelatedness("mason", "software_developer")).toBe(0);
    expect(professionRelatedness("waiter", "barista")).toBeGreaterThan(0);
    expect(professionRelatedness(null, "mason")).toBe(0);
  });
});

describe("§19 shape stays: coverage % always carries its basis", () => {
  it("computeContextFit returns the full basis or null — no bare number path", () => {
    const basis = computeContextFit(["a", "b"], [{ uri: "a", verified: true }]);
    expect(basis).toMatchObject({
      pct: 50,
      needTotal: 2,
      matchedTotal: 1,
      matchedConfirmed: 1,
      matchedUris: ["a"],
      missingUris: ["b"],
    });
    expect(computeContextFit([], [])).toBeNull();
  });
});
