import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the local-reset reproducibility fix for
 * `20260722160000_secdef_anon_reach_revoke_v1.sql`.
 *
 * Root cause it guards: no migration runs `ALTER DEFAULT PRIVILEGES`, so on a
 * FRESH `supabase db reset` every SECURITY DEFINER function keeps Postgres's
 * default PUBLIC (hence anon) EXECUTE. The migration's fail-closed assertion
 * ("anon reaches exactly the 4 allowlisted RPCs") was written against
 * production's externally-hardened state, so the chain was NOT reproducible on
 * a clean local DB. The §4b block makes the migration the canonical closure
 * point (revoke PUBLIC + anon from every non-allowlisted secdef function),
 * idempotent on prod, deterministic on a fresh DB — with NO environment switch
 * that could weaken the production check.
 *
 * These are static source assertions; the live proof is `supabase db reset`
 * passing on a clean database (documented in the PR).
 */
const MIG = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260722160000_secdef_anon_reach_revoke_v1.sql",
);
const src = readFileSync(MIG, "utf8");

const ALLOWLIST = [
  "get_public_business_profile_v1(p_slug text)",
  "get_public_business_listings_v1(p_org_id uuid)",
  "get_public_business_services_v1(p_org_id uuid)",
  "submit_company_need_public_v1(p_locale text",
];

describe("secdef migration: local-reset reproducibility (baseline-independent closure)", () => {
  it("keeps the §4b dynamic closure that revokes PUBLIC + anon on non-allowlisted secdef functions", () => {
    // A loop over public SECURITY DEFINER functions …
    expect(src).toMatch(/for\s+r\s+in[\s\S]*prosecdef/i);
    // … that revokes execute from PUBLIC and anon (never authenticated/service_role).
    expect(src).toMatch(/revoke execute on function %s from public, anon/i);
  });

  it("excludes exactly the four intentionally-public RPCs from the closure", () => {
    for (const sig of ALLOWLIST) {
      expect(src, `allowlist signature missing: ${sig}`).toContain(sig);
    }
  });

  it("keeps the fail-closed §5 assertion (not weakened, still raises)", () => {
    expect(src).toMatch(/anon still reaches non-allowlisted SECURITY DEFINER function/i);
    expect(src).toMatch(/raise exception/i);
  });

  it("does NOT introduce an environment / GUC switch that disables the assertion", () => {
    // Owner directive: no production-reachable "skip security assertion" switch.
    expect(src).not.toMatch(/skip_secdef_assert/i);
    expect(src).not.toMatch(/current_setting\([^)]*skip/i);
  });

  it("the closure runs AFTER the §2b authenticated grants (helpers keep access)", () => {
    const grant8 = src.indexOf("grant  execute on function public.can_access_match");
    const closure = src.indexOf("revoke execute on function %s from public, anon");
    expect(grant8, "expected the §2b helper grant").toBeGreaterThan(0);
    expect(closure, "expected the §4b closure").toBeGreaterThan(grant8);
  });
});
