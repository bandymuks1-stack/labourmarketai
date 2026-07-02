import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for
 * `supabase/migrations/20260702140000_worker_personal_engagement.sql`
 * (finding F-W1, full-project audit 2026-07-02: new workers get no
 * engagement context, so the journal — the core loop's front door — is
 * closed to every post-0013 signup).
 *
 * Contract:
 *   - AFTER INSERT trigger on public.workers provisions a personal
 *     'employee' engagement, idempotently.
 *   - Primary flag is granted only when the profile has no other primary
 *     engagement (no double-primary).
 *   - A one-time idempotent backfill covers existing workers.
 *   - hash_self mirrors the 0013 backfill recipe exactly.
 *   - RLS/policies untouched; rollback file exists.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION =
  "supabase/migrations/20260702140000_worker_personal_engagement.sql";

const migration = readFileSync(join(REPO_ROOT, MIGRATION), "utf-8");

describe("20260702140000 — worker personal engagement provisioning", () => {
  it("installs an AFTER INSERT trigger on workers", () => {
    expect(migration).toMatch(
      /create trigger on_worker_personal_engagement\s+after insert on public\.workers/i,
    );
  });

  it("is idempotent on relationship (no duplicate employee engagement)", () => {
    const guards = migration.match(
      /where ec\.profile_id = (new\.profile_id|w\.profile_id) and ec\.relationship_slug = 'employee'/gi,
    );
    expect(guards?.length ?? 0).toBeGreaterThanOrEqual(2); // trigger + backfill
  });

  it("never creates a second primary engagement", () => {
    const primaryChecks = migration.match(/and ec\.is_primary/gi);
    expect(primaryChecks?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("mirrors the 0013 hash recipe", () => {
    expect(migration).toMatch(/':employee:primary'/);
    expect(migration).toMatch(/extensions\.digest/);
  });

  it("touches no policy/grant and drops nothing but its own trigger", () => {
    const code = migration
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(code).not.toMatch(/create\s+policy|alter\s+policy|drop\s+policy/i);
    expect(code).not.toMatch(/\bgrant\b|\brevoke\b/i);
    expect(code).not.toMatch(/delete\s+from/i);
    expect(code).not.toMatch(/drop\s+table|drop\s+column/i);
  });

  it("carries the human-gate annotation and ships a rollback file", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "supabase/rollbacks/20260702140000_worker_personal_engagement.down.sql",
        ),
      ),
    ).toBe(true);
  });
});
