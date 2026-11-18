import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../..");
const MIG = readFileSync(
  join(root, "supabase/migrations/20261008090000_chain_proof_unshare_withdraws_offers_v1.sql"),
  "utf8",
);
const DOWN = readFileSync(
  join(root, "supabase/rollbacks/20261008090000_chain_proof_unshare_withdraws_offers_v1.down.sql"),
  "utf8",
);

describe("chain proof: unshare withdraws live agency offers", () => {
  it("unshare_request_v1 withdraws only offered offers on the revoked share", () => {
    expect(MIG).toMatch(/update public\.agency_candidate_offers[\s\S]*request_share_id = p_share_id and status = 'offered'/);
    expect(MIG).toMatch(/if v_upd > 0 then/);
  });
  it("duplicate service request keeps errcode 23505 with a named message", () => {
    expect(MIG).toMatch(/raise exception 'request_already_open' using errcode = '23505'/);
  });
  it("loosens nothing: no policy, grant or drop", () => {
    expect(MIG).not.toMatch(/create policy|alter policy|grant |to anon|using \(true\)|drop (table|column)/i);
  });
  it("ships a rollback that restores the old bodies", () => {
    expect(DOWN).toMatch(/create or replace function public\.unshare_request_v1/);
    expect(DOWN).toMatch(/create or replace function public\.respond_agency_candidate_offer_v1/);
    expect(DOWN).not.toMatch(/update public\.agency_candidate_offers[\s\S]*status = 'withdrawn'/);
    expect(DOWN).not.toMatch(/request_already_open/);
    expect(DOWN).not.toMatch(/agency_client_request_shares s\s+where s\.id = v_offer/);
  });
  it("respond refuses offer_not_open when the share is no longer active (defence in depth)", () => {
    expect(MIG).toMatch(/create or replace function public\.respond_agency_candidate_offer_v1/);
    expect(MIG).toMatch(/s\.id = v_offer\.request_share_id and s\.status = 'active'[\s\S]*?offer_not_open/);
  });
  it("never deletes history: no delete from the offers or shares", () => {
    expect(MIG).not.toMatch(/delete\s+from|truncate/i);
  });
});
