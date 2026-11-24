import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NULL-SAFE OWNER GUARDS — the six SECURITY DEFINER functions that authorize
 * on `organizations.owner_profile_id` must compare it NULL-safely.
 *
 * The bug (owner MASTER ORDER §4, security agent 2026-08-24): each function
 * used `if not (public.is_admin() or v_owner = uid or ...) then <deny>`. Since
 * `owner_profile_id` is nullable (FK ON DELETE SET NULL) a NULL owner makes
 * the whole predicate NULL, plpgsql treats `IF NULL` as false, and the deny
 * branch is skipped — any authenticated user then passes. The fix wraps the
 * NULL source: `(v_owner is not null and v_owner = uid)`.
 *
 * This is a STATIC guard (CI has no database): it pins that the fix migration
 * uses the NULL-safe form for every function and never reintroduces the bare
 * comparison, and that a paired rollback exists. The behavioural BEFORE/AFTER
 * proof was run read-only against production and recorded on the PR.
 */

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
const ROLLBACKS = join(__dirname, "..", "..", "..", "..", "supabase", "rollbacks");
const MIG = "20260824130000_null_safe_owner_guards_v2.sql";

const sql = readFileSync(join(MIGRATIONS, MIG), "utf8");

/** The six functions the fix hardens, with the local variable each reads the
 *  (nullable) organization owner into. */
const GUARDED: ReadonlyArray<{ fn: string; owner: string }> = [
  { fn: "grant_org_manager", owner: "v_owner" },
  { fn: "add_org_member", owner: "v_owner" },
  { fn: "create_invitation_v1", owner: "v_org_owner" },
  { fn: "respond_team_enquiry_v1", owner: "v_team_owner" },
  { fn: "save_team_details_v1", owner: "v_owner" },
  { fn: "get_team_capability_summary_v1", owner: "v_owner" },
];

describe("null-safe owner guards migration", () => {
  it("replaces all six functions", () => {
    for (const { fn } of GUARDED) {
      expect(
        sql,
        `${fn} must be replaced`,
      ).toMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`),
      );
    }
  });

  it("each owner comparison is NULL-safe and the bare form is gone", () => {
    for (const { owner } of new Map(GUARDED.map((g) => [g.owner, g])).values()) {
      // The NULL-safe form is present…
      expect(
        sql,
        `${owner} must be guarded is-not-null`,
      ).toContain(`${owner} is not null and ${owner} = uid`);
    }
    // …and no bare `<owner> = uid` survives in EXECUTABLE lines (the header
    // comment quotes the bug on purpose, so scan only non-comment lines).
    const codeLines = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"));
    for (const line of codeLines) {
      for (const m of line.match(/v_(owner|org_owner|team_owner) = uid/g) ?? []) {
        const idx = line.indexOf(m);
        expect(
          line.slice(Math.max(0, idx - 20), idx),
          `bare "${m}" not preceded by the null-safe guard: ${line.trim()}`,
        ).toMatch(/is not null and $/);
      }
    }
  });

  it("is annotated RED and ships a paired rollback", () => {
    expect(sql).toMatch(/^--[ \t]*@human-gate-approved/m);
    expect(sql).toMatch(/SECURITY DEFINER/);
    // No table/policy/DML — a pure function replace.
    expect(sql).not.toMatch(/\b(create|alter|drop)\s+table\b/i);
    expect(sql).not.toMatch(/\b(create|drop|alter)\s+policy\b/i);
    const down = readFileSync(join(ROLLBACKS, MIG.replace(".sql", ".down.sql")), "utf8");
    // The rollback restores the pre-fix bare form (reversibility), and carries
    // no approval marker — undoing needs no approval.
    expect(down).toContain("v_owner = uid");
    expect(down).not.toMatch(/^--[ \t]*@human-gate-approved/m);
  });
});
