import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  SKILL_HINTS_LT,
  ACTIVITY_HINTS_LT,
  ACTIVITY_HINTS_EN,
  WORK_DIRECTION_HINTS_LT,
  PROFESSION_HINTS_LT,
} from "@/lib/structuring/keywords";

/**
 * SKILL INSTALLATION CHAIN — the "fully installed" truth guard
 * (runtime/audits/skill-installation-truth-audit-2026-07-04.md §6).
 *
 * History this exists to prevent: for months, non-construction skills were
 * "done" in recognition/labels/locale JSON while the canonical DB seed chain
 * was construction-only — and nothing failed, because no test compared the
 * recognition layer against the MIGRATIONS. Concrete failures this guard
 * would have caught:
 *   - builder/rebar_worker/site_manager: in professions.json since PR #2,
 *     NEVER seeded by any migration; their 0011 profession_skills links
 *     silently inserted zero rows (JOIN found no profession).
 *   - PR #583's original seed migration inserted name_lt/name_en columns that
 *     migration 0012 had dropped — it would have failed at apply time.
 *
 * Contract enforced statically (no DB): a skill/profession is FULLY INSTALLED
 * only when recognition slug → canonical seed migration → locale registry
 * (all 11) → profession links all agree. Any layer drifting alone fails CI.
 */

const APP_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(APP_ROOT, "..", "..", "supabase", "migrations");
// 12 taxonomy locales since 2026-07-04 (owner mandate): "fi" joined as a
// taxonomy+recognition locale (doctrine §2.4 amendment flagged in PR3B).
// Removing any file below — including messages/fi/ — fails this guard.
const LOCALES = ["da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv"];

const readJson = (rel: string): Record<string, string> =>
  JSON.parse(readFileSync(join(APP_ROOT, rel), "utf8")) as Record<string, string>;

/** All migration SQL, with comments stripped so commented-out examples never count. */
const MIGRATION_SQL: { file: string; sql: string }[] = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((file) => ({
    file,
    sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8")
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n"),
  }));

/** First quoted value of every tuple inside `insert into public.<table> (...) values ...;` */
function seededSlugs(table: "skills" | "professions"): Set<string> {
  const out = new Set<string>();
  const stmtRe = new RegExp(
    `insert into public\\.${table}\\s*\\([^)]*\\)\\s*values([\\s\\S]*?);`,
    "gi",
  );
  for (const { sql } of MIGRATION_SQL) {
    for (const stmt of sql.matchAll(stmtRe)) {
      for (const tuple of stmt[1].matchAll(/\(\s*'([a-z0-9_-]+)'/g)) out.add(tuple[1]);
    }
  }
  return out;
}

/** (profession, skill) pairs from every profession_skills link CTE in migrations. */
function seededLinks(): { prof: string; skill: string; file: string }[] {
  const out: { prof: string; skill: string; file: string }[] = [];
  for (const { file, sql } of MIGRATION_SQL) {
    if (!/insert into public\.profession_skills/i.test(sql)) continue;
    const cte = sql.match(/with link\s*\([^)]*\)\s*as\s*\(([\s\S]*?)\)\s*insert into public\.profession_skills/i);
    if (!cte) continue;
    for (const m of cte[1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9-]+)'/g)) {
      out.push({ prof: m[1], skill: m[2], file });
    }
  }
  return out;
}

const SEEDED_SKILLS = seededSlugs("skills");
const SEEDED_PROFESSIONS = seededSlugs("professions");
const LINKS = seededLinks();

const skillNamesLt = readJson("messages/lt/skill-names.json");
const professionsLt = readJson("messages/lt/professions.json");

describe("chain: recognition slugs are canonically seeded (not label-only ghosts)", () => {
  it("every SKILL_HINTS_LT slug has a `public.skills` seed row in migrations", () => {
    for (const slug of new Set(SKILL_HINTS_LT.map((r) => r.slug))) {
      expect(
        SEEDED_SKILLS.has(slug),
        `recognition emits '${slug}' but NO migration seeds it into public.skills — recognized ≠ installed`,
      ).toBe(true);
    }
  });

  it("every profession slug the recognisers emit has a `public.professions` seed row", () => {
    const profSlugs = new Set(
      [
        ...ACTIVITY_HINTS_LT.map((a) => a.slug),
        ...ACTIVITY_HINTS_EN.map((a) => a.slug),
        ...WORK_DIRECTION_HINTS_LT.map((d) => d.slug),
        ...PROFESSION_HINTS_LT.map((p) => p.slug),
      ].filter((s): s is string => !!s),
    );
    for (const slug of profSlugs) {
      expect(
        SEEDED_PROFESSIONS.has(slug),
        `recognition emits profession '${slug}' but NO migration seeds it — the 0008/0011 builder-class gap`,
      ).toBe(true);
    }
  });
});

describe("chain: locale registry and canonical seeds are the SAME catalogue", () => {
  it("every seeded skill has a locale name and every locale skill is seeded (exact match)", () => {
    expect([...SEEDED_SKILLS].sort()).toEqual(Object.keys(skillNamesLt).sort());
  });

  it("every seeded profession has a locale name and every locale profession is seeded (exact match)", () => {
    expect([...SEEDED_PROFESSIONS].sort()).toEqual(Object.keys(professionsLt).sort());
  });

  it("all 12 taxonomy locales carry identical taxonomy keys", () => {
    const ltSkills = Object.keys(skillNamesLt).sort();
    const ltProfs = Object.keys(professionsLt).sort();
    for (const loc of LOCALES) {
      expect(Object.keys(readJson(`messages/${loc}/skill-names.json`)).sort(), loc).toEqual(ltSkills);
      expect(Object.keys(readJson(`messages/${loc}/professions.json`)).sort(), loc).toEqual(ltProfs);
    }
  });
});

describe("chain: profession_skills links are real, not dangling", () => {
  it("every link references a SEEDED profession (0011 silently dropped links for unseeded ones)", () => {
    for (const l of LINKS) {
      expect(
        SEEDED_PROFESSIONS.has(l.prof),
        `${l.file}: link ('${l.prof}','${l.skill}') references an unseeded profession — it inserts ZERO rows`,
      ).toBe(true);
    }
  });

  it("every link references a SEEDED skill", () => {
    for (const l of LINKS) {
      expect(
        SEEDED_SKILLS.has(l.skill),
        `${l.file}: link ('${l.prof}','${l.skill}') references an unseeded skill — it inserts ZERO rows`,
      ).toBe(true);
    }
  });

  it("every seeded profession has at least one profession_skills link", () => {
    const linked = new Set(LINKS.map((l) => l.prof));
    for (const prof of SEEDED_PROFESSIONS) {
      expect(linked.has(prof), `profession '${prof}' is seeded but has NO skill links`).toBe(true);
    }
  });
});

describe("chain: seed migrations match the REAL table shape (the 0012 lesson)", () => {
  // 0012 dropped every taxonomy name column (doctrine §2 — names live in the
  // locale JSON). Any seed that inserts name columns fails at apply time.
  // PR #583's original migration made exactly this mistake; only the blocked
  // MCP connector prevented a failed prod apply.
  it("no skills/professions seed after 0012 inserts dropped name_* columns", () => {
    for (const { file, sql } of MIGRATION_SQL) {
      if (file <= "0012") continue;
      for (const stmt of sql.matchAll(/insert into public\.(skills|professions)\s*\(([^)]*)\)/gi)) {
        expect(
          /name_(lt|en|ru|nl|de|pl)/.test(stmt[2]),
          `${file}: seeds public.${stmt[1]} with a name_* column that 0012 dropped — this INSERT fails at apply`,
        ).toBe(false);
      }
    }
  });
});
