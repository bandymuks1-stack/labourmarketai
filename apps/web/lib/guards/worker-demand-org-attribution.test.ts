/**
 * Guard — worker board organization attribution pair
 * (20260807130000_worker_demand_org_attribution_v1).
 *
 * Production bug (observed live 2026-08-06): list_open_demand_for_workers
 * joined `companies` by OWNER PROFILE, so a profile owning multiple verified
 * companies (legal post 20260805170000 cap removal) fanned every demand row
 * out once per company, attributing it to companies that do not own it.
 *
 * Pins that the replacement migration:
 *  1. resolves the company through THE DEMAND'S ORGANIZATION
 *     (cr.organization_id → organizations.legacy_company_id);
 *  2. keeps a deterministic pre-org fallback (organization_id IS NULL →
 *     owner profile's oldest verified company);
 *  3. makes one-row-per-demand structural (join lateral … limit 1) — the
 *     bare fan-out join may not reappear in the up file;
 *  4. keeps the verified gate and the standing worker-safety exclusions
 *     (whitelisted payload access only, no free-text/PII columns);
 *  5. changes nothing else: signature, auth guard, grants stay closed;
 *  6. stays owner-gated (human-gate package referenced) with a paired
 *     rollback that knowingly restores the prior profile join.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..", "..", "..");
const NAME = "20260807130000_worker_demand_org_attribution_v1";
const up = readFileSync(
  join(REPO, "supabase", "migrations", `${NAME}.sql`),
  "utf8",
);
const down = readFileSync(
  join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`),
  "utf8",
);
const rpcBody = up.slice(
  up.indexOf("create or replace function public.list_open_demand_for_workers"),
);

describe("worker demand org attribution pair", () => {
  it("company resolves through the demand's organization, not the owner profile", () => {
    expect(rpcBody).toContain("cr.organization_id is not null");
    expect(rpcBody).toMatch(
      /co\.id = \(select o\.legacy_company_id\s+from public\.organizations o\s+where o\.id = cr\.organization_id\)/,
    );
  });

  it("pre-org rows keep a deterministic single-company fallback", () => {
    expect(rpcBody).toContain("cr.organization_id is null");
    expect(rpcBody).toContain("co.profile_id = cr.profile_id");
    // Deterministic pick — never "whichever company the planner returns".
    expect(rpcBody).toMatch(/order by co\.created_at asc, co\.id asc\s+limit 1/);
  });

  it("one row per demand is structural: lateral + limit 1, no bare fan-out join", () => {
    expect(rpcBody).toContain("join lateral (");
    // The defective shape must not survive anywhere in the up file:
    // a direct companies join keyed on the demand owner's profile.
    expect(up).not.toMatch(
      /join public\.companies\s+\w+\s+on \w+\.profile_id = cr\.profile_id/,
    );
  });

  it("verified gate is kept and is part of the company resolution itself", () => {
    expect(rpcBody).toContain("co.verification_status = 'verified'");
  });

  it("worker-safety exclusions survive the recreation", () => {
    // Payload access stays scoped to the four whitelisted keys.
    expect(rpcBody).not.toMatch(
      /cr\.payload(?!\s*->>?\s*'(structured_v2|accommodation|transport|required_tools)')/,
    );
    expect(rpcBody).toContain(
      "public.demand_structured_v2_public(cr.payload -> 'structured_v2')",
    );
    // Standing exclusions — free text and precise location never reach workers.
    expect(rpcBody).not.toMatch(/need_summary/);
    expect(rpcBody).not.toMatch(/cr\.title/);
    expect(rpcBody).not.toMatch(/address_text/);
    expect(rpcBody).not.toMatch(/cdl\.locality/);
  });

  it("signature and closed grants are unchanged", () => {
    expect(up).toContain("structured     jsonb");
    expect(up).toContain("security definer");
    expect(up).toContain("set search_path = public");
    expect(up).toMatch(/revoke all on function\s+public\.list_open_demand_for_workers\(\) from public/);
    expect(up).toMatch(/revoke all on function\s+public\.list_open_demand_for_workers\(\) from anon/);
    expect(up).toMatch(/grant execute on function\s+public\.list_open_demand_for_workers\(\) to authenticated/);
    // RPC replacement only — no policy, table, or data change rides along.
    expect(up).not.toMatch(/create policy|alter table|insert into|update public\.|delete from/i);
  });

  it("stays owner-gated with the human-gate package present", () => {
    expect(up).toContain(
      "docs/human-gates/worker-demand-org-attribution-gate.md",
    );
    expect(
      existsSync(
        join(REPO, "docs", "human-gates", "worker-demand-org-attribution-gate.md"),
      ),
    ).toBe(true);
    expect(up).toContain("Ships UNAPPLIED");
  });

  it("rollback restores the prior profile join and says what that reintroduces", () => {
    expect(down).toContain("on c.profile_id = cr.profile_id");
    expect(down).toContain("c.verification_status = 'verified'");
    expect(down).toMatch(/KNOWN DEFECT/i);
    expect(down).toContain("structured     jsonb");
  });
});
