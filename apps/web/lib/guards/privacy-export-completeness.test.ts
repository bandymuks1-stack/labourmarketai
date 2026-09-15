import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORTED_RELATIONS,
  NON_PRODUCT_RELATIONS,
  ROOT_RELATIONS,
  WITHHELD_RELATIONS,
} from "@/lib/privacy/personal-relations";

/**
 * PER-12 — A SUBJECT-ACCESS BUNDLE MAY NOT LIE BY OMISSION.
 *
 * THE DEFECT, MEASURED (production, 2026-09-14). 60 public tables carry a
 * `profile_id` or a `worker_id`. The export read SIX and named four things as
 * deliberately excluded — so roughly thirty relations were neither delivered
 * nor mentioned, while the bundle's shape invited the reader to conclude that
 * anything unmentioned was included.
 *
 * WHAT THIS GUARD DOES. It derives the set of person-keyed tables from the
 * MIGRATIONS — the checked-in schema, not a remembered list — and requires
 * each one to be exported, withheld with a reason, a root relation, or
 * declared not-a-product-relation. A new table with a `profile_id` fails this
 * guard the day its migration lands, which is the only moment the decision is
 * cheap to make.
 *
 * WHAT IT DOES NOT CLAIM. It does not prove the reads succeed against a real
 * database — CI deliberately has none (GOV-3). `lib/privacy/export-data.test.ts`
 * drives the exporter itself for the failed-read-is-not-absence property.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");

/**
 * Person-keyed tables, read out of the create-table statements. A table is
 * counted when its CREATE TABLE body declares a `profile_id`, `worker_id` or
 * `subject_profile_id` column — the production sweep's test, widened on
 * 2026-09-15 for the relation where the person is the SUBJECT of another
 * party's act (`competency_recognitions`): a person-keyed table whose column
 * is spelt differently is still about a person.
 */
function personKeyedTablesFromMigrations(): Set<string> {
  const found = new Set<string>();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    // `create table [if not exists] public.<name> ( … );` — non-greedy to the
    // first `\n);` so one statement never swallows the next.
    const re =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const [, table, body] = m;
      if (/\b(profile_id|worker_id|subject_profile_id)\b/.test(body)) found.add(table);
    }
  }
  return found;
}

const CLASSIFIED = new Set<string>([
  ...EXPORTED_RELATIONS.map((r) => r.table),
  ...WITHHELD_RELATIONS.map((r) => r.table),
  ...NON_PRODUCT_RELATIONS,
  ...ROOT_RELATIONS,
]);

describe("every person-keyed relation is classified", () => {
  const discovered = personKeyedTablesFromMigrations();

  it("the migration sweep finds the schema at all", () => {
    // A broken regex would make every assertion below vacuously pass.
    expect(discovered.size).toBeGreaterThan(30);
    for (const anchor of ["journal_entries", "worker_skills", "consents"]) {
      expect(discovered, `sweep missed ${anchor}`).toContain(anchor);
    }
  });

  it("no person-keyed table is silently absent from the export register", () => {
    const unclassified = [...discovered].filter((t) => !CLASSIFIED.has(t)).sort();
    expect(
      unclassified,
      "these tables hold rows keyed to a person and are neither exported, nor " +
        "withheld with a reason, nor declared non-product. A subject-access " +
        "bundle that omits them without saying so tells the person something " +
        "false about itself — classify each in lib/privacy/personal-relations.ts",
    ).toEqual([]);
  });

  it("the register names no table that the schema does not have", () => {
    // Guards rot the other way too: a withheld entry for a table that no
    // longer exists is a reason nobody will ever act on.
    // ROOT_RELATIONS are exempt: `profiles` is keyed by `id`, not by
    // `profile_id`, so the person-column sweep cannot see it by construction.
    const roots = new Set(ROOT_RELATIONS);
    const ghosts = [...CLASSIFIED]
      .filter((t) => !discovered.has(t) && !roots.has(t))
      .sort();
    expect(
      ghosts,
      "classified but not present as a person-keyed table in any migration",
    ).toEqual([]);
  });
});

describe("withholding is always explained", () => {
  it("every withheld relation carries a real reason", () => {
    for (const w of WITHHELD_RELATIONS) {
      expect(w.reason.length, `${w.table} needs a real reason`).toBeGreaterThan(30);
      // The reason travels to the person, so it must read as an explanation,
      // not as a category label.
      expect(w.reason, `${w.table}'s reason is not a sentence`).toMatch(/\s/);
    }
  });

  it("nothing is both exported and withheld", () => {
    const exported = new Set(EXPORTED_RELATIONS.map((r) => r.table));
    const both = WITHHELD_RELATIONS.map((w) => w.table).filter((t) => exported.has(t));
    expect(both, "a relation cannot be both delivered and withheld").toEqual([]);
  });

  it("the reasons reach the bundle, not just this file", () => {
    const src = readFileSync(
      join(__dirname, "..", "privacy", "export-data.ts"),
      "utf8",
    );
    expect(src).toMatch(/withheld:/);
    expect(src).toMatch(/WITHHELD_RELATIONS/);
    expect(src).toMatch(/reason: w\.reason/);
  });
});

describe("the export grew, and can be seen to have grown", () => {
  it("covers far more than the six relations it started with", () => {
    expect(EXPORTED_RELATIONS.length).toBeGreaterThan(20);
  });

  it("still reads as the person — no service role anywhere in the path", () => {
    for (const rel of ["privacy/export-data.ts", "privacy/personal-relations.ts"]) {
      const src = readFileSync(join(__dirname, "..", rel), "utf8");
      expect(src, `${rel} must not reach for a service-role client`).not.toMatch(
        /service_role|SERVICE_ROLE|createAdminClient|serviceClient/,
      );
    }
  });

  it("every exported relation declares which person column joins it", () => {
    for (const r of EXPORTED_RELATIONS) {
      expect(["profile_id", "worker_id", "subject_profile_id"]).toContain(r.key);
    }
  });
});
