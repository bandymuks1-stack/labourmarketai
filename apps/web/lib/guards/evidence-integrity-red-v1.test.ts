import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE TWO EVIDENCE-INTEGRITY MIGRATIONS, PINNED WHILE THEY ARE UNAPPLIED.
 *
 * Both were written on 2026-09-08 after the owner approved the IMPLEMENTATION
 * of EVID-6 and EVID-2 and explicitly stopped short of the apply. Neither has
 * been applied or trial-applied to production. This guard exists so the files
 * cannot drift, soften, or acquire a widening branch while they sit waiting for
 * a decision — the window in which a RED migration is least watched.
 *
 * It asserts SHAPE, not behaviour. Behaviour needs an apply, and saying
 * otherwise would be the false-evidence claim the product register exists to
 * catch.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const ROLLBACKS = join(ROOT, "supabase", "rollbacks");

const EVID6 = "20260908120000_experience_response_moderation_scope_v1";
const EVID2 = "20260908130000_journal_confirmation_self_marker_v1";

const read = (dir: string, base: string, ext: string) =>
  readFileSync(join(dir, `${base}${ext}`), "utf8");

/**
 * The EXECUTABLE SQL only: `--` comment lines and `comment on … ;` statements
 * removed.
 *
 * Written after the first version of this guard failed on its own
 * documentation — it read the word "grant" out of the sentence "no grant is
 * altered" and `moderation_status` out of a `comment on policy` string, and
 * called both defects. A guard that trips on prose teaches the next author to
 * stop explaining themselves, which is the opposite of what this repository
 * wants from a RED migration.
 */
function sqlOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .replace(/comment\s+on\s+[\s\S]*?;\s*$/gim, "");
}

describe("EVID-6 — a reply's visibility is decided by the REPLY's own status", () => {
  const sql = read(MIGRATIONS, EVID6, ".sql");

  it("ships with a paired rollback", () => {
    expect(existsSync(join(ROLLBACKS, `${EVID6}.down.sql`))).toBe(true);
  });

  it("tests the RESPONSE's own moderation_status, which is the whole defect", () => {
    expect(sql).toMatch(
      /public\.experience_responses\.moderation_status\s*=\s*'published'/,
    );
  });

  it("still requires the RECORD to be published — the branch is narrowed, not swapped", () => {
    expect(sql).toMatch(/r\.moderation_status\s*=\s*'published'/);
    expect(sql).toMatch(/r\.author_profile_id\s*=\s*auth\.uid\(\)/);
  });

  it("leaves the subject's own reply readable in EVERY state", () => {
    // If this branch ever gains a moderation condition, a person loses sight
    // of their own reply while it is being moderated — the state they most
    // need to see.
    expect(sql).toMatch(
      /public\.experience_responses\.author_profile_id\s*=\s*auth\.uid\(\)/,
    );
  });

  it("never qualifies moderation_status implicitly again", () => {
    // The defect was an UNQUALIFIED `moderation_status` inside a subquery
    // resolving to the record. Every occurrence must carry a table qualifier.
    const occurrences = sqlOnly(sql)
      .split("\n")
      .filter((l) => l.includes("moderation_status"));
    expect(occurrences.length).toBeGreaterThan(0);
    for (const line of occurrences) {
      expect(
        /(?:r|public\.experience_responses)\.moderation_status/.test(line),
        `unqualified moderation_status: ${line.trim()}`,
      ).toBe(true);
    }
  });

  it("widens nothing", () => {
    const code = sqlOnly(sql);
    expect(code).not.toMatch(/to\s+anon/i);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(code).not.toMatch(/\bgrant\b/i);
  });
});

describe("EVID-2 — a self-confirmation is recorded, not forbidden", () => {
  const sql = read(MIGRATIONS, EVID2, ".sql");

  it("ships with a paired rollback", () => {
    expect(existsSync(join(ROLLBACKS, `${EVID2}.down.sql`))).toBe(true);
  });

  it("adds the column WITHOUT a default — NULL means not recorded", () => {
    // A `default false` would silently reclassify the three existing
    // self-confirmed rows as "not self", which is the one thing the owner
    // forbade. SEP-7: UNKNOWN is not FALSE.
    const code = sqlOnly(sql);
    expect(code).toMatch(/add column if not exists self_confirmed boolean\s*;/);
    expect(code).not.toMatch(/self_confirmed\s+boolean[^;]*default/i);
  });

  it("backfills nothing — existing evidence is untouched", () => {
    const code = sqlOnly(sql);
    expect(code).not.toMatch(/\bupdate\s+public\.journal_entry_confirmations/i);
    expect(code).not.toMatch(/\bdelete\s+from/i);
  });

  it("derives the flag from IDENTITY, never from confirmer_role", () => {
    // Every production row carries role='owner', including all three
    // self-confirmed ones, so a role-based rule would pass them through.
    const code = sqlOnly(sql);
    expect(code).toMatch(/w\.profile_id\s*=\s*new\.confirmer_id/);
    expect(code).not.toMatch(/new\.confirmer_role\s*=/);
  });

  it("does not forbid the act — an owner-operator may confirm their own work", () => {
    // The three production rows are owner-operators. Refusing the insert would
    // break a legitimate user and erase a true fact about work that happened.
    expect(sqlOnly(sql)).not.toMatch(/raise\s+exception/i);
  });

  it("keeps the table append-only — no UPDATE or DELETE policy is added", () => {
    const code = sqlOnly(sql);
    expect(code).not.toMatch(/create\s+policy/i);
    expect(code).not.toMatch(/\bgrant\b/i);
  });
});

describe("both files state plainly that they are unapplied", () => {
  for (const base of [EVID6, EVID2]) {
    it(`${base} carries the marker as an acknowledgement, not an approval`, () => {
      const sql = read(MIGRATIONS, base, ".sql");
      expect(sql).toMatch(/@human-gate-approved/);
      // The doctrine line that must never be quietly dropped: the marker
      // acknowledges risk, it does not authorise an apply.
      expect(sql).toMatch(/approval to apply/i);
      expect(sql).toMatch(/UNAPPLIED/);
    });

    it(`${base}'s rollback carries no marker — undoing needs no approval`, () => {
      const down = read(ROLLBACKS, base, ".down.sql");
      expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    });
  }
});
