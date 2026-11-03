import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The job search trigram index is only safe while the search function plans
 * every call with the real term. On 2026-11-03 production switched the nested
 * statements to generic plans, which chose the index for 1-2 character terms
 * (no trigrams): 16-26 s against a 3 s timeout, and the index was rolled back.
 * `plan_cache_mode = force_custom_plan` on the function prevents that, but any
 * later CREATE OR REPLACE resets it — so the newest definition must carry it.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const DIR = join(ROOT, "supabase", "migrations");
const FN = "search_public_vacancy_previews_v1";
const SETTING = "20261103200000_search_public_vacancy_previews_force_custom_plan_v1";
const INDEX_V2 = "20261103200100_public_vacancies_occupation_trgm_idx_v2";
const sqlOnly = (s: string) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const body = (f: string) => sqlOnly(readFileSync(join(DIR, f), "utf8"));
const replaces = (s: string) => new RegExp(String.raw`create\s+or\s+replace\s+function\s+public\.${FN}\b`, "i").test(s);
const setsCustom = (s: string) => /plan_cache_mode\s*(=|to)\s*'?force_custom_plan'?/i.test(s);

describe("job search: custom plans while the trigram index exists", () => {
  it("sets force_custom_plan on the search function, and only that", () => {
    const s = body(`${SETTING}.sql`);
    expect(s.trim().split(/;\s*/).filter(Boolean)).toEqual([
      "begin",
      `alter function public.${FN}(text, text, integer, integer)\n  set plan_cache_mode = force_custom_plan`,
      "commit",
    ]);
    const down = sqlOnly(readFileSync(join(ROOT, "supabase", "rollbacks", `${SETTING}.down.sql`), "utf8"));
    expect(down).toMatch(new RegExp(String.raw`alter function public\.${FN}\(text, text, integer, integer\)\s+reset plan_cache_mode;`));
  });

  it("re-creates the index only after the setting", () => {
    expect(files.indexOf(`${SETTING}.sql`)).toBeGreaterThan(-1);
    expect(files.indexOf(`${INDEX_V2}.sql`)).toBeGreaterThan(files.indexOf(`${SETTING}.sql`));
  });

  it("no later CREATE OR REPLACE drops the setting", () => {
    const lastReplace = files.map((f, i) => (replaces(body(f)) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const lastSetting = files
      .map((f, i) => {
        const s = body(f);
        const altered = new RegExp(String.raw`alter\s+function\s+public\.${FN}\b[^;]*force_custom_plan`, "i").test(s);
        return altered || (replaces(s) && setsCustom(s)) ? i : -1;
      })
      .reduce((a, b) => Math.max(a, b), -1);
    expect(lastReplace).toBeGreaterThan(-1);
    expect(
      lastSetting,
      `${files[lastReplace]} replaces ${FN} after the plan_cache_mode setting; carry "set plan_cache_mode to 'force_custom_plan'" in it`,
    ).toBeGreaterThanOrEqual(lastReplace);
  });
});
