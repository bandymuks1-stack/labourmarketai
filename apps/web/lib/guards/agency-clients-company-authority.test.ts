import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: agency client records follow owns_company (owner P0 2026-11-03).
 *
 * save / remove / set_demand resolved the company only by
 * companies.profile_id = auth.uid(): an active owner/admin member could read
 * the agency's client records (the select policy is owns_company) but was
 * refused every write, and a multi-company owner got an arbitrary company.
 * Pins: owns_company on every write path, no profile-only resolution left,
 * deterministic company choice, the demand stays the caller's own, grants and
 * SECURITY DEFINER unchanged, rollback to the 20260713160000 bodies.
 */
const repo = resolve(__dirname, "..", "..", "..", "..");
const NAME = "20261103140000_agency_clients_company_authority_v1";
const exec = (rel: string) =>
  readFileSync(resolve(repo, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const up = exec(`supabase/migrations/${NAME}.sql`);
const down = exec(`supabase/rollbacks/${NAME}.down.sql`);
const original = exec("supabase/migrations/20260713160000_agency_clients_v1.sql");

const fn = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf("\n$$;", start));
};

describe("Guard: agency client records follow owns_company", () => {
  it("every write path checks owns_company", () => {
    const save = fn(up, "save_agency_client_v1");
    expect(save).toMatch(/and public\.owns_company\(c\.id\)/);
    expect(save).toMatch(/where ac\.id = p_client_id and public\.owns_company\(ac\.company_id\)/);
    expect(fn(up, "remove_agency_client_v1")).toMatch(/and public\.owns_company\(ac\.company_id\)/);
    expect(fn(up, "set_demand_agency_client_v1")).toMatch(/where ac\.id = p_client_id and public\.owns_company\(ac\.company_id\)/);
  });

  it("no write path resolves the company by profile ownership alone", () => {
    for (const name of ["save_agency_client_v1", "remove_agency_client_v1", "set_demand_agency_client_v1"]) {
      expect(fn(up, name), name).not.toMatch(/where c\.profile_id = (auth\.uid\(\)|v_uid);/);
      expect(fn(up, name), name).not.toMatch(/and c\.profile_id = (auth\.uid\(\)|v_uid)/);
    }
  });

  it("a new client lands in one deterministic company, an agency first", () => {
    expect(fn(up, "save_agency_client_v1")).toMatch(
      /order by public\.company_acts_as_agency\(c\.id\) desc, c\.created_at, c\.id\s+limit 1;/,
    );
  });

  it("the demand stays the caller's own", () => {
    expect(fn(up, "set_demand_agency_client_v1")).toMatch(/where id = p_request_id\s+and profile_id = v_uid;/);
  });

  it("SECURITY DEFINER and authenticated-only grants are kept", () => {
    for (const name of ["save_agency_client_v1", "remove_agency_client_v1", "set_demand_agency_client_v1"]) {
      expect(fn(up, name), name).toMatch(/security definer\s+set search_path = public/);
    }
    expect(up.match(/grant execute on function public\.\w+\([^)]*\) to authenticated;/g)).toHaveLength(3);
    expect(up).not.toMatch(/to (anon|public)\s*;/);
  });

  it("rollback restores the 20260713160000 bodies verbatim", () => {
    for (const name of ["save_agency_client_v1", "remove_agency_client_v1", "set_demand_agency_client_v1"]) {
      expect(fn(down, name), name).toBe(fn(original, name));
    }
  });
});
