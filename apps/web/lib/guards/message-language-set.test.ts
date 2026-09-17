import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { locales } from "@/lib/i18n/config";

/**
 * LANGUAGE-SET DRIFT GUARD — the product's declared locales, the language a
 * message can be AUTHORED in, and the language the database will PRESERVE must
 * be one set, not three that quietly diverge.
 *
 * The owner contract (2026-09-17) is language-agnostic: any supported author
 * locale → original preserved → any authorized recipient renders it in their
 * own locale. The single most dangerous drift is the silent kind:
 *
 *   · the UI offers a locale, but `sendMessage` stamps NULL for it, so the
 *     original language is lost; or
 *   · the send path accepts a locale the `original_language` CHECK rejects, so
 *     the INSERT fails (or degrades) and the message loses its language.
 *
 * This guard pins all of it to ONE source — `lib/i18n/config.ts` `locales`:
 *   1. the send path DERIVES its accepted set from `locales` (no second list);
 *   2. the live `original_language` CHECK on EVERY table that carries one
 *      (conversation_messages, journal_entries, organization_evidence_records,
 *      candidate_skills) admits EXACTLY `locales` — no more, no less.
 *
 * When the owner widens the canonical set (e.g. the RED migration that adds
 * `ka`/`uk`), `locales` and the CHECK move together or this guard fails —
 * which is the point.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");

const CANON = [...locales].sort();

/** Every table whose original_language the product must preserve coherently. */
const TABLES = [
  "conversation_messages",
  "journal_entries",
  "organization_evidence_records",
  "candidate_skills",
] as const;

/**
 * The EFFECTIVE `original_language` CHECK list for a table.
 *
 * CHECK widening is monotonic — every migration that touches a table's
 * original_language CHECK is a superset of the previous one (narrowing would
 * reject existing rows and never happens). So the effective set is the LONGEST
 * list attributed to the table. Attribution is at the SQL-statement level (each
 * statement is delimited by ';'): a statement owns a list only when that same
 * statement names the table — via its `<table>_original_language` constraint or
 * an `alter/create table <table>`. That is robust to migrations that touch
 * several tables in one file, in any order.
 */
function effectiveCheckLanguages(table: string): string[] | null {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let best: string[] | null = null;
  const owns = new RegExp(
    `${table}_original_language|(?:alter|create)\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\b`,
    "i",
  );
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    if (!sql.includes(table)) continue;
    for (const stmt of sql.split(";")) {
      if (!/original_language\s+in\s*\(/i.test(stmt)) continue;
      if (!owns.test(stmt)) continue;
      const listMatch = /original_language\s+in\s*\(([^)]*)\)/i.exec(stmt);
      if (!listMatch) continue;
      const langs = [...listMatch[1].matchAll(/'([a-z]{2})'/g)].map((x) => x[1]).sort();
      if (best === null || langs.length > best.length) best = langs;
    }
  }
  return best;
}

describe("message language set — one source, no drift", () => {
  it("the send path derives its accepted set from the canonical `locales` (no second hardcoded list)", () => {
    const code = readFileSync(join(APP, "lib/communication/actions.ts"), "utf8");
    expect(code).toMatch(/import\s*\{\s*locales\s*\}\s*from\s*"@\/lib\/i18n\/config"/);
    expect(code).toMatch(/\(locales as readonly string\[\]\)\.includes\(input\.locale\)/);
    // The old private hardcoded array must be gone — that was the drift risk.
    expect(code).not.toMatch(/KNOWN_LOCALES\s*=\s*\[/);
  });

  it("`locales` is non-trivial and includes the active product languages", () => {
    expect(CANON.length).toBeGreaterThanOrEqual(11);
    for (const l of ["lt", "en", "ru", "nl", "de"]) expect(CANON).toContain(l);
  });

  for (const table of TABLES) {
    it(`the live original_language CHECK on ${table} admits EXACTLY the canonical locales`, () => {
      const found = effectiveCheckLanguages(table);
      expect(found, `no original_language CHECK migration found for ${table}`).not.toBeNull();
      // Set equality both ways — a missing locale loses that language on write;
      // an extra one accepts a language the product does not declare.
      expect(found, `${table} CHECK vs locales`).toEqual(CANON);
    });
  }
});
