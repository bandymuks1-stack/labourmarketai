import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLATFORM_OUTPUT_UNIT_SLUGS, WORK_TIME_UNIT_SLUGS } from "@/lib/journal/work-time";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { intakeOutputFields } from "@/lib/journal/intake-work-time";

/**
 * THE UNIT REGISTRY IS ONE THING (issue #1689, registry row 20260911130000).
 *
 * `journal_entry_metrics.unit_slug` is a FK into `productivity_units`. Every
 * slug a surface can WRITE — the two editors' pickers, the recognizer's
 * quantity reading, the chat/MCP intake — must therefore be seeded by a
 * migration and labelled in every active locale, or a person's confirmed
 * "320 km" is refused by name at save time (`unit_slug_unknown`) on a
 * database that lacks the row, or renders as a raw slug on one that has it.
 * This is the gap 0017 closed once for hours/pieces/kg; this guard keeps it
 * closed for every unit added since, in both directions:
 *
 *   code → registry   every slug the code can write is seeded;
 *   registry → code   every seeded platform slug is labelled and, when it is
 *                     an output unit, offered by the ONE picker list.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");

const SEED_MIGRATIONS = [
  "supabase/migrations/0013_work_journal_m1.sql",
  "supabase/migrations/0017_seed_platform_productivity_units.sql",
  "supabase/migrations/20260911130000_productivity_units_universal_v1.sql",
] as const;

/** Slugs seeded by `insert into public.productivity_units (...) values ('slug', ...)`. */
function seededSlugs(): Set<string> {
  const out = new Set<string>();
  for (const file of SEED_MIGRATIONS) {
    const sql = read(file);
    const block = sql.match(/insert into public\.productivity_units[\s\S]*?on conflict/gi) ?? [];
    for (const b of block) {
      for (const m of b.matchAll(/\(\s*'([a-z_]+)'\s*,/g)) out.add(m[1]!);
    }
  }
  return out;
}

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const ALL_LOCALES = ["da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;
const labels = (locale: string): Record<string, string> =>
  JSON.parse(read(`apps/web/messages/${locale}/productivity-units.json`));

describe("journal unit registry — code → registry", () => {
  const seeded = seededSlugs();

  it("every output unit the pickers offer is seeded by a migration", () => {
    for (const slug of PLATFORM_OUTPUT_UNIT_SLUGS) expect(seeded, slug).toContain(slug);
  });

  it("every work-time unit is seeded by a migration", () => {
    for (const slug of WORK_TIME_UNIT_SLUGS) expect(seeded, slug).toContain(slug);
  });

  it("the recognizer only ever reads a quantity into a registered output unit", () => {
    const src = read("apps/web/lib/structuring/extract-journal-suggestions.ts");
    const written = [...src.matchAll(/unitSlug:\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(written.length).toBeGreaterThan(0);
    for (const slug of new Set(written)) {
      expect(seeded, `extractor writes '${slug}'`).toContain(slug);
    }
    const outputSet = new Set<string>(PLATFORM_OUTPUT_UNIT_SLUGS);
    for (const slug of new Set(written)) {
      if (!(WORK_TIME_UNIT_SLUGS as readonly string[]).includes(slug)) {
        expect(outputSet, `extractor output '${slug}' is offered by the picker`).toContain(slug);
      }
    }
  });

  it("the chat / MCP intake writes the stated output in a registered unit and never a time unit", () => {
    for (const [text, unit] of [
      ["Nuvažiavau 320 km", "kilometers"],
      ["Iškroviau 12 palečių", "pallets"],
      ["Sudėjau 35 m² plytelių", "square_meters"],
    ] as const) {
      const f = intakeOutputFields(text);
      expect(f.unit_slug, text).toBe(unit);
      expect(seeded).toContain(f.unit_slug);
    }
    expect(intakeOutputFields("Dirbau 8 val.")).toEqual({});
    expect(extractJournalSuggestions("Dirbau 8 val.").quantity).toBeNull();
  });

  it("both editors offer the ONE output-unit list — no local copy to drift", () => {
    for (const file of [
      "apps/web/components/app/journal-entry-composer.tsx",
      "apps/web/components/app/journal-entry-compact-editor.tsx",
    ]) {
      const src = read(file);
      expect(src, file).toContain("PLATFORM_OUTPUT_UNIT_SLUGS");
      // a hand-written list of registry slugs inside a picker is the drift
      // this guard exists to stop (the compact editor had one until #1689)
      expect(src, file).not.toMatch(/\[\s*"square_meters",\s*"meters",\s*"pieces"/);
    }
  });
});

describe("journal unit registry — registry → code", () => {
  const seeded = seededSlugs();
  const timeSet = new Set<string>(WORK_TIME_UNIT_SLUGS);
  const outputSet = new Set<string>(PLATFORM_OUTPUT_UNIT_SLUGS);
  // Rates are derived display units (m²/day, boxes/day) — recorded by no
  // surface, kept for the 0013 pace fields; they need a label, not a picker.
  const RATE_UNITS = new Set(["square_meters_per_day", "box_per_day"]);

  it("every seeded platform slug is labelled in every locale catalogue (active ones for real)", () => {
    for (const locale of ALL_LOCALES) {
      const l = labels(locale);
      for (const slug of seeded) {
        expect(typeof l[slug], `${locale}: ${slug}`).toBe("string");
        expect(l[slug]!.trim(), `${locale}: ${slug}`).not.toBe("");
      }
    }
    for (const locale of ACTIVE_LOCALES) {
      for (const [slug, v] of Object.entries(labels(locale))) {
        expect(v.startsWith("[EN]"), `${locale}: ${slug} is a placeholder`).toBe(false);
      }
    }
  });

  it("every seeded non-time, non-rate slug is an output unit the picker offers", () => {
    for (const slug of seeded) {
      if (timeSet.has(slug) || RATE_UNITS.has(slug)) continue;
      expect(outputSet, `seeded '${slug}' has no picker entry`).toContain(slug);
    }
  });

  it("the four universal rows (km / pallets / covers / cases) are seeded as platform rows", () => {
    const sql = read(SEED_MIGRATIONS[2]);
    for (const slug of ["kilometers", "pallets", "covers", "cases"]) {
      expect(sql).toMatch(new RegExp(`\\(\\s*'${slug}'\\s*,\\s*'(?:length|count)'\\s*,\\s*'platform'`));
    }
    // a kilometre is a thousand metres — the registry's own parent convention
    expect(sql).toMatch(/'kilometers',\s*'length',\s*'platform',\s*'meters',\s*1000/);
  });
});

describe("20260911130000 — additive, idempotent, guarded rollback", () => {
  const upRaw = read(SEED_MIGRATIONS[2]);
  const down = read("supabase/rollbacks/20260911130000_productivity_units_universal_v1.down.sql");
  // statements only — the header explains what the file does NOT do, in words
  const up = upRaw
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("only inserts rows — no DROP / ALTER / DELETE / UPDATE / GRANT / policy", () => {
    expect(up).toMatch(/on conflict\s*\(\s*slug\s*\)\s*do nothing/i);
    for (const rx of [
      /\bdrop\s+/i,
      /\balter\s+/i,
      /\bdelete\s+from\b/i,
      /\bupdate\s+public\./i,
      /\bgrant\b/i,
      /\brevoke\b/i,
      /\bcreate\s+policy\b/i,
      /security\s+definer/i,
    ]) {
      expect(up).not.toMatch(rx);
    }
    expect(upRaw).toMatch(/^-- ROLLBACK/m);
  });

  it("the rollback removes only the four rows and only while nothing references them", () => {
    expect(down).toMatch(/delete from public\.productivity_units/i);
    expect(down).toMatch(/'kilometers',\s*'pallets',\s*'covers',\s*'cases'/);
    expect(down).toMatch(/scope = 'platform'/);
    for (const ref of [
      "journal_entry_metrics m where m.unit_slug = u.slug",
      "worker_skills w where w.current_pace_unit_slug = u.slug",
      "c.parent_unit_slug = u.slug or c.base_unit_slug = u.slug",
    ]) {
      expect(down).toContain(ref);
    }
    expect(down).not.toMatch(/cascade/i);
  });
});
