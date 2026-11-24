import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 marketplace service_offering_requests — migration safety + RLS guard.
 *
 * RED-class (additive discovery policy + new table + 3 SECURITY DEFINER RPCs).
 * Pins the safety invariants so a future edit can't loosen them:
 *   - discovery is authenticated + ACTIVE-only (status='active'), never anon/public;
 *   - the request table is 2-party scoped; writes are RPC-only (SELECT grant only);
 *   - no using(true), no anon/public, no cross-user edit/delete grant;
 *   - human-gate annotation present; guarded reversible rollback exists.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIG = join(REPO, "supabase", "migrations", "20260627145318_service_offering_requests.sql");
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260627145318_service_offering_requests.down.sql",
);
const read = (p: string) => readFileSync(p, "utf8");
const stripSqlComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("marketplace migration is additive + RLS-safe", () => {
  const raw = read(MIG);
  const sql = stripSqlComments(raw).toLowerCase();

  it("adds discovery as an authenticated, ACTIVE-only SELECT policy (not editing the frozen W8 file)", () => {
    expect(sql).toMatch(
      /create policy service_offerings_discover_active on public\.service_offerings\s+for select to authenticated\s+using \(status = 'active'\)/,
    );
    // discovery must not touch the frozen W8 migration file
    expect(existsSync(MIG)).toBe(true);
    // additive: the new table is created, no existing table altered except adding a policy
    expect(sql).toMatch(/create table if not exists public\.service_offering_requests/);
    expect(sql).not.toMatch(/alter table public\.service_offerings/);
    expect(sql).not.toMatch(/delete from|truncate /);
  });

  it("enables RLS and scopes the request table to the two parties + admin", () => {
    expect(sql).toMatch(
      /alter table public\.service_offering_requests\s+enable row level security/,
    );
    expect(sql).toMatch(
      /create policy service_offering_requests_select on public\.service_offering_requests\s+for select to authenticated\s+using \(buyer_id = auth\.uid\(\) or provider_id = auth\.uid\(\) or public\.is_admin\(\)\)/,
    );
  });

  it("never opens with using(true) or to anon/public; request writes are RPC-only", () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/with\s+check\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/\bto anon\b/);
    expect(sql).not.toMatch(/\bto public\b/);
    // only SELECT is granted on the request table (no insert/update/delete grant)
    expect(sql).toMatch(/grant select on public\.service_offering_requests to authenticated/);
    expect(sql).not.toMatch(
      /grant[^;]*\b(insert|update|delete)\b[^;]*on public\.service_offering_requests/,
    );
    // and no write POLICY on the request table (RPCs are the only writers)
    expect(sql).not.toMatch(/create policy service_offering_requests_(insert|update|delete)/);
  });

  it("guards against self-request and duplicate open requests", () => {
    expect(sql).toMatch(/check \(buyer_id <> provider_id\)/);
    expect(sql).toMatch(/unique index[^;]*service_offering_requests[^;]*where status = 'sent'/);
  });

  it("carries the human-gate annotation (RED, owner-applied)", () => {
    expect(raw).toMatch(/@human-gate-approved/);
    expect(raw).toMatch(/DO NOT APPLY automatically/i);
  });
});

describe("marketplace rollback is present and guarded", () => {
  it("exists, refuses to drop a non-empty table, drops the policy + RPCs + table", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = read(ROLLBACK).toLowerCase();
    expect(down).toMatch(/refusing automatic rollback/);
    expect(down).toMatch(/drop policy if exists service_offerings_discover_active/);
    expect(down).toMatch(/drop function if exists public\.request_service_offering/);
    expect(down).toMatch(/drop function if exists public\.respond_service_offering_request/);
    expect(down).toMatch(/drop function if exists public\.withdraw_service_offering_request/);
    expect(down).toMatch(/drop table if exists public\.service_offering_requests/);
  });
});
