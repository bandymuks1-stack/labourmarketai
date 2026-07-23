import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Agency→client candidate-OFFER bridge guard (agency-client-bridge v1,
 * Direction A). Pins the four properties the slice must never regress:
 *
 *   1. renders ONLY under the staffing_agency company type — the offer form
 *      mounts exactly once inside the type conditional; no new dashboard route;
 *   2. the offer is a candidate PROPOSAL, never a labour demand — the "offer"
 *      action opens the form (#agency-offer), NOT the demand-intake wizard, and
 *      the slice never writes company_request / customer_requests;
 *   3. the migration is fail-closed + owner-gated — RLS owner-or-request-owner
 *      SELECT, RPC-only writes, SECURITY DEFINER with pinned search_path, PUBLIC
 *      and anon REVOKEd, idempotent unique key, server-side authz on every rule;
 *   4. no auto-communication — nothing is sent to the worker, client, or anyone.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const MIGRATION =
  "supabase/migrations/20260723170000_agency_candidate_offers_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260723170000_agency_candidate_offers_v1.down.sql";

const companyPage = read("app/[locale]/dashboard/company/page.tsx");
const form = read("components/app/agency-offer-worker-form.tsx");
const model = read("lib/agency/candidate-offers-model.ts");
const lib = read("lib/agency/candidate-offers.ts");
const actions = read("lib/agency/candidate-offers-actions.ts");
const migration = readRepo(MIGRATION);
const stripSql = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const code = stripSql(migration).toLowerCase();

describe("1. renders ONLY under the staffing_agency company type", () => {
  it("the offer form mounts exactly once, inside the type conditional", () => {
    expect(companyPage.match(/<AgencyOfferWorkerForm/g) ?? []).toHaveLength(1);
    const condIdx = companyPage.indexOf(
      'companyRow.companyType === "staffing_agency" ? (',
    );
    const formIdx = companyPage.indexOf("<AgencyOfferWorkerForm");
    expect(condIdx).toBeGreaterThan(-1);
    expect(formIdx).toBeGreaterThan(condIdx);
  });

  it("offer data is fetched only in staffing-agency mode", () => {
    expect(companyPage).toMatch(
      /isStaffingAgency\s*\n?\s*\?\s*await listAgencyCandidateOffers\(\)/,
    );
  });

  it("no new agency/company offer route exists", () => {
    for (const rel of [
      "app/[locale]/dashboard/agency/offer",
      "app/[locale]/dashboard/company/offer",
    ]) {
      expect(existsSync(join(APP, rel)), `${rel} must not exist`).toBe(false);
    }
  });
});

describe("2. an offer is a candidate proposal, never a labour demand", () => {
  it('the "offer" action opens the form (#agency-offer), not the demand wizard', () => {
    expect(companyPage).toMatch(/\/dashboard\/company#agency-offer/);
    // The action grid entry keyed "offer" must NOT bind the demand-intake
    // navigation action anymore (that conflated "offer a worker" with "look
    // for workers"). demand-intake stays available ONLY for the real demand
    // draft form lower on the page.
    const offerActionBlock = companyPage.slice(
      companyPage.indexOf('key: "offer"'),
      companyPage.indexOf('key: "scouting"'),
    );
    expect(offerActionBlock).not.toMatch(/openDemandIntakeAsCompanyAction/);
  });

  it("the slice never creates a company_request / customer_requests demand", () => {
    const slice = model + lib + actions + form;
    expect(slice).not.toMatch(/company_request/);
    expect(slice).not.toMatch(/submit_demand_request|save_demand_draft|save_customer_request/);
    expect(slice).not.toMatch(/from\("customer_requests"\)/);
    // Only the offer table + its two RPCs are touched from the write path.
    const froms = [...(lib + actions).matchAll(/\.from\("([^"]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(new Set(froms)).toEqual(new Set(["agency_candidate_offers"]));
    const rpcs = [...actions.matchAll(/\.rpc\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(rpcs)).toEqual(
      new Set([
        "submit_agency_candidate_offer_v1",
        "withdraw_agency_candidate_offer_v1",
      ]),
    );
  });
});

describe("3. the migration is fail-closed + owner-gated", () => {
  it("is a DRAFT with the needs-human-gate header and NO self-added approval", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
    // The owner has not approved: the annotation must be ABSENT (RED CI is the
    // honest un-applied state). Never self-add @human-gate-approved.
    expect(migration).not.toMatch(/^\s*--\s*@human-gate-approved/m);
  });

  it("a paired rollback exists and reverses every object", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const rollback = readRepo(ROLLBACK);
    for (const obj of [
      "withdraw_agency_candidate_offer_v1",
      "submit_agency_candidate_offer_v1",
      "agency_candidate_offers",
    ]) {
      expect(rollback).toContain(obj);
    }
  });

  it("RLS is fail-closed: owner-or-request-owner SELECT, no anon, no using(true)", () => {
    expect(code).toMatch(/enable row level security/);
    expect(code).toMatch(/public\.owns_company\(company_id\)/);
    // forward-compatible: the need's owner may also read
    expect(code).toMatch(/cr\.profile_id = auth\.uid\(\)/);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
    // No insert/update/delete POLICY — writes are RPC-only.
    expect(code).not.toMatch(/for\s+(insert|update|delete)/);
  });

  it("writes are SECURITY DEFINER with a pinned search_path and PUBLIC/anon revoked", () => {
    expect(code).toMatch(/security definer/);
    expect(code).toMatch(/set search_path = public/);
    expect(code).toMatch(
      /revoke all on function public\.submit_agency_candidate_offer_v1\([^)]*\) from public/,
    );
    expect(code).toMatch(
      /revoke all on function public\.submit_agency_candidate_offer_v1\([^)]*\) from anon/,
    );
    expect(code).toMatch(
      /revoke all on function public\.withdraw_agency_candidate_offer_v1\([^)]*\) from anon/,
    );
    expect(code).toMatch(
      /grant execute on function public\.submit_agency_candidate_offer_v1\([^)]*\) to authenticated/,
    );
    // Table grant is SELECT only.
    expect(code).toMatch(
      /grant select on public\.agency_candidate_offers to authenticated/,
    );
    expect(code).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*agency_candidate_offers/,
    );
  });

  it("the submit RPC enforces EVERY authorization rule server-side", () => {
    // agency identity
    expect(code).toMatch(/company_type\s*=\s*'staffing_agency'/);
    expect(code).toMatch(/not_agency/);
    // active roster membership
    expect(code).toMatch(/company_workers/);
    expect(code).toMatch(/cw\.status\s*=\s*'active'/);
    expect(code).toMatch(/worker_not_on_roster/);
    // own need only (no foreign/unpublished need, no existence oracle)
    expect(code).toMatch(/cr\.profile_id\s*=\s*v_uid/);
    expect(code).toMatch(/request_not_found/);
  });

  it("is idempotent — unique (company_id, worker_id, request_id) + on conflict", () => {
    expect(code).toMatch(/unique \(company_id, worker_id, request_id\)/);
    expect(code).toMatch(/on conflict \(company_id, worker_id, request_id\) do update/);
  });

  it("APPLIED_LEDGER.md carries the Deferred entry", () => {
    const ledger = readRepo("docs/APPLIED_LEDGER.md");
    const deferredIdx = ledger.indexOf("## Deferred");
    const entryIdx = ledger.indexOf("20260723170000_agency_candidate_offers");
    expect(deferredIdx).toBeGreaterThan(-1);
    expect(entryIdx).toBeGreaterThan(deferredIdx);
  });

  it("the read/write layer degrades honestly (42P01/PGRST205 → needs-migration)", () => {
    expect(model).toMatch(/isMissingTableCode|isMissingRpcCode/);
    expect(lib).toMatch(/needs-migration/);
    expect(actions).toMatch(/needs-migration/);
    expect(form).toMatch(/data-testid="agency-offer-gated"/);
  });
});

describe("4. no auto-communication of any kind", () => {
  it("the slice never opens conversations, sends mail, or calls outbound APIs", () => {
    const slice = model + lib + actions + form;
    expect(slice).not.toMatch(
      /conversation|sendMessage|nodemailer|smtp|telegram|webhook|mailto:/i,
    );
    expect(slice).not.toMatch(/fetch\(/);
    expect(migration).not.toMatch(/notify|pg_net|net\.http|http_post/i);
  });
});
