import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for
 * `supabase/migrations/20260702200000_pilot_events_service_role_report_read.sql`
 * (local owner-side activation-report read fix).
 *
 * Contract:
 *   - service_role gains SELECT on pilot_events (owner tooling), and
 *     COLUMN-SCOPED select on profiles(id, active_role) /
 *     profile_roles(profile_id, role) — never names/emails.
 *   - anon gains nothing (stays INSERT-only from 20260702150000).
 *   - authenticated grants unchanged; the 0020 is_admin() SELECT policy
 *     stays the only read path for JWT users.
 *   - No RLS disable, no policy change, no write grants.
 *   - The report script requires the service key (no anon-key fallback)
 *     and FAILS CLOSED when the admin-exclusion reads error.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION =
  "supabase/migrations/20260702200000_pilot_events_service_role_report_read.sql";

const migration = readFileSync(join(REPO_ROOT, MIGRATION), "utf-8");
const code = migration
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("20260702200000 — service-role report read", () => {
  it("grants SELECT on pilot_events to service_role only", () => {
    expect(code).toMatch(/grant select on public\.pilot_events to service_role/i);
    expect(code).not.toMatch(/grant[^;]*pilot_events[^;]*to\s+(anon|authenticated|public)\b/i);
  });

  it("profiles/profile_roles grants are column-scoped (no PII columns)", () => {
    expect(code).toMatch(
      /grant select \(id, active_role\) on public\.profiles to service_role/i,
    );
    expect(code).toMatch(
      /grant select \(profile_id, role\) on public\.profile_roles to service_role/i,
    );
    expect(code).not.toMatch(/full_name|email|profile_text/i);
    // Never a whole-table grant on profiles/profile_roles.
    expect(code).not.toMatch(/grant select on public\.profiles\b/i);
    expect(code).not.toMatch(/grant select on public\.profile_roles\b/i);
  });

  it("changes no policy, disables no RLS, grants no writes", () => {
    expect(code).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(code).not.toMatch(/disable row level security/i);
    expect(code).not.toMatch(/grant[^;]*(insert|update|delete)/i);
  });

  it("anon INSERT-only contract from 20260702150000 stays intact", () => {
    const anonGrant = readFileSync(
      join(
        REPO_ROOT,
        "supabase/migrations/20260702150000_pilot_events_anon_insert_grant.sql",
      ),
      "utf-8",
    );
    expect(anonGrant).toMatch(/grant insert on public\.pilot_events to anon/i);
    // This migration must not touch anon at all.
    expect(code).not.toMatch(/\banon\b/i);
  });

  it("is human-gated and ships a rollback", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "supabase/rollbacks/20260702200000_pilot_events_service_role_report_read.down.sql",
        ),
      ),
    ).toBe(true);
  });
});

describe("report script key handling", () => {
  const script = readFileSync(
    join(process.cwd(), "scripts/generate-activation-report.ts"),
    "utf-8",
  );

  it("requires the service key and never falls back to the anon key", () => {
    expect(script).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(script).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(script).toMatch(/process\.exit\(1\)/);
  });

  it("fails closed when the admin-exclusion reads error", () => {
    expect(script).toMatch(/refusing to emit a report without exclusions/);
  });
});
