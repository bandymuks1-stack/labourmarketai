import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 marketplace — request status-transition guard.
 *
 * The only valid transitions are OUT of 'sent': sent→accepted, sent→declined
 * (provider), sent→withdrawn (buyer). Terminal states never transition. This
 * pins that every mutating RPC requires status='sent' and only sets an allowed
 * target, and that the table's status check constrains the set.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const read = () =>
  readFileSync(join(REPO, "supabase", "migrations", "20260627145318_service_offering_requests.sql"), "utf8");
const sql = read().toLowerCase();

describe("marketplace request status transitions are bounded", () => {
  it("the status column is constrained to the four states", () => {
    expect(sql).toMatch(/status\s+text not null default 'sent'\s+check \(status in \('sent','accepted','declined','withdrawn'\)\)/);
  });

  it("respond only acts on a 'sent' request and only sets accepted/declined", () => {
    expect(sql).toMatch(/if p_decision not in \('accepted','declined'\) then return 'bad_decision'/);
    // guarded against acting on terminal states
    expect(sql).toMatch(/respond_service_offering_request[\s\S]*?if v_status <> 'sent' then return 'not_pending'/);
    expect(sql).toMatch(/set status = p_decision/);
  });

  it("withdraw only acts on a 'sent' request and only sets withdrawn", () => {
    expect(sql).toMatch(/withdraw_service_offering_request[\s\S]*?if v_status <> 'sent' then return 'not_pending'/);
    expect(sql).toMatch(/set status = 'withdrawn'/);
  });

  it("request creates the row in 'sent' (no shortcut into a terminal state)", () => {
    expect(sql).toMatch(/insert into public\.service_offering_requests \(offering_id, provider_id, buyer_id, message, status\)\s*values \(p_offering_id, v_provider, uid,[\s\S]*?'sent'\)/);
  });
});
