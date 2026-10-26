import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PRODUCT_SCOPES } from "@/lib/mcp/scopes";

/**
 * GUARD — B3 product grants (migration 20261026080400 + the app paths that
 * use it). Pins the properties the owner approves, so a later edit cannot
 * quietly undo them:
 *
 *   1. the grant is written ONLY through definer functions that refuse any
 *      caller whose JWT carries `client_id` — an OAuth client can never grant,
 *      widen, revoke or read grants, not even its own;
 *   2. authenticated has SELECT only on the table, and the policy hides every
 *      row from an OAuth-client token;
 *   3. the door function takes NO argument (it cannot be pointed at another
 *      client or person) and the door reads it on the caller's own client;
 *   4. the SQL scope list and `PRODUCT_SCOPES` are the same list;
 *   5. on the consent screen the choice is recorded BEFORE GoTrue approves;
 *      on Connected apps it is withdrawn BEFORE the GoTrue grant is revoked;
 *   6. the rollback refuses to silently widen scoped clients back to legacy.
 *
 * The behaviour itself is proven on a throwaway PostgreSQL 16 cluster by
 * scripts/db-proof/oauth-product-grants-v1.sh (65 checks).
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const NAME = "20261026080400_oauth_product_grants_v1";
const migration = readFileSync(join(REPO, "supabase", "migrations", `${NAME}.sql`), "utf8");
const rollback = readFileSync(join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`), "utf8");
const sql = migration.replace(/--[^\n]*/g, "");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const FUNCTIONS = {
  grant_oauth_product_scopes_v1: "uuid, text[], text, text",
  revoke_oauth_product_grant_v1: "uuid",
  read_oauth_product_grant_v1: "uuid, text",
  oauth_door_product_grant_v1: "",
} as const;

function body(fn: string): string {
  const m = new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`).exec(sql);
  if (!m) throw new Error(`function ${fn} not found`);
  return m[0];
}

describe("B3 migration — authority", () => {
  for (const [fn, args] of Object.entries(FUNCTIONS)) {
    it(`${fn}: SECURITY DEFINER, pinned search_path, EXECUTE for authenticated only`, () => {
      const b = body(fn);
      expect(b).toMatch(/security definer/);
      expect(b).toMatch(/set search_path = public, pg_temp/);
      expect(sql).toContain(`revoke all on function public.${fn}(${args}) from public;`);
      expect(sql).toContain(`revoke all on function public.${fn}(${args}) from anon;`);
      expect(sql).toContain(`grant execute on function public.${fn}(${args}) to authenticated;`);
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to [^;]*\\b(anon|public)\\b`));
    });
  }

  for (const fn of ["grant_oauth_product_scopes_v1", "revoke_oauth_product_grant_v1", "read_oauth_product_grant_v1"]) {
    it(`${fn}: refuses an OAuth-client token (any client_id key) before doing anything`, () => {
      const b = body(fn);
      const refusal = b.indexOf("if v_claims ? 'client_id' then");
      expect(refusal, "client_id refusal missing").toBeGreaterThan(0);
      expect(b.slice(refusal, refusal + 120)).toMatch(/oauth_client_caller_refused/);
      for (const write of ["insert into", "update public.", "select * into", "return query"]) {
        const at = b.indexOf(write);
        if (at >= 0) expect(at, `${fn}: '${write}' before the client_id refusal`).toBeGreaterThan(refusal);
      }
    });
  }

  it("the door function takes no argument and only answers an OAuth-client token", () => {
    expect(sql).toMatch(/create or replace function public\.oauth_door_product_grant_v1\(\)\s*returns jsonb/);
    expect(body("oauth_door_product_grant_v1")).toMatch(/not_an_oauth_caller/);
  });

  it("authenticated may only SELECT the table; the policy hides every row from an OAuth-client token", () => {
    expect(sql).toMatch(/revoke all on public\.oauth_product_grants from authenticated;/);
    expect(sql).toMatch(/grant select on public\.oauth_product_grants to authenticated;/);
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete|all)[^;]*on public\.oauth_product_grants to authenticated/);
    expect(sql).toMatch(/for select\s+to authenticated\s+using \(\s*user_id = auth\.uid\(\)\s+and not \(coalesce\(auth\.jwt\(\), '\{\}'::jsonb\) \? 'client_id'\)/);
    expect(sql).not.toMatch(/create policy [^;]*for (insert|update|delete|all)/);
  });

  it("the SQL scope list is exactly PRODUCT_SCOPES, in both the CHECK and the grant function", () => {
    const lists = [...sql.matchAll(/array\[\s*('read:profile'[\s\S]*?)\]/g)].map((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    );
    expect(lists.length).toBe(2);
    for (const l of lists) expect(l).toEqual([...PRODUCT_SCOPES]);
  });

  it("every grant change leaves an audit_logs receipt", () => {
    for (const fn of ["grant_oauth_product_scopes_v1", "revoke_oauth_product_grant_v1"]) {
      expect(body(fn)).toMatch(/insert into public\.audit_logs[\s\S]*'oauth_product_grant'/);
    }
  });
});

describe("B3 rollback — never a silent widening", () => {
  it("refuses while active grants exist unless explicitly acknowledged", () => {
    expect(rollback).toMatch(/where revoked_at is null/);
    expect(rollback).toMatch(/lm\.b3_rollback_ack/);
    expect(rollback).toMatch(/widening-accepted/);
    expect(rollback.indexOf("raise exception")).toBeLessThan(rollback.indexOf("drop table"));
  });
});

describe("B3 app paths", () => {
  it("consent: the choice is recorded BEFORE GoTrue approves; a pending deny records nothing", () => {
    const action = read("lib/auth/oauth-consent-actions.ts");
    const grantAt = action.indexOf("grantProductScopes(supabase");
    const approveAt = action.indexOf("approveAuthorization(authorizationId)");
    expect(grantAt).toBeGreaterThan(0);
    expect(approveAt).toBeGreaterThan(grantAt);
    const denyBlock = action.slice(action.indexOf('if (decision === "deny")'), action.indexOf("// approve"));
    expect(denyBlock).toMatch(/if \(mode === "pending"\)[\s\S]*denyAuthorization/);
    const pendingDeny = denyBlock.slice(0, denyBlock.indexOf("// returning"));
    expect(pendingDeny).not.toMatch(/grantProductScopes|revokeProductGrant/);
  });

  it("consent: the client is resolved from the authorization, never taken from the form", () => {
    const action = read("lib/auth/oauth-consent-actions.ts");
    expect(action).toMatch(/readOwnProductGrants\(supabase, \{ authorizationId \}\)/);
    expect(action).not.toMatch(/formData\.get\("client_id"\)/);
  });

  it("consent page: auto-skip passes through only when a recorded choice covers the request", () => {
    const page = read("app/[locale]/oauth/consent/page.tsx");
    expect(page).toMatch(/if \(!chooserNeeded\(row\)\) \{\s*redirect\(redirectUrl\);/);
    expect(page).not.toMatch(/defaultChecked=\{true\}/);
  });

  it("the door reads the grant on the caller's own client, per request, and fails closed", () => {
    const route = read("app/api/mcp/route.ts");
    expect(route).toMatch(/productGrantForRequest\(auth\.identity\.supabase\)/);
    expect(route).toMatch(/recorded\.state === "unavailable"[\s\S]{0,900}permissionCheckUnavailableResult/);
    const routeCode = route.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
    expect(routeCode).not.toMatch(/service[_-]?role|SUPABASE_SERVICE_ROLE/i);
    expect(route).not.toMatch(/scopeClaim/);
  });

  it("no code derives product scopes from the token any more", () => {
    for (const f of ["lib/mcp/scopes.ts", "app/api/mcp/route.ts", "lib/mcp/product-grant.ts"]) {
      expect(read(f), f).not.toMatch(/scopeClaim|oauthClientClaimsOf/);
    }
  });
});
