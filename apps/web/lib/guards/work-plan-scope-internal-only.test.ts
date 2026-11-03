import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: work_plan_worker_in_scope_v1 is an INTERNAL predicate.
 *
 * It answered "is worker X engaged in organization Y" for any organization to
 * any signed-in caller. Only the SECURITY DEFINER create_work_plan_entry_v1/v2
 * call it, so client EXECUTE is revoked; the body stays untouched and the
 * rollback restores the authenticated grant exactly.
 */
const repo = resolve(__dirname, "..", "..", "..", "..");
const NAME = "20261103120000_work_plan_worker_in_scope_internal_only_v1";
const exec = (rel: string) =>
  readFileSync(resolve(repo, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const up = exec(`supabase/migrations/${NAME}.sql`);
const down = exec(`supabase/rollbacks/${NAME}.down.sql`);
const SIG = String.raw`public\.work_plan_worker_in_scope_v1\(uuid, uuid\)`;

describe("Guard: work-plan scope predicate is internal only", () => {
  it("revokes EXECUTE from public, anon and authenticated", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(up).toMatch(new RegExp(`revoke all on function ${SIG} from ${role};`));
    }
  });

  it("grants nothing and leaves the body alone", () => {
    expect(up).not.toMatch(/\bgrant\b/i);
    expect(up).not.toMatch(/create or replace function/i);
  });

  it("rollback restores the authenticated grant", () => {
    expect(down).toMatch(new RegExp(`grant execute on function ${SIG} to authenticated;`));
  });
});
