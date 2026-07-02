import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for `supabase/migrations/20260702130000_admin_grant_guard.sql`
 * (finding F-S1, full-project audit 2026-07-02).
 *
 * Contract encoded here so future edits can't silently regress:
 *   - BEFORE triggers exist on BOTH self-writable admin signals:
 *     profiles.active_role and profile_roles.role.
 *   - The guard blocks callers that carry a user JWT (auth.uid() is not
 *     null) and are not already admin; the owner service-role script and
 *     migration contexts (auth.uid() null) stay allowed.
 *   - The function is NOT security definer (invoker rights; is_admin()
 *     carries its own definer context).
 *   - A rollback file exists, since every added migration must ship one.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION = "supabase/migrations/20260702130000_admin_grant_guard.sql";

const migration = readFileSync(join(REPO_ROOT, MIGRATION), "utf-8");

describe("20260702130000 — admin self-promotion guard", () => {
  it("guards profiles.active_role with a BEFORE trigger", () => {
    expect(migration).toMatch(
      /create trigger trg_profiles_admin_grant_guard\s+before insert or update of active_role on public\.profiles/i,
    );
  });

  it("guards profile_roles.role with a BEFORE trigger", () => {
    expect(migration).toMatch(
      /create trigger trg_profile_roles_admin_grant_guard\s+before insert or update of role on public\.profile_roles/i,
    );
  });

  it("blocks JWT-bearing non-admin callers and only them", () => {
    expect(migration).toMatch(/auth\.uid\(\) is not null/i);
    expect(migration).toMatch(/not public\.is_admin\(\)/i);
    expect(migration).toMatch(/raise exception/i);
  });

  it("checks the admin value on both tables", () => {
    expect(migration).toMatch(/new\.active_role = 'admin'/i);
    expect(migration).toMatch(/new\.role = 'admin'/i);
  });

  it("is not SECURITY DEFINER (trigger runs with invoker rights)", () => {
    expect(migration).not.toMatch(/security\s+definer/i);
  });

  it("carries the human-gate annotation (trigger migrations are RED class)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });

  it("ships a rollback file", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "supabase/rollbacks/20260702130000_admin_grant_guard.down.sql",
        ),
      ),
    ).toBe(true);
  });
});
