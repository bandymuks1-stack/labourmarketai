import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 marketplace — SECURITY DEFINER boundary guard.
 *
 * Exactly THREE new SECURITY DEFINER RPCs are the only writers of the request
 * table. Each must: pin search_path; revoke execute from public + grant to
 * authenticated only; bind auth.uid() as the actor; and re-check the specific
 * scope at fire time (the offering's provider on request; the request's provider
 * on respond; the request's buyer on withdraw).
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const read = () =>
  readFileSync(join(REPO, "supabase", "migrations", "20260627145318_service_offering_requests.sql"), "utf8");
const stripSqlComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const RPCS: ReadonlyArray<[string, string]> = [
  ["request_service_offering", "uuid, text"],
  ["respond_service_offering_request", "uuid, text, text"],
  ["withdraw_service_offering_request", "uuid"],
];

describe("marketplace RPCs are exactly three tightly-bounded SECURITY DEFINER fns", () => {
  const sql = stripSqlComments(read()).toLowerCase();

  it("there are EXACTLY three new SECURITY DEFINER functions", () => {
    expect((sql.match(/security definer/g) ?? []).length).toBe(3);
  });

  for (const [name, args] of RPCS) {
    it(`${name} is search_path-pinned, public-revoked, authenticated-granted`, () => {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${name}\\(`));
      expect(sql).toMatch(/security definer set search_path = public/);
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\(${args}\\) from public`));
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\(${args}\\) to authenticated`),
      );
    });
  }

  it("every RPC binds auth.uid() and rejects the unauthenticated caller", () => {
    expect((sql.match(/uid uuid := auth\.uid\(\)/g) ?? []).length).toBe(3);
    expect((sql.match(/if uid is null then raise exception 'not authenticated' using errcode = '42501'/g) ?? []).length).toBe(3);
  });

  it("each RPC re-checks the correct scope at fire time", () => {
    // request: binds provider from the offering + blocks self-request
    expect(sql).toMatch(/select provider_id, status into v_provider, v_status\s+from public\.service_offerings where id = p_offering_id/);
    expect(sql).toMatch(/if v_provider = uid then raise exception 'cannot_request_own_offering'/);
    // respond: only the request's provider
    expect(sql).toMatch(/if v_provider <> uid then return 'not_provider'/);
    // withdraw: only the request's buyer
    expect(sql).toMatch(/if v_buyer <> uid then return 'not_buyer'/);
  });
});
