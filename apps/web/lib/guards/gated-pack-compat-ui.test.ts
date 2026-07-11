import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  booleanToTriState,
  classifyPrefsError,
  DRIVING_LICENCE_CATEGORIES,
  EMPTY_PREFS_V2,
  parseLicenceCategories,
  parsePayBasis,
  PAY_BASIS_PREFERENCES,
  triStateToBoolean,
} from "../worker/availability-prefs-model";
import {
  classifyLanguagesError,
  parseWorkerLanguage,
  parseWorkerLanguageLevel,
  WORKER_LANGUAGE_LEVELS,
  WORKER_LANGUAGE_NATIVE_NAMES,
  WORKER_LANGUAGES,
} from "../worker/worker-languages-model";

/**
 * Gated-pack compatibility UI guard (P2-PR3).
 *
 * Two DRAFT human-gated migrations exist as open PRs — NOT applied, NOT in
 * main:
 *   * PR #720 20260711250000_worker_languages_v1.sql — worker_languages
 *     table (lang ∈ 11-locale set, level ∈ A1..C2+native) + the two RPCs
 *     save_worker_language_v1 / remove_worker_language_v1;
 *   * PR #721 20260711270000_worker_preference_columns_v2.sql — 7 nullable
 *     workers columns + save_worker_availability_prefs_v2 (15 args).
 *
 * The UI ships TODAY and degrades honestly until the owner applies them.
 * This guard pins:
 *   (a) the client vocabularies match the draft SQL EXACTLY (literals pinned
 *       here because the SQL files are not in main; if a migration file IS
 *       present in the repo the guard additionally cross-checks the SQL);
 *   (b) tri-state honesty for every new boolean — null never becomes false;
 *   (c) 42703 / 42P01 / 42883 / PGRST202 → not-enabled / needs_migration;
 *   (d) the v1 save path still works standalone (v2 falls back to the v1
 *       RPC and reports the v2 fields as not saved — source scan).
 */

const webRoot = join(__dirname, "..", "..");
const repoRoot = join(webRoot, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

// ── (a) vocabularies match the draft SQL exactly ────────────────────────────

// Pinned literals from PR #720's CHECK constraints (worker_languages).
const SQL_720_LANGS = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];
const SQL_720_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native"];
// Pinned literals from PR #721's CHECK constraints (workers columns v2).
const SQL_721_PAY_BASES = ["gross", "net"];
const SQL_721_LICENCES = ["B", "BE", "C", "CE", "D"];

describe("(a) vocabularies match the draft SQL (PR #720 / PR #721)", () => {
  it("worker language set = the 11-locale closed set from PR #720", () => {
    expect([...WORKER_LANGUAGES]).toEqual(SQL_720_LANGS);
  });
  it("worker language levels = A1..C2 + native from PR #720", () => {
    expect([...WORKER_LANGUAGE_LEVELS]).toEqual(SQL_720_LEVELS);
  });
  it("pay basis set = ('gross','net') from PR #721", () => {
    expect([...PAY_BASIS_PREFERENCES]).toEqual(SQL_721_PAY_BASES);
  });
  it("licence categories = ('B','BE','C','CE','D') from PR #721", () => {
    expect([...DRIVING_LICENCE_CATEGORIES]).toEqual(SQL_721_LICENCES);
  });
  it("every language code has a native display name (picker convention)", () => {
    for (const code of WORKER_LANGUAGES) {
      expect(WORKER_LANGUAGE_NATIVE_NAMES[code]?.trim().length).toBeGreaterThan(0);
    }
  });

  // If the owner has since merged a draft migration into the repo, cross-check
  // the pinned literals against the actual SQL so drift cannot go unnoticed.
  const mig720 = join(
    repoRoot, "supabase", "migrations", "20260711250000_worker_languages_v1.sql",
  );
  const mig721 = join(
    repoRoot, "supabase", "migrations", "20260711270000_worker_preference_columns_v2.sql",
  );
  it("PR #720 SQL (when present in repo) carries the same closed sets", () => {
    if (!existsSync(mig720)) return; // draft not merged — pinned literals rule
    const sql = readFileSync(mig720, "utf8");
    for (const lang of SQL_720_LANGS) expect(sql).toContain(`'${lang}'`);
    for (const level of SQL_720_LEVELS) expect(sql).toContain(`'${level}'`);
    expect(sql).toContain("save_worker_language_v1");
    expect(sql).toContain("remove_worker_language_v1");
  });
  it("PR #721 SQL (when present in repo) carries the same closed sets", () => {
    if (!existsSync(mig721)) return; // draft not merged — pinned literals rule
    const sql = readFileSync(mig721, "utf8");
    for (const basis of SQL_721_PAY_BASES) expect(sql).toContain(`'${basis}'`);
    expect(sql).toMatch(/array\['B','BE','C','CE','D'\]/);
    expect(sql).toContain("save_worker_availability_prefs_v2");
  });
});

// ── (b) tri-state honesty for every new boolean ─────────────────────────────

describe("(b) tri-state honesty — null never becomes false", () => {
  it("null / undefined map to 'not_stated', never 'no'", () => {
    expect(booleanToTriState(null)).toBe("not_stated");
    expect(booleanToTriState(undefined)).toBe("not_stated");
    // The forbidden fabrication: null must NOT round-trip into false.
    expect(triStateToBoolean(booleanToTriState(null))).toBeNull();
  });
  it("all 5 new v2 booleans render through the same TriStateField control", () => {
    const form = read("components/app/worker-availability-prefs-form.tsx");
    for (const name of [
      "night_shifts_ok",
      "weekend_shifts_ok",
      "overtime_ok",
      "own_vehicle",
      "own_tools",
    ]) {
      expect(form, `${name} must be a TriStateField`).toMatch(
        new RegExp(`<TriStateField\\s+name="${name}"`),
      );
    }
  });
  it("the action derives all 5 v2 booleans via triStateToBoolean (tri helper)", () => {
    const action = read("lib/worker/availability-prefs-actions.ts");
    for (const name of [
      "night_shifts_ok",
      "weekend_shifts_ok",
      "overtime_ok",
      "own_vehicle",
      "own_tools",
    ]) {
      expect(action).toContain(`tri("${name}")`);
    }
  });
  it("pay basis: only the closed set passes; everything else stays null", () => {
    expect(parsePayBasis("gross")).toBe("gross");
    expect(parsePayBasis("net")).toBe("net");
    expect(parsePayBasis("")).toBeNull();
    expect(parsePayBasis("  ")).toBeNull();
    expect(parsePayBasis("brutto")).toBeNull();
    expect(parsePayBasis(undefined)).toBeNull();
  });
  it("licence categories: unknown values dropped, empty → null (never [])", () => {
    expect(parseLicenceCategories(["B", "CE"])).toEqual(["B", "CE"]);
    expect(parseLicenceCategories(["CE", "B"])).toEqual(["B", "CE"]); // canonical order
    expect(parseLicenceCategories(["B", "B"])).toEqual(["B"]); // de-duplicated
    expect(parseLicenceCategories(["Z", "tractor"])).toBeNull();
    expect(parseLicenceCategories([])).toBeNull();
    expect(parseLicenceCategories(null)).toBeNull();
    expect(parseLicenceCategories(undefined)).toBeNull();
  });
  it("EMPTY_PREFS_V2 is all-null (nothing pre-stated)", () => {
    expect(Object.values(EMPTY_PREFS_V2).every((v) => v === null)).toBe(true);
  });
  it("language / level parse: closed-set only, never coerced", () => {
    expect(parseWorkerLanguage("lt")).toBe("lt");
    expect(parseWorkerLanguage("fi")).toBeNull(); // not in the 11-set
    expect(parseWorkerLanguage("")).toBeNull();
    expect(parseWorkerLanguageLevel("B2")).toBe("B2");
    expect(parseWorkerLanguageLevel("native")).toBe("native");
    expect(parseWorkerLanguageLevel("fluent")).toBeNull();
    expect(parseWorkerLanguageLevel("")).toBeNull();
  });
});

// ── (c) error-code → not-enabled / needs_migration mapping ─────────────────

describe("(c) 42703/42P01/42883/PGRST202 map to the honest not-enabled state", () => {
  it("prefs classifier: draft-absent codes → needs_migration", () => {
    for (const code of ["42703", "42P01", "42883", "PGRST202"]) {
      expect(classifyPrefsError(code)).toBe("needs_migration");
    }
    expect(classifyPrefsError("XX000")).toBe("error");
  });
  it("languages classifier: same convention", () => {
    for (const code of ["42703", "42P01", "42883", "PGRST202"]) {
      expect(classifyLanguagesError(code)).toBe("needs_migration");
    }
    expect(classifyLanguagesError("42501")).toBe("unauthenticated");
    expect(classifyLanguagesError("P0002")).toBe("no_worker");
    expect(classifyLanguagesError(undefined)).toBe("error");
  });
  it("prefs read: two-step degradation — 42703 on the full select retries v1-only", () => {
    const readSvc = read("lib/worker/availability-prefs.ts");
    expect(readSvc).toContain("PREF_COLS_V2");
    expect(readSvc).toMatch(/kind: "not-enabled"/);
    // The v2 section state is derived from the read, never guessed client-side.
    expect(readSvc).toMatch(/UNDEFINED_COLUMN_CODE/);
  });
  it("languages read: 42P01 → needs-migration (no fake empty list)", () => {
    const readSvc = read("lib/worker/worker-languages.ts");
    expect(readSvc).toMatch(/42P01/);
    expect(readSvc).toMatch(/kind: "needs-migration"/);
  });
  it("the languages section renders an explanation state, not a crash or fake list", () => {
    const section = read("components/app/worker-languages-section.tsx");
    expect(section).toMatch(/needsMigration \?/);
    expect(section).toMatch(/worker-languages-needs-migration/);
    // Self-stated disclaimer is always rendered (never looks verified).
    expect(section).toMatch(/worker-languages-self-stated/);
  });
  it("the v2 fieldset renders its not-enabled explanation when gated", () => {
    const form = read("components/app/worker-availability-prefs-form.tsx");
    expect(form).toMatch(/prefs-v2-not-enabled/);
    expect(form).toMatch(/v2Enabled \?/);
    // Honest post-save notice when v2 fell back to v1.
    expect(form).toMatch(/prefs-v2-not-saved/);
    expect(form).toMatch(/v2Saved === false/);
  });
});

// ── (d) v1 save still works standalone (fallback path exists) ──────────────

describe("(d) v1 save path remains standalone; v2 falls back honestly", () => {
  const action = read("lib/worker/availability-prefs-actions.ts");
  it("the v1 RPC call is still present (exact name, not only _v2)", () => {
    expect(action).toMatch(/rpc\(\s*"save_worker_availability_prefs",/);
  });
  it("the v2 RPC is attempted only when the read path enabled it", () => {
    expect(action).toMatch(/rpc\(\s*"save_worker_availability_prefs_v2",/);
    expect(action).toContain('formData.get("prefs_v2_enabled")');
  });
  it("v2-absent (needs_migration) falls THROUGH to v1 and reports v2Saved: false", () => {
    expect(action).toMatch(/v2Saved: false/);
    expect(action).toMatch(/v2Code !== "needs_migration"/);
  });
  it("no direct table writes anywhere (RPC-only doctrine)", () => {
    expect(action).not.toMatch(/\.from\(["']workers["']\)[\s\S]*?\.update\(/);
    const langActions = read("lib/worker/worker-languages-actions.ts");
    expect(langActions).toMatch(/rpc\("save_worker_language_v1"/);
    expect(langActions).toMatch(/rpc\("remove_worker_language_v1"/);
    expect(langActions).not.toMatch(/\.from\(["']worker_languages["']\)/);
  });
  it("languages writes validate the closed sets BEFORE calling the RPC", () => {
    const langActions = read("lib/worker/worker-languages-actions.ts");
    expect(langActions).toContain("parseWorkerLanguage");
    expect(langActions).toContain("parseWorkerLanguageLevel");
    expect(langActions).toMatch(/code: "invalid"/);
  });
});

// ── mounted on the canonical profile surface + i18n presence ────────────────

describe("mounted on the profile page; i18n keys exist in all 11 locales", () => {
  it("the profile page mounts the languages section near the prefs form", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(/<WorkerLanguagesSection\b/);
    expect(page).toMatch(/v2Enabled=/);
    expect(page).toMatch(/getOwnWorkerLanguages/);
  });
  const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];
  it("workerPrefs.v2 + workerLanguages exist with non-empty values in all 11", () => {
    for (const loc of LOCALES) {
      const json = JSON.parse(read(`messages/${loc}.json`)) as {
        workerPrefs: { v2: Record<string, unknown> };
        workerLanguages: Record<string, unknown>;
      };
      expect(json.workerPrefs.v2, `${loc}: workerPrefs.v2`).toBeTruthy();
      expect(json.workerLanguages, `${loc}: workerLanguages`).toBeTruthy();
      for (const key of ["title", "notEnabled", "notSaved"]) {
        expect(
          String(json.workerPrefs.v2[key] ?? "").trim().length,
          `${loc}: workerPrefs.v2.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["title", "selfStated", "notEnabled", "add", "remove"]) {
        expect(
          String(json.workerLanguages[key] ?? "").trim().length,
          `${loc}: workerLanguages.${key}`,
        ).toBeGreaterThan(0);
      }
    }
  });
  it("primary locales (en, lt) carry REAL copy — no [EN] markers", () => {
    for (const loc of ["en", "lt"]) {
      const json = JSON.parse(read(`messages/${loc}.json`)) as {
        workerPrefs: { v2: unknown };
        workerLanguages: unknown;
      };
      const flat = JSON.stringify([json.workerPrefs.v2, json.workerLanguages]);
      expect(flat.includes("[EN]"), `${loc} must not carry [EN]`).toBe(false);
    }
  });
});
