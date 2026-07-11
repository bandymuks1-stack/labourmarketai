import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map read layer v1 guard.
 *
 * Locks the v1 contract: a pure normalization/visibility/aggregation engine +
 * an owner-scoped fetcher, with NO UI wiring, NO privileged cross-user read,
 * and NO new DB migration.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MODEL = read("lib/market-map/signal-model.ts");
const FETCHER = read("lib/market-map/signals.ts");

describe("pure engine exports the contract", () => {
  it("normalized shape carries every required field", () => {
    for (const f of [
      "signalId",
      "signalType",
      "ownerType",
      "country",
      "region",
      "city",
      "granularity",
      "visibilityLevel",
      "aggregatedCount",
      "canShowExact",
      "sourceStatus",
      "updatedAt",
    ]) {
      expect(MODEL, `field ${f}`).toMatch(new RegExp(`\\b${f}\\b`));
    }
  });
  it("covers the six signal types", () => {
    for (const t of [
      "profile_location",
      "company_location",
      "login_location",
      "preferred_location",
      "company_need_location",
      "project_location",
    ]) {
      expect(MODEL).toContain(`"${t}"`);
    }
  });
  it("exposes the visibility + aggregation functions", () => {
    for (const fn of ["selfSignalsForViewer", "isShareable", "aggregateSignals", "marketSignals"]) {
      expect(MODEL).toMatch(new RegExp(`export function ${fn}`));
    }
    expect(MODEL).toMatch(/DEFAULT_MIN_BUCKET/);
  });
});

describe("owner-scoped fetcher — RLS only, no privileged cross-user read", () => {
  it("is server-only and reads all six sources scoped to the caller", () => {
    expect(FETCHER).toMatch(/server-only/);
    for (const src of [
      "profiles",
      "companies",
      "preferred_locations",
      "consented_login_location_signals",
      "company_demand_locations",
      "projects",
    ]) {
      expect(FETCHER).toContain(`"${src}"`);
    }
  });
  it("uses the RLS client (no service_role, no SECURITY DEFINER RPC)", () => {
    expect(FETCHER).toMatch(/@\/lib\/supabase\/server/);
    expect(FETCHER).not.toMatch(/service_role|SERVICE_ROLE|admin\b|createServiceClient/);
    expect(FETCHER).not.toMatch(/\.rpc\(/);
  });
  it("login signal can never carry an exact point", () => {
    // In the login branch, canShowExact is hard-coded false.
    expect(FETCHER).toMatch(/canShowExact:\s*false,\s*\/\/ login is never an exact point/);
  });
});

describe("owner view wired; public/cross-user aggregate NOT", () => {
  const SHELL = read("components/app/market-map-shell.tsx");
  it("the shell wires the OWNER read layer (getOwnMarketSignals)", () => {
    expect(SHELL).toMatch(/getOwnMarketSignals/);
    expect(SHELL).toMatch(/MarketMapMySignals/);
  });
  it("the owner-view component takes data via props, not the server fetcher", () => {
    const my = read("components/app/market-map-my-signals.tsx");
    expect(my).not.toMatch(/from\s+"@\/lib\/market-map\/signals"/);
    expect(my).not.toMatch(/getOwnMarketSignals/);
  });
  it("NO component uses the public/cross-user aggregate (marketSignals)", () => {
    const compDir = join(APP, "components", "app");
    const offenders = readdirSync(compDir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /\bmarketSignals\b/.test(readFileSync(join(compDir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("NO new DB migration in this PR", () => {
  it("adds no migration file (read layer is pure TS on existing tables)", () => {
    const dir = join(REPO, "supabase", "migrations");
    const count = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".sql")).length
      : 0;
    // 87 = baseline after W6 human_in_loop_learning (20260627132759) — ONE
    // additive RED migration, human-gated, NOT applied (previous: 86 for W8
    // service_offerings). The read layer itself adds no migration; the global
    // baseline only grows deliberately.
    // Bumped 91 -> 92 for the P0 admin self-promotion guard
    // (20260702130000_admin_grant_guard) — APPLIED to prod via MCP 2026-07-02.
    // Bumped 92 -> 93 for the worker personal-engagement provisioning draft
    // (20260702140000_worker_personal_engagement) — owner-approved apply.
    // Bumped 93 -> 94 for the pilot_events anon INSERT grant
    // (20260702150000) — owner-approved apply 2026-07-02.
    // Bumped 94 -> 95 for approved-route MODEL A (20260702170000) —
    // owner-approved apply 2026-07-02.
    // Bumped 95 -> 96 for the service-role report read grant
    // (20260702200000) — owner-gated apply.
    // Bumped 96 -> 97 for the universal profession/skill catalogue seed
    // (20260704120000) — strictly additive INSERT-only, owner-gated apply.
    // Bumped 97 -> 98 for the truth-audit legacy-professions repair
    // (20260704130000) — INSERT-only, idempotent, owner-gated apply.
    // Bumped 98 -> 99 for the wave-2 catalogue expansion (20260704150000,
    // class-E labour-market gaps) — INSERT-only, idempotent, owner-gated.
    // Bumped 99 -> 100 for the worker express-interest signal
    // (20260704230000 demand_interest_signals) — additive worker-owned
    // table, applied to prod via MCP 2026-07-05.
    // Bumped 100 -> 101 for company interest acknowledgement
    // (20260705120000) — one gated SECURITY DEFINER RPC, owner-gated apply.
    // Bumped 101 -> 102 for the worker demand location label
    // (20260705130000) — gated RPC recreate, owner-gated apply.
    // Bumped 102 -> 103 for the customer_requests status-transition guard
    // (20260705150000) — invoker trigger closing owner status latitude to
    // the app whitelist; @human-gate-approved, owner-gated apply.
    // Bumped 103 -> 104 for the §8.1 safe counterpart identity reader
    // (20260705170000) — one gated SECURITY DEFINER read RPC (display name
    // only, direct 2-person threads); @human-gate-approved, owner-gated.
    // Bumped 104 -> 105 for the §8.5 transport demand enum (20260705200000)
    // — gated RPC recreate projecting payload.transport through a strict
    // enum whitelist; @human-gate-approved, owner-gated apply.
    // Bumped 105 -> 106 for the §8.6 equipment/tools layer (20260705210000)
    // — gated RPC recreate projecting payload.required_tools through a
    // strict EXISTING-taxonomy slug whitelist; @human-gate-approved,
    // owner-gated apply.
    // Bumped 106 -> 107 for the §8.3 teams/brigades minimum (20260705220000)
    // — additive organization_type widening ('team') + two NEW gated RPCs
    // (create_team_v1 / get_team_capability_summary_v1) on the existing org
    // spine; no existing RPC recreated; @human-gate-approved, owner-gated
    // apply.
    // Bumped 107 -> 108 for the §8.8 handover passport shell (20260705230000)
    // — ONE new append-only table (project_handover_entries, manager-only
    // RLS) + ONE new gated write RPC (add_project_handover_entry_v1) on the
    // existing project spine; no existing RPC recreated;
    // @human-gate-approved, owner-gated apply.
    // Bumped 108 -> 109 for the §8.13 internal follow-up task queue
    // (20260705235000) — ONE new table (follow_up_tasks, admin-only RLS,
    // honest pending/done/dismissed lifecycle, no external sending) + TWO
    // new gated write RPCs (create_follow_up_task_v1 /
    // set_follow_up_task_status_v1); no existing RPC recreated;
    // @human-gate-approved, owner-gated apply.
    // Bumped 109 -> 110 for the WAGON 8 project work gallery read scope
    // (20260705250000) — ADDITIVE ONLY: two SELECT policies mirroring the
    // existing journal_entries manager boundary (manages_organization via
    // the entry's engagement context) onto journal_entry_photos + the
    // private storage bucket; no new table/bucket/RPC, no write access;
    // owner-gated apply.
    // Bumped 110 -> 111 for the WAGON 10 help-request intake
    // (20260705260000) — one NEW-name SECURITY DEFINER RPC
    // (submit_help_request_v1) inserting a typed row on the EXISTING
    // customer_requests table at status 'in_review'; no table/policy
    // change, no recreate; @human-gate-approved, owner-gated apply.
    // Bumped 111 -> 112 for the booking-responses seen model
    // (20260706120000 booking_requests_seen) — additive single-purpose
    // per-user seen table + gated upsert RPC, mirrors the marketplace seen
    // twin exactly; DRAFT, @human-gate-approved, owner-gated apply
    // (audit PR5: booking responses were silent for the proposer).
    // Bumped 112 -> 113 for the privacy-request intake (20260706150000,
    // quality-train PR G) — one NEW-name gated RPC
    // (submit_privacy_request_v1) on the EXISTING customer_requests intake,
    // exact twin of the help-request RPC; DRAFT, needs-human-gate,
    // owner-gated apply; nothing destructive, no notification machinery.
    // Bumped 113 -> 114 for the owner-approved conversation source relation
    // (20260706210000) — two nullable columns + one participant-scoped
    // SECURITY DEFINER reader RPC; DRAFT needs-human-gate, owner-gated
    // apply (NOT part of the market-map read layer, which stays pure TS).
    // Bumped 114 -> 115 for the anonymous company-need public intake
    // (20260707120000 company_need_public_intake) — ONE new dedicated
    // write-only table (RLS on, NO anon/authenticated policy) + ONE new
    // SECURITY DEFINER RPC (submit_company_need_public_v1) granted to anon;
    // customer_requests untouched; DRAFT needs-human-gate, owner-gated apply
    // (NOT part of the market-map read layer, which stays pure TS).
    // Bumped 118 -> 119 for worker demand structured_v2 exposure
    // (20260711330000 worker_demand_structured_v2_exposure, PR #730) —
    // owner-authorized in the migration-activation goal command and APPLIED
    // to production 2026-07-11 (ledger 20260711203058): one IMMUTABLE
    // whitelist projection helper + the worker board RPC recreated with one
    // structured jsonb column; paired rollback restores the prior RPC verbatim.
    expect(count).toBeLessThanOrEqual(119);
  });
});
