import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the accept-worker-invitation RPCs (migration 0036, slice
 * sales-core-nonstop-v1 gap #1). Pins the safety invariants of the SECURITY
 * DEFINER link-creation path so a future edit cannot let a user link someone
 * else, link without a real pending invitation, create fake data, or turn the
 * migration destructive / broaden RLS or table grants. Static SQL analysis.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const MIGRATION = "supabase/migrations/0036_accept_worker_invitation_rpc.sql";
const raw = readFileSync(resolve(REPO, MIGRATION), "utf8");
const sql = raw.toLowerCase();
const code = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("0036 defines two guarded SECURITY DEFINER accept RPCs", () => {
  for (const fn of [
    "accept_company_worker_invitation",
    "accept_agency_worker_invitation",
  ]) {
    it(`${fn} is defined`, () => {
      expect(code).toContain(`create or replace function public.${fn}`);
    });
  }
  it("both are SECURITY DEFINER + set search_path = public", () => {
    expect((code.match(/security definer/g) ?? []).length).toBe(2);
    expect((code.match(/set search_path = public/g) ?? []).length).toBe(2);
  });
});

describe("0036 links ONLY the caller, ONLY with a real pending invitation", () => {
  it("resolves the caller's own worker row (no linking others)", () => {
    expect(code).toMatch(/from public\.profiles p/);
    expect(code).toMatch(/join public\.workers w on w\.profile_id = p\.id/);
    expect(code).toContain("return 'no_worker_profile'");
  });

  it("requires a PENDING invitation addressed to the caller's own email", () => {
    expect(code).toMatch(/lower\(i\.invited_email\) = lower\(v_email\)/);
    expect((code.match(/i\.status = 'pending'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(code).toContain("return 'no_invitation'");
  });

  it("is idempotent — existing link returns already_linked, no dupes", () => {
    expect(code).toContain("return 'already_linked'");
    expect(code).toMatch(/on conflict \([^)]*\) do nothing/);
    expect(code).toContain("return 'linked'");
  });
});

describe("0036 creates the link + marks the invitation accepted", () => {
  it("inserts the link and flips the invitation to 'accepted'", () => {
    expect(code).toMatch(/insert into public\.company_workers/);
    expect(code).toMatch(/insert into public\.agency_workers/);
    expect((code.match(/set status = 'accepted'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("appends an audit_logs row with the real actor", () => {
    expect(code).toMatch(/insert\s+into\s+public\.audit_logs/);
    expect(code).toContain("auth.uid()");
    expect(code).toContain("'accept_company_worker_invitation'");
    expect(code).toContain("'accept_agency_worker_invitation'");
  });
});

describe("0036 is additive + non-destructive + scope-safe", () => {
  it("creates no fake worker / company / journal data", () => {
    expect(code).not.toMatch(/insert\s+into\s+public\.workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.companies/);
    expect(code).not.toMatch(/insert\s+into\s+public\.agencies/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entries/);
    expect(code).not.toMatch(/insert\s+into\s+public\.engagement_contexts/);
  });
  it("performs no destructive / schema-shape change", () => {
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from/);
    expect(code).not.toMatch(/alter\s+table/);
    expect(code).not.toMatch(/create\s+table/);
    expect(code).not.toMatch(/truncate/);
  });
  it("UPDATE only touches the invitation tables", () => {
    const updates = code.match(/update\s+public\.(\w+)/g) ?? [];
    for (const u of updates) {
      expect([
        "update public.company_worker_invitations",
        "update public.agency_worker_invitations",
      ]).toContain(u);
    }
  });
  it("changes no RLS policy and no TABLE grant", () => {
    expect(code).not.toMatch(/create\s+policy|drop\s+policy/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+(table\s+)?public\.\w+/);
  });
  it("grants EXECUTE on the two functions to authenticated only", () => {
    expect((code.match(/grant execute on function/g) ?? []).length).toBe(2);
    expect((code.match(/revoke all on function/g) ?? []).length).toBe(2);
    expect(code).toContain("to authenticated");
  });
  it("touches no email, payment, marketplace or outbound surface", () => {
    for (const banned of [/\bstripe\b/, /\bpayment\b/, /\bmarketplace\b/, /\bhttp/]) {
      expect(banned.test(code), `must not match ${banned}`).toBe(false);
    }
  });
});
