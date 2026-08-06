import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for
 * `supabase/migrations/20260807120000_admin_grant_service_role_repair_v1.sql`
 * — the repair of the documented founder admin-grant path (2026-08-06
 * session: both founder scripts failed against production with
 * "permission denied for table profiles").
 *
 * Contract encoded here so future edits can't silently regress:
 *   - The migration grants ONLY to service_role — anon / authenticated /
 *     PUBLIC are never widened by this file.
 *   - Every grant is COLUMN-scoped (no whole-table grant sneaks in).
 *   - The write surface is exactly what the two founder scripts touch:
 *     profiles UPDATE (active_role) and profile_roles INSERT/UPDATE
 *     (profile_id, role). No DELETE anywhere.
 *   - It adds no function, no trigger, no policy, and never touches RLS —
 *     the protection layer stays 20260702130000's admin-grant-guard
 *     triggers, which this migration must not modify.
 *   - A paired rollback exists and revokes ONLY this migration's additions
 *     (the 20260702200000 column SELECTs are not its to undo).
 *   - The ledger records the migration as owner-gated, and the founder
 *     scripts keep the safety posture the grants were scoped against.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION =
  "supabase/migrations/20260807120000_admin_grant_service_role_repair_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260807120000_admin_grant_service_role_repair_v1.down.sql";

const migration = readFileSync(join(REPO_ROOT, MIGRATION), "utf-8");

// The header PROSE deliberately names the things this migration must NOT
// touch (the trigger guards, the rejected SECURITY DEFINER alternative).
// Structural assertions run against the executable SQL only.
const executable = migration
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("20260807120000 — founder admin-grant path repair", () => {
  it("grants exclusively to service_role", () => {
    const grantTargets = [...migration.matchAll(/^grant\b[^;]*?to\s+([a-z_,\s]+);/gim)].map(
      (m) => m[1].trim(),
    );
    expect(grantTargets.length).toBeGreaterThan(0);
    for (const target of grantTargets) {
      expect(target).toBe("service_role");
    }
  });

  it("never widens anon, authenticated, or PUBLIC", () => {
    expect(migration).not.toMatch(/^grant\b[^;]*\bto\s+[^;]*\banon\b/im);
    expect(migration).not.toMatch(/^grant\b[^;]*\bto\s+[^;]*\bauthenticated\b/im);
    expect(migration).not.toMatch(/^grant\b[^;]*\bto\s+[^;]*\bpublic\b/im);
  });

  it("keeps every grant column-scoped — no whole-table grant", () => {
    const grants = [...migration.matchAll(/^grant\b[^;]+;/gim)].map((m) => m[0]);
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      // Each privilege keyword must be followed by a parenthesised column
      // list before `on` — `grant select (id, ...) on ...`, never
      // `grant select on ...` / `grant all on ...`.
      expect(grant).toMatch(/^grant\s+(select|insert|update)\s*\(/i);
      expect(grant).not.toMatch(/\ball\b/i);
    }
  });

  it("grants exactly the founder-script write surface, and no DELETE", () => {
    expect(migration).toMatch(
      /grant update \(active_role\) on public\.profiles to service_role;/i,
    );
    expect(migration).toMatch(
      /grant select \(id, email, active_role\) on public\.profiles to service_role;/i,
    );
    expect(migration).toMatch(
      /grant insert \(profile_id, role\) on public\.profile_roles to service_role;/i,
    );
    expect(migration).toMatch(
      /grant update \(profile_id, role\) on public\.profile_roles to service_role;/i,
    );
    expect(executable).not.toMatch(/\bdelete\b/i);
  });

  it("adds no function, trigger, or policy, and never touches RLS", () => {
    expect(executable).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(executable).not.toMatch(/security\s+definer/i);
    expect(executable).not.toMatch(/create\s+trigger|drop\s+trigger/i);
    expect(executable).not.toMatch(/create\s+policy|alter\s+policy|drop\s+policy/i);
    expect(executable).not.toMatch(/row\s+level\s+security/i);
  });

  it("leaves the 20260702130000 admin-grant-guard triggers untouched", () => {
    expect(executable).not.toMatch(/enforce_admin_grant_guard/);
    expect(executable).not.toMatch(/trg_profiles_admin_grant_guard/);
    expect(executable).not.toMatch(/trg_profile_roles_admin_grant_guard/);
  });

  it("ships a paired rollback that revokes only this migration's additions", () => {
    expect(existsSync(join(REPO_ROOT, ROLLBACK))).toBe(true);
    const rollback = readFileSync(join(REPO_ROOT, ROLLBACK), "utf-8");
    expect(rollback).toMatch(
      /revoke update \(active_role\) on public\.profiles from service_role;/i,
    );
    expect(rollback).toMatch(
      /revoke select \(email\) on public\.profiles from service_role;/i,
    );
    expect(rollback).toMatch(
      /revoke insert \(profile_id, role\) on public\.profile_roles from service_role;/i,
    );
    expect(rollback).toMatch(
      /revoke update \(profile_id, role\) on public\.profile_roles from service_role;/i,
    );
    // The 20260702200000 read grants are NOT this rollback's to undo.
    expect(rollback).not.toMatch(/revoke select \(id, active_role\)/i);
    expect(rollback).not.toMatch(/revoke select \(profile_id, role\)/i);
    expect(rollback).not.toMatch(/pilot_events/i);
  });

  it("is recorded in the ledger as owner-gated (HUMAN GATE, not applied)", () => {
    const ledger = readFileSync(
      join(REPO_ROOT, "docs/APPLIED_LEDGER.md"),
      "utf-8",
    );
    expect(ledger).toMatch(
      /20260807120000_admin_grant_service_role_repair_v1[^\n]*HUMAN GATE/,
    );
  });

  it("the founder scripts keep the safety posture the grants assume", () => {
    // The grants make these scripts REACHABLE again; their own gates are the
    // operator-side protection and must not be quietly relaxed.
    const grantScript = readFileSync(
      join(REPO_ROOT, "apps/web/scripts/admin-grant-superadmin.ts"),
      "utf-8",
    );
    expect(grantScript).toContain("--i-understand-this-mutates-production");
    expect(grantScript).toMatch(/args\.apply && !args\.understand/);

    const promoteScript = readFileSync(
      join(REPO_ROOT, "apps/web/scripts/admin-promote.ts"),
      "utf-8",
    );
    expect(promoteScript).toMatch(/Refusing to promote in non-interactive mode/);
  });
});
