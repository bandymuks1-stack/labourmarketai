import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { detectNeedProfession } from "@/lib/market/need-skills";
import { structureValueStatement } from "@/lib/structuring/value-statement";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import {
  PROFESSION_HINTS_LT,
  SKILL_HINTS_LT,
  CONSTRUCTION_SKILL_HINT_SLUGS,
} from "@/lib/structuring/keywords";
import { isKnownSector } from "@/lib/structuring/sectors";
import { PROFESSION_SKILLS, PROFESSION_SLUGS } from "@/lib/taxonomy/profession-skills";

/**
 * OFFICE & PROFESSIONAL PROFESSION CATALOGUE v1 (window 6 G-D2, 2026-09-06).
 *
 * Production walks on build ca96605b proved the platform reads as a
 * manual-labour product to professionals: "Reikia buhalterio." /
 * "reikia teisininko" / "reikia inžinieriaus" / "reikia dizainerio" /
 * "reikia konsultanto" / "Reikia projektų vadovo." / "ieškome pardavimų
 * specialisto" / "reikia finansų analitiko" and "esu buhalteris, ieškau
 * darbo" all reached the doors with an EMPTY role — the 49-row catalogue had
 * no such profession, so the profile screen could not SET it and matching by
 * profession could not see it.
 *
 * This guard pins the whole installation chain of the fix (the chain the
 * installation-chain guard enforces in the abstract): the seed migration is
 * additive and human-gated, the static matching mirror carries the links, all
 * 12 taxonomy locales carry real names (no "[EN]" shells — these are the words
 * real people will read), and the ONE profession lexicon resolves the walked
 * sentences to the new slugs WITHOUT stealing sentences that belong to an
 * existing row (sales assistant, site engineer, software developer) and
 * WITHOUT turning a service noun into a person.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIGRATION = "20260906120000_professions_catalogue_office_v1.sql";
const LOCALES = ["da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv"];

const NEW_PROFESSIONS: Record<string, string> = {
  accountant: "finance_legal",
  finance_specialist: "finance_legal",
  lawyer: "finance_legal",
  engineer: "engineering_design",
  designer: "engineering_design",
  consultant: "business_management",
  project_manager: "business_management",
  marketing_specialist: "business_management",
  sales_specialist: "retail_sales",
};

const NEW_SKILLS = [
  "financial-reporting", "payroll", "financial-analysis", "budgeting", "tax-accounting",
  "legal-advice", "contract-drafting", "technical-design", "cad-drafting", "interior-design",
  "business-consulting", "project-management", "b2b-sales", "digital-marketing", "content-writing",
];

const readJson = (rel: string): Record<string, string> =>
  JSON.parse(readFileSync(join(WEB, rel), "utf8")) as Record<string, string>;

const stripComments = (sql: string) =>
  sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

describe("the seed migration: additive, human-gated, exactly these rows", () => {
  const path = join(REPO, "supabase", "migrations", MIGRATION);
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const sql = stripComments(raw);

  it("exists, and line 1 is the human-gate marker (RED route by policy: catalogue DML)", () => {
    expect(existsSync(path)).toBe(true);
    expect(raw.split(/\r?\n/)[0]).toBe("-- @human-gate-approved");
  });

  it("is strictly additive — INSERT … ON CONFLICT DO NOTHING only", () => {
    expect(sql).not.toMatch(/^\s*(update|delete|drop|alter|grant|revoke|truncate|create)\b/im);
    expect(sql).toMatch(/on conflict \(slug\) do nothing/);
    expect(sql).toMatch(/on conflict \(profession_id, skill_id\) do nothing/);
  });

  it("seeds exactly the nine professions, each in a sector the registry knows", () => {
    const block = sql.match(/insert into public\.professions[\s\S]*?;/i)?.[0] ?? "";
    const seeded = Object.fromEntries(
      [...block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)].map((m) => [m[1], m[2]]),
    );
    expect(seeded).toEqual(NEW_PROFESSIONS);
    for (const sector of Object.values(seeded)) expect(isKnownSector(sector), sector).toBe(true);
  });

  it("seeds exactly the fifteen skills", () => {
    const block = sql.match(/insert into public\.skills[\s\S]*?;/i)?.[0] ?? "";
    const seeded = [...block.matchAll(/\(\s*'([a-z0-9-]+)'\s*,/g)].map((m) => m[1]);
    expect([...seeded].sort()).toEqual([...NEW_SKILLS].sort());
  });

  it("ships a rollback that refuses to delete anything a person or institution references", () => {
    const down = join(REPO, "supabase", "rollbacks", MIGRATION.replace(/\.sql$/, ".down.sql"));
    expect(existsSync(down)).toBe(true);
    const src = readFileSync(down, "utf8");
    for (const ref of [
      "worker_professions", "journal_entries", "profession_templates",
      "education_programs", "worker_skills", "journal_entry_skills",
    ]) {
      expect(src, `rollback must guard on ${ref}`).toMatch(new RegExp(`not exists \\(select 1 from public\\.${ref}`));
    }
    expect(src).not.toMatch(/^\s*(drop|alter|truncate)\b/im);
  });

  it("states the apply-before-merge sequencing (the slug is resolved against the LIVE table)", () => {
    expect(raw).toMatch(/APPLY BEFORE MERGE/);
  });
});

describe("the static matching mirror carries the new professions", () => {
  it("PROFESSION_SLUGS = 58 and every new profession has 4–6 links", () => {
    expect(PROFESSION_SLUGS.length).toBe(58);
    for (const slug of Object.keys(NEW_PROFESSIONS)) {
      const links = PROFESSION_SKILLS[slug];
      expect(links, slug).toBeDefined();
      expect(links.length, slug).toBeGreaterThanOrEqual(4);
      expect(links.length, slug).toBeLessThanOrEqual(6);
    }
  });

  it("every link is a catalogue skill with an LT name (new or pre-existing transversal)", () => {
    const lt = readJson("messages/lt/skill-names.json");
    for (const slug of Object.keys(NEW_PROFESSIONS)) {
      for (const s of PROFESSION_SKILLS[slug]) expect(lt[s], `${slug} → ${s}`).toBeTruthy();
    }
  });
});

describe("all 12 taxonomy locales carry REAL names — no [EN] shells for what real people read", () => {
  for (const loc of LOCALES) {
    it(`${loc}: 9 professions + 15 skills named`, () => {
      const profs = readJson(`messages/${loc}/professions.json`);
      const skills = readJson(`messages/${loc}/skill-names.json`);
      for (const slug of Object.keys(NEW_PROFESSIONS)) {
        expect(profs[slug]?.trim(), `${loc}/professions.json ${slug}`).toBeTruthy();
        expect(profs[slug]).not.toMatch(/\[EN\]/);
      }
      for (const slug of NEW_SKILLS) {
        expect(skills[slug]?.trim(), `${loc}/skill-names.json ${slug}`).toBeTruthy();
        expect(skills[slug]).not.toMatch(/\[EN\]/);
      }
    });
  }

  it("the primary language reads as a profession, not a translation of one", () => {
    const lt = readJson("messages/lt/professions.json");
    expect(lt.accountant).toBe("Buhalteris");
    expect(lt.lawyer).toBe("Teisininkas");
    expect(lt.engineer).toBe("Inžinierius");
    expect(lt.project_manager).toBe("Projektų vadovas");
    expect(lt.sales_specialist).toBe("Pardavimų specialistas");
  });
});

describe("the ONE profession lexicon resolves the walked sentences", () => {
  it.each([
    // the production walk sentences (window 5/6)
    ["Reikia buhalterio.", "accountant"],
    ["reikia buhalterės", "accountant"],
    ["esu buhalteris, ieškau darbo", "accountant"],
    ["ieškome apskaitininkės", "accountant"],
    ["reikia teisininko", "lawyer"],
    ["ieškau advokato", "lawyer"],
    ["reikia inžinieriaus", "engineer"],
    ["esu inžinierius", "engineer"],
    ["reikia dizainerio", "designer"],
    ["reikia dizainerių", "designer"],
    ["reikia konsultanto", "consultant"],
    ["Reikia projektų vadovo.", "project_manager"],
    ["dirbau projektų vadovu 5 metus", "project_manager"],
    ["ieškome pardavimų specialisto Vilniuje", "sales_specialist"],
    ["reikia pardavimų vadybininko", "sales_specialist"],
    ["reikia finansų analitiko", "finance_specialist"],
    ["esu finansininkė", "finance_specialist"],
    ["reikia rinkodaros specialisto", "marketing_specialist"],
    // the other routed languages
    ["we need an accountant", "accountant"],
    ["looking for a lawyer", "lawyer"],
    ["need an engineer for the plant", "engineer"],
    ["we need a designer", "designer"],
    ["business consultant wanted", "consultant"],
    ["need a project manager", "project_manager"],
    ["sales specialist wanted", "sales_specialist"],
    ["financial analyst needed", "finance_specialist"],
    ["marketing specialist wanted", "marketing_specialist"],
    ["нужен бухгалтер", "accountant"],
    ["нужен юрист", "lawyer"],
    ["нужен инженер", "engineer"],
    ["нужен дизайнер", "designer"],
    ["нужен консультант", "consultant"],
    ["нужен руководитель проекта", "project_manager"],
    ["ищем менеджера по продажам", "sales_specialist"],
    ["нужен финансовый аналитик", "finance_specialist"],
    ["ищем маркетолога", "marketing_specialist"],
  ])("%s → %s", (sentence, slug) => {
    expect(detectNeedProfession(sentence)).toBe(slug);
  });

  it.each([
    // sentences that belong to an EXISTING row keep it (longest needle wins)
    ["reikia pardavėjo konsultanto", "sales_assistant"],
    ["ieškome pardavėjų konsultantų", "sales_assistant"],
    ["reikia pardavimų konsultanto", "sales_specialist"],
    ["reikia statybos inžinieriaus", "site_engineer"],
    ["software engineer wanted", "software_developer"],
  ])("%s stays %s", (sentence, slug) => {
    expect(detectNeedProfession(sentence)).toBe(slug);
  });

  it.each([
    // a thing, a service or an activity is never a person
    "reikia dizaino",
    "reikia konsultacijos",
    "reikia finansavimo",
    "noriu siūlyti buhalterijos paslaugas",
    "buhalterijos paslaugos",
  ])("'%s' names no profession", (sentence) => {
    expect(detectNeedProfession(sentence)).toBeNull();
  });

  it("the value statement carries the profession to the need form (role no longer empty)", () => {
    const v = structureValueStatement("Reikia buhalterio.");
    expect(v.professionSlug).toBe("accountant");
    expect(v.workType).toBeNull();
    expect(v.reasons).toContain("profession:accountant");
    expect(structureValueStatement("noriu siūlyti buhalterijos paslaugas").professionSlug).toBeNull();
  });

  it("every new needle row targets a seeded profession and is lower-case", () => {
    for (const row of PROFESSION_HINTS_LT) {
      for (const n of row.needles) expect(n, `${row.slug}: '${n}'`).toBe(n.toLowerCase());
    }
    for (const slug of Object.keys(NEW_PROFESSIONS)) {
      expect(PROFESSION_HINTS_LT.some((r) => r.slug === slug), `no needle row for ${slug}`).toBe(true);
    }
  });
});

describe("the new skills are recognisable from journal text, in their own sectors", () => {
  it("every new skill has a hint row in a known non-construction sector", () => {
    for (const slug of NEW_SKILLS) {
      const rows = SKILL_HINTS_LT.filter((r) => r.slug === slug);
      expect(rows.length, slug).toBeGreaterThan(0);
      for (const r of rows) {
        expect(isKnownSector(r.sector)).toBe(true);
        expect(r.sector).not.toBe("construction");
      }
    }
  });

  it.each([
    ["Rengiau sutartis klientams", "contract-drafting"],
    ["Skaičiavau darbo užmokestį", "payroll"],
    ["Dirbau su AutoCAD", "cad-drafting"],
    ["Vadovavau projektui nuo pradžios iki pabaigos", "project-management"],
    ["Rašiau straipsnius įmonės tinklaraščiui", "content-writing"],
    ["Ruošiau finansinę atskaitomybę", "financial-reporting"],
  ])("'%s' → %s, zero construction slugs", (text, slug) => {
    const slugs = recognizeSkills(text, 8).map((r) => r.slug);
    expect(slugs, text).toContain(slug);
    for (const s of slugs) expect(CONSTRUCTION_SKILL_HINT_SLUGS.has(s), `construction slug '${s}' leaked`).toBe(false);
  });
});

describe("the three new sectors exist everywhere a sector is enumerated", () => {
  it("registry + the public professions page label map", () => {
    for (const s of ["finance_legal", "engineering_design", "business_management"]) {
      expect(isKnownSector(s)).toBe(true);
    }
    const page = readFileSync(
      join(WEB, "app", "[locale]", "(marketing)", "professions", "page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/finance_legal:\s*\{/);
    expect(page).toMatch(/engineering_design:\s*\{/);
    expect(page).toMatch(/business_management:\s*\{/);
  });
});
