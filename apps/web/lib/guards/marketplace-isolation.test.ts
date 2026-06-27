import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 marketplace — cross-account / company isolation guard.
 *
 * - Discovery exposes only ACTIVE offerings to authenticated users (no anon).
 * - A request row is visible only to its buyer, its provider, or admin.
 * - request binds provider_id from the offering (never trusts the caller),
 *   pins buyer_id = auth.uid(), and forbids requesting your own offering.
 * - respond is provider-scoped; withdraw is buyer-scoped (DB-level).
 * - The server actions scope discovery/inbox/outgoing to the caller.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const APP = join(__dirname, "..", "..");
const sql = readFileSync(
  join(REPO, "supabase", "migrations", "20260627145318_service_offering_requests.sql"),
  "utf8",
).toLowerCase();
const actions = readFileSync(join(APP, "lib", "marketplace", "service-requests.ts"), "utf8");

describe("marketplace isolation is enforced at the DB layer", () => {
  it("discovery is active-only + authenticated-only (no anon/public)", () => {
    expect(sql).toMatch(/service_offerings_discover_active[\s\S]*?to authenticated[\s\S]*?using \(status = 'active'\)/);
    expect(sql).not.toMatch(/\bto anon\b/);
  });

  it("request rows are visible only to buyer / provider / admin", () => {
    expect(sql).toMatch(
      /service_offering_requests_select[\s\S]*?using \(buyer_id = auth\.uid\(\) or provider_id = auth\.uid\(\) or public\.is_admin\(\)\)/,
    );
  });

  it("request binds provider from the offering, pins buyer to the caller, blocks self-request", () => {
    expect(sql).toMatch(/select provider_id, status into v_provider, v_status\s+from public\.service_offerings/);
    // inserted buyer_id is the caller (uid), provider_id is from the offering
    expect(sql).toMatch(/values \(p_offering_id, v_provider, uid,/);
    expect(sql).toMatch(/if v_provider = uid then raise exception 'cannot_request_own_offering'/);
  });

  it("respond is provider-scoped and withdraw is buyer-scoped", () => {
    expect(sql).toMatch(/if v_provider <> uid then return 'not_provider'/);
    expect(sql).toMatch(/if v_buyer <> uid then return 'not_buyer'/);
  });
});

describe("marketplace server actions scope every read to the caller", () => {
  it("discovery excludes the caller's own offerings and only active ones", () => {
    expect(actions).toMatch(/\.eq\("status", "active"\)/);
    expect(actions).toMatch(/\.neq\("provider_id", ctx\.userId\)/);
  });
  it("inbox is provider-scoped and outgoing is buyer-scoped", () => {
    expect(actions).toMatch(/\.eq\("provider_id", ctx\.userId\)/);
    expect(actions).toMatch(/\.eq\("buyer_id", ctx\.userId\)/);
  });
});
