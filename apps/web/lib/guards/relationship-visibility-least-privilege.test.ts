import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD — relationship visibility least privilege (2026-09-01).
 *
 * `relationship_types.grants_worker_visibility` decides whether holding an
 * ACTIVE relationship lets an organization read the person worker record
 * through `public.can_view_worker` — salary expectations, relocation
 * willingness and shift tolerances included.
 *
 * 20260827210000 introduced the column fail-closed and ruled `student` out,
 * but PRESERVED `volunteer`/`viewer`/`unemployed` and recorded the ruling on
 * them as a deferred slice. 20260901060000 is that slice.
 *
 * Pinned here so the ruling cannot be silently reversed by a later edit:
 *   1. both the migration and its rollback exist;
 *   2. the migration narrows exactly the three deferred slugs, and narrows
 *      them to false — never to true;
 *   3. it does not touch any employment-shaped slug;
 *   4. it stays DATA-only: no function/policy/grant statement smuggled in;
 *   5. the rollback restores the three to true (a real, reversible path).
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260901060000_relationship_visibility_least_privilege_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260901060000_relationship_visibility_least_privilege_v1.down.sql",
);

const DEFERRED_SLUGS = ["volunteer", "viewer", "unemployed"] as const;
const EMPLOYMENT_SLUGS = [
  "employee",
  "owner",
  "manager",
  "collaborator",
  "consultant",
  "freelancer",
] as const;

describe("relationship visibility — least privilege ruling", () => {
  it("ships both the migration and its rollback", () => {
    expect(existsSync(MIGRATION), MIGRATION).toBe(true);
    expect(existsSync(ROLLBACK), ROLLBACK).toBe(true);
  });

  it("narrows exactly the three deferred slugs, to false", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const statement = sql.match(
      /update public\.relationship_types\s+set grants_worker_visibility = false\s+where slug in \(([^)]*)\)/i,
    );
    expect(statement, "expected one narrowing UPDATE").not.toBeNull();
    for (const slug of DEFERRED_SLUGS) {
      expect(statement?.[1]).toContain(`'${slug}'`);
    }
  });

  it("never sets grants_worker_visibility true in the forward direction", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    // Strip comments — the header and the inlined DOWN block legitimately
    // discuss the `true` value that only the rollback performs.
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/set grants_worker_visibility = true/i);
  });

  it("leaves every employment-shaped slug untouched", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const updates = executable.match(/update public\.relationship_types[\s\S]*?;/gi) ?? [];
    for (const slug of EMPLOYMENT_SLUGS) {
      for (const update of updates) {
        expect(update, `${slug} must not appear in a visibility UPDATE`).not.toContain(
          `'${slug}'`,
        );
      }
    }
  });

  it("stays DATA-only — no function, policy or grant statement", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/create\s+(or replace\s+)?function/i);
    expect(executable).not.toMatch(/(create|drop|alter)\s+policy/i);
    expect(executable).not.toMatch(/^\s*(grant|revoke)\s/im);
    expect(executable).not.toMatch(/drop\s+(table|column)/i);
  });

  it("carries the owner gate markers", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("needs-human-gate");
    expect(sql).toContain("@human-gate-approved");
    expect(sql).toContain("OWNER_APPROVAL_REQUIRED_BEFORE_APPLY");
  });

  it("rollback restores the three slugs to true", () => {
    const down = readFileSync(ROLLBACK, "utf8");
    const statement = down.match(
      /update public\.relationship_types\s+set grants_worker_visibility = true\s+where slug in \(([^)]*)\)/i,
    );
    expect(statement, "expected one restoring UPDATE").not.toBeNull();
    for (const slug of DEFERRED_SLUGS) {
      expect(statement?.[1]).toContain(`'${slug}'`);
    }
  });
});
