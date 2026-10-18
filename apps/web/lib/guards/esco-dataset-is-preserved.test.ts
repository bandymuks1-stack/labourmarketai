import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE ESCO MULTILINGUAL DATASET IS NOT PRUNED.
 *
 * Owner directive, given 2026-08-13 (V10 §21-22) and restated 2026-09-07: do
 * NOT delete ESCO languages. "Currently unused" is not "unneeded" - the
 * platform direction is broader multilingual Europe, and the dataset must also
 * serve workers originating OUTSIDE the EU, whose languages are exactly the
 * ones a "keep only the shipped locales" rule would delete. The canonical plan
 * is docs/operations/esco-storage-optimization-plan.md v2; every action in it
 * preserves all 28 languages.
 *
 * WHY THIS IS A GUARD AND NOT ONLY A DOCUMENT. The directive has now been
 * re-derived and re-proposed twice by agents reading storage numbers, most
 * recently on 2026-09-07 - three weeks AFTER it was recorded. Prose in a plan
 * did not stop it. The reasoning is seductive in exactly one way: the unshipped
 * locales look like dead weight in every measurement, and nothing in the
 * database says they are a deliberate asset. This test says it, in the place a
 * change would have to pass.
 *
 * It bans a DELETE against esco_labels reaching main. It does NOT ban
 * optimisation: index reshaping, dropping the surrogate pkey, and the cold/hot
 * split (which MOVES rows and keeps every language) are all untouched by it,
 * because none of them deletes a label.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

describe("the ESCO multilingual dataset is preserved", () => {
  it("no migration on main deletes from esco_labels", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8")
        .replace(/\r\n/g, "\n")
        // Comments may legitimately DISCUSS the withdrawn prune; only executable
        // SQL is judged, so strip line comments before matching.
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .join("\n");
      if (/\sdelete\s+from\s+(public\.)?esco_labels\s?/i.test(sql)) {
        offenders.push(file);
      }
      if (/\struncate\s+(table\s+)?(public\.)?esco_labels\s?/i.test(sql)) {
        offenders.push(file + " (truncate)");
      }
    }
    expect(
      offenders,
      "ESCO labels may be re-indexed, re-keyed or moved to a cold table, but never deleted - owner directive 2026-08-13, restated 2026-09-07. See docs/operations/esco-storage-optimization-plan.md v2.",
    ).toEqual([]);
  });

  it("the canonical plan still records the directive", () => {
    const plan = readFileSync(
      join(ROOT, "docs", "operations", "esco-storage-optimization-plan.md"),
      "utf8",
    );
    expect(plan).toMatch(/DO NOT delete ESCO languages/i);
    expect(plan).toMatch(/28/);
  });
});
