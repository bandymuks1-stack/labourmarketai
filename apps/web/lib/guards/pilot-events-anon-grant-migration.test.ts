import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for
 * `supabase/migrations/20260702150000_pilot_events_anon_insert_grant.sql`
 * (finding F-T1: `login_started` fires pre-auth but anon had no INSERT
 * privilege on pilot_events, so top-of-funnel silently vanished).
 *
 * Contract:
 *   - INSERT-only grant to anon; never SELECT/UPDATE/DELETE.
 *   - No policy change — RLS (0020) already constrains anon rows to
 *     profile_id IS NULL and keeps SELECT admin-only.
 *   - Human-gated + rollback file (grants are a RED class by design).
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION =
  "supabase/migrations/20260702150000_pilot_events_anon_insert_grant.sql";

const migration = readFileSync(join(REPO_ROOT, MIGRATION), "utf-8");
const code = migration
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("20260702150000 — pilot_events anon INSERT grant", () => {
  it("grants INSERT and only INSERT to anon", () => {
    expect(code).toMatch(/grant insert on public\.pilot_events to anon/i);
    expect(code).not.toMatch(/grant[^;]*select[^;]*to anon/i);
    expect(code).not.toMatch(/update|delete/i);
  });

  it("changes no policy and touches no other object", () => {
    expect(code).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(code).not.toMatch(/create table|alter table/i);
    const statements = code
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(1);
  });

  it("is human-gated and ships a rollback file", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "supabase/rollbacks/20260702150000_pilot_events_anon_insert_grant.down.sql",
        ),
      ),
    ).toBe(true);
  });

  it("0020's own grant surface stays untouched (its guard keeps holding)", () => {
    const base = readFileSync(
      join(REPO_ROOT, "supabase/migrations/0020_pilot_events.sql"),
      "utf-8",
    );
    expect(base).not.toMatch(/grant[^;]*to\s+anon/i);
  });
});
