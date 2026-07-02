import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Approved-route MODEL A guards (owner decision 2026-07-02; finding F-E1).
 *
 * Contract:
 *   - The worker-visibility RPC surfaces demand ONLY for companies whose
 *     verification_status is 'verified' (admin-only reachable — that IS the
 *     approval gate). One route class: 'approved_direct_partner'.
 *   - The projection stays curated: never need_summary / notes /
 *     payload.role / location free text / profile ids.
 *   - No model-B artifacts: NO route_status COLUMN is added anywhere.
 *   - Grant surface unchanged: execute revoked from public, granted to
 *     authenticated only; RLS untouched (no policy statements).
 *   - The constant route class is actually worker-visible in the app gate.
 *   - Rollback restores the exact pre-model-A definition.
 */

const APP = join(process.cwd());
const REPO = join(APP, "..", "..");
const MIGRATION =
  "supabase/migrations/20260702170000_worker_demand_approved_route_model_a.sql";

const migration = readFileSync(join(REPO, MIGRATION), "utf-8");
const code = migration
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("model A migration — verified-company gate", () => {
  it("joins companies on verification_status='verified'", () => {
    expect(code).toMatch(
      /join public\.companies c[\s\S]{0,120}verification_status = 'verified'/i,
    );
  });

  it("returns the two approval columns with the single model-A route class", () => {
    expect(code).toMatch(/company_name\s+text/i);
    expect(code).toMatch(/route_status\s+text/i);
    expect(code).toMatch(/'approved_direct_partner'::text/);
  });

  it("keeps the worker-only caller gate", () => {
    expect(code).toMatch(/from public\.workers w where w\.profile_id = uid/i);
  });

  it("projection stays curated — no free text, no ids beyond the need id", () => {
    for (const banned of [
      "need_summary",
      "notes",
      "payload ->> 'role'",
      "payload ->> 'location'",
      "customer_id",
    ]) {
      expect(code, `must not project ${banned}`).not.toContain(banned);
    }
    // The RETURNS TABLE block must not expose any profile/company id —
    // cr.profile_id is allowed only as the JOIN key, never as a column.
    const returnsBlock = code.match(/returns table \(([\s\S]*?)\)/i)?.[1] ?? "";
    expect(returnsBlock.length).toBeGreaterThan(0);
    expect(returnsBlock).not.toMatch(/profile_id|company_id|customer/i);
  });

  it("adds NO route_status column anywhere (model B rejected)", () => {
    expect(code).not.toMatch(/alter table/i);
    expect(code).not.toMatch(/add column/i);
    const dir = join(REPO, "supabase", "migrations");
    const offenders = readdirSync(dir).filter((f) => {
      const src = readFileSync(join(dir, f), "utf-8");
      return /add column[^;]*route_status/i.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("grant surface unchanged and no policy statements", () => {
    expect(code).toMatch(/revoke all on function/i);
    expect(code).toMatch(/grant execute on function[\s\S]{0,120}to authenticated/i);
    expect(code).not.toMatch(/to anon|to public\b/i);
    expect(code).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = public/i);
  });

  it("is human-gated and ships a rollback restoring the prior definition", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    const down = join(
      REPO,
      "supabase/rollbacks/20260702170000_worker_demand_approved_route_model_a.down.sql",
    );
    expect(existsSync(down)).toBe(true);
    const downSrc = readFileSync(down, "utf-8");
    expect(downSrc).not.toMatch(/company_name|route_status/);
  });
});

describe("app gate accepts exactly the model-A route class", () => {
  it("'approved_direct_partner' is in WORKER_VISIBLE_ROUTE_STATUSES", () => {
    const fit = readFileSync(
      join(APP, "lib/opportunities/opportunity-fit.ts"),
      "utf-8",
    );
    expect(fit).toContain('"approved_direct_partner"');
    expect(fit).toMatch(/isApprovedRouteRow/);
  });
});
