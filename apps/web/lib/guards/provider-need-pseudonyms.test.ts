import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner decision 2026-11-22 (the worker-board linkage): workers keep seeing the
 * employer's name next to the need, so a provider (agency, subcontractor,
 * brigade) must never RECEIVE a real need id. Providers see only order
 * pseudonyms issued to their own organization; the mapping is server-side.
 * Pins migration 20261122223000 (RED, NOT applied) and its rollback.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const strip = (sql: string): string => sql.replace(/--[^\n]*/g, "");
const N = "20261122223000_provider_need_pseudonyms_v1";
const RAW = readFileSync(join(REPO, `supabase/migrations/${N}.sql`), "utf8");
const UP = strip(RAW).toLowerCase();
const DOWN = strip(readFileSync(join(REPO, `supabase/rollbacks/${N}.down.sql`), "utf8")).toLowerCase();

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const next = sql.indexOf("create or replace function", start + 10);
  return sql.slice(start, next === -1 ? undefined : next);
}

describe("provider order pseudonyms — the mapping never leaves the server", () => {
  it("aliases are random and stored, not derived from ids anyone can hold", () => {
    expect(UP).toMatch(/alias\s+uuid primary key default gen_random_uuid\(\)/);
    expect(UP).toMatch(/unique \(provider_org_id, request_id\)/);
    expect(UP).not.toMatch(/md5\([^)]*request_id/);
  });

  it("no app role reads the ledger or calls the get-or-create / resolve functions", () => {
    expect(UP).toMatch(/revoke all on table public\.provider_need_aliases from public, anon, authenticated;/);
    expect(UP).toMatch(/revoke all on function public\.provider_need_alias_v1\(uuid, uuid\) from public, anon, authenticated;/);
    expect(UP).toMatch(/revoke all on function public\.provider_need_of_alias_v1\(uuid, uuid\) from public, anon, authenticated;/);
    expect(UP).not.toMatch(/grant [a-z, ]+ on (table )?public\.provider_need_aliases/);
  });

  it("the board and the sent offers return the alias, and the board only the day", () => {
    const board = fnBody(UP, "list_open_demand_for_team_offer_v1");
    expect(board).toMatch(/select public\.provider_need_alias_v1\(p_team_org_id, cr\.id\)/);
    expect(board).toMatch(/date_trunc\('day', cr\.created_at\)/);
    expect(fnBody(UP, "list_team_demand_offers_for_team_v1")).toMatch(
      /select o\.id, public\.provider_need_alias_v1\(p_team_org_id, o\.request_id\)/,
    );
    // #3630's reader v2 carries the same rule (R2 2026-11-23).
    const v2 = fnBody(UP, "list_open_needs_for_offer_v2");
    expect(v2).toMatch(/select public\.provider_need_alias_v1\(p_team_org_id, cr\.id\)/);
    expect(v2).toMatch(/date_trunc\('day', cr\.created_at\)/);
  });

  it("one body per reader: #3630's bodies, aliased, never the free-text title; order guard first", () => {
    for (const f of ["list_open_demand_for_team_offer_v1", "list_team_demand_offers_for_team_v1", "list_open_needs_for_offer_v2"]) {
      const b = fnBody(UP, f);
      expect(b, f).toMatch(/volatile security definer/);
      expect(b, f).not.toMatch(/cr\.title/);
    }
    expect(fnBody(UP, "open_need_thread_ensure_v1")).not.toMatch(/cr\.title/);
    expect(UP).toMatch(/to_regprocedure\('public\.list_open_needs_for_offer_v2\(uuid\)'\) is null\s+or to_regclass\('public\.open_need_threads'\) is null then\s+raise exception/);
  });

  it("every provider action resolves the alias for the caller's organization; a real id resolves to nothing", () => {
    expect(fnBody(UP, "offer_team_to_demand_v1")).toMatch(
      /p_request_id := public\.provider_need_of_alias_v1\(p_team_org_id, p_request_id\);\s+if p_request_id is null then\s+raise exception 'demand_not_offerable'/,
    );
    expect(fnBody(UP, "open_need_conversation_open_v1")).toMatch(/public\.provider_need_of_alias_v1\(p_org_id, p_request_id\)/);
  });

  it("an open-need thread's readable source is the alias; the need is reached through the ledger", () => {
    expect(fnBody(UP, "open_need_thread_ensure_v1")).toMatch(
      /'open_need', public\.provider_need_alias_v1\(p_org_id, p_request_id\)\)/,
    );
    expect(fnBody(UP, "conversation_source_context")).toMatch(
      /from public\.open_need_threads t\s+join public\.customer_requests cr on cr\.id = t\.request_id/,
    );
    expect(fnBody(UP, "disclose_open_need_identity_v1")).toMatch(/join public\.open_need_threads t on t\.conversation_id = c\.id/);
  });

  it("the raw offer row, the retired all-needs reader and the can-offer oracle are closed to app roles", () => {
    expect(UP).toMatch(/revoke select \(request_id\) on public\.team_demand_offers from authenticated;/);
    expect(UP).toMatch(/revoke execute on function public\.list_open_demand_for_agencies\(\) from public, anon, authenticated;/);
    expect(UP).toMatch(/revoke execute on function public\.mark_agency_can_offer\(uuid, text\) from public, anon, authenticated;/);
  });

  it("is RED and says its residual plainly", () => {
    expect(RAW).not.toMatch(/@human-gate-approved/);
    expect(RAW).toMatch(/RESIDUAL \(said plainly\)/);
  });

  it("the rollback restores the earlier shape and never drops a table holding rows", () => {
    // R2 P3-1: never re-key threads to the real need id; refuse while any exists.
    expect(DOWN).not.toMatch(/set source_id = t\.request_id/);
    expect(DOWN).toMatch(/if exists \(select 1 from public\.conversations where source_type = 'open_need'\) then\s+raise exception/);
    expect(DOWN).toMatch(/grant select \(request_id\) on public\.team_demand_offers to authenticated;/);
    expect(DOWN).toMatch(/if not v_rows then\s+execute 'drop table public\.provider_need_aliases'/);
    expect(DOWN).not.toMatch(/provider_need_alias_v1\(p_team_org_id/);
  });
});
