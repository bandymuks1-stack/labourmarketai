import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the consent-gated document-readiness aggregate counts the LIVE agency
 * roster (owner P0 2026-11-03).
 *
 * agency_pool_docs_readiness() found the pool only through the retired
 * agencies / agency_workers tables, so every real agency (a company acting as
 * an agency, people on company_workers) counted 0. The pool is now the
 * caller's agency company roster through the canonical gate plus the legacy
 * pool. Pins: the gate, active roster only, the worker's consent switch,
 * counts only, unchanged shape and grants, rollback to the s6 body.
 */
const repo = resolve(__dirname, "..", "..", "..", "..");
const NAME = "20261103130000_agency_pool_docs_readiness_live_roster_v1";
const exec = (rel: string) =>
  readFileSync(resolve(repo, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const up = exec(`supabase/migrations/${NAME}.sql`);
const down = exec(`supabase/rollbacks/${NAME}.down.sql`);
const s6 = exec("supabase/migrations/20260611170000_s6_worker_docs_consent.sql");

describe("Guard: agency pool docs readiness on the live roster", () => {
  it("resolves the agency through the ONE canonical gate, never a held role or a type literal", () => {
    expect(up).toMatch(/v_company := public\.caller_agency_company_id\(\);/);
    expect(up).not.toMatch(/staffing_agency/);
  });

  it("counts only the agency's ACTIVE roster, keeps the legacy pool", () => {
    expect(up).toMatch(/cw\.company_id = v_company\s+and cw\.status = 'active'/);
    expect(up).toMatch(/aw\.agency_id = v_agency/);
  });

  it("keeps the worker's consent switch and returns counts only", () => {
    expect(up).toMatch(/where w\.docs_aggregate_consent is true/);
    expect(up).toMatch(/returns table \(\s*worker_id\s+uuid,\s*docs_total\s+int,\s*docs_valid\s+int,\s*docs_expiring int,\s*docs_attention int\s*\)/);
    expect(up).not.toMatch(/d\.(file|storage|path|name|title|number)/);
  });

  it("stays SECURITY DEFINER, fails closed without a session, authenticated only", () => {
    expect(up).toMatch(/stable\s+security definer\s+set search_path = public/);
    expect(up).toMatch(/if uid is null then\s+raise exception 'Not authenticated' using errcode = '42501';/);
    expect(up).toMatch(/revoke all on function public\.agency_pool_docs_readiness\(\) from anon;/);
    expect(up).toMatch(/grant execute on function public\.agency_pool_docs_readiness\(\) to authenticated;/);
    expect(up).not.toMatch(/to (anon|public)\s*;/);
  });

  it("rollback restores the s6 body", () => {
    const body = (sql: string) => {
      const start = sql.indexOf("create or replace function public.agency_pool_docs_readiness");
      return sql.slice(start, sql.indexOf("end $$;", start));
    };
    expect(body(s6).length).toBeGreaterThan(200);
    expect(body(down)).toBe(body(s6));
  });
});
