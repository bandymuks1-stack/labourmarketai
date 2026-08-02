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
    // Bumped 119 -> 120 for worker_languages_v1 (20260711250000, PR #720; ledger 20260711203623) — owner-authorized
    // migration-activation programme; APPLIED to production 2026-07-11;
    // paired rollback in the PR.
    // Bumped 120 -> 121 for worker_preference_columns_v2 (20260711270000, PR #721; ledger 20260711204006) — owner-authorized
    // migration-activation programme; APPLIED to production 2026-07-11;
    // paired rollback in the PR.
    // Bumped 121 -> 122 for worker_saved_opportunities_v1 (20260711310000, PR #723; ledger 20260711204106) — owner-authorized
    // migration-activation programme; APPLIED to production 2026-07-11;
    // paired rollback in the PR.
    // Bumped 122 -> 123 for booking_lifecycle_v2 (20260711290000, PR #722; ledger 20260711204354) — owner-authorized
    // migration-activation programme; APPLIED to production 2026-07-11;
    // paired rollback in the PR.
    // Bumped 123 -> 124 for work_tasks_v1 (20260711210000, PR #708; ledger 20260711204521) — owner-authorized
    // migration-activation programme; APPLIED to production 2026-07-11;
    // paired rollback in the PR.
    // Bumped 124 -> 125 for finance_records_v1 (20260711230000, PR #714; ledger 20260711204634) — owner-authorized
    // migration-activation programme; APPLIED to production 2026-07-11;
    // paired rollback in the PR.
    // Bumped 125 -> 127 for the user-journey root-cause repair v1 drafts:
    // 20260712120000_journal_entry_restore (undo half of the honest delete
    // contract) + 20260712130000_conversation_message_attachments (private
    // participant-scoped message attachments). Both DRAFT / needs-human-gate,
    // NOT applied; paired rollbacks in the PR.
    // Bumped 127 -> 128 for the canonical invitations draft
    // (20260712200000_canonical_invitations_v1): typed invitations with
    // hashed tokens whose acceptance creates the CANONICAL relationship
    // (engagement_contexts / project_worker_assignments). DRAFT /
    // needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 128 -> 129 for the company operating geography draft
    // (20260713120000_company_locations_v1, production UX repair v2
    // F12.4/5): HQ / operating locations / desired markets with fail-closed
    // owner-only RLS and RPC-only writes. DRAFT / needs-human-gate, NOT
    // applied; paired rollback + deferred APPLIED_LEDGER entry in the PR.
    // Bumped 129 -> 130 for the staffing-agency client records draft
    // Bumped 130 -> 131 for the service-role grants draft
    // (20260713190000_company_need_intake_service_grants — fixes the
    // production permission-denied defect on the intake table; DRAFT /
    // needs-human-gate, NOT applied; paired rollback in the PR).
    // (20260713160000_agency_clients_v1, canonical journey P5): agency
    // client CRM rows + ONE additive customer_requests.agency_client_id FK,
    // fail-closed owner-only RLS and RPC-only writes. DRAFT /
    // needs-human-gate, NOT applied; paired rollback + deferred
    // APPLIED_LEDGER entry in the PR.
    // Bumped 131 -> 132 for the multi-source talent draft
    // (20260713210000_multi_source_talent_v1, Labour Market OS P5–P7):
    // provenance ledger + worker external profiles + append-only
    // identity-resolution audit; fail-closed RLS, RPC-only writes. DRAFT /
    // needs-human-gate, NOT applied; paired rollback + deferred
    // APPLIED_LEDGER entry in the PR.
    // Bumped 132 -> 133 for the AI Router v1 run-audit draft
    // (20260714150000_ai_runs_audit_v1): APPEND-ONLY ai_runs log of live AI
    // agent runs (admin-only SELECT, service-role-only writes, UPDATE/DELETE
    // revoked for every role). DRAFT / needs-human-gate, NOT applied; paired
    // rollback + deferred APPLIED_LEDGER entry in the PR.
    // Bumped 133 -> 135 for the Full CV System v1 drafts
    // (20260714160000_worker_education_achievements_v1 +
    // 20260714161000_self_declared_work_history_v1): owner-only education/
    // achievements stores + self-declared work-history RPCs. DRAFT /
    // needs-human-gate, NOT applied; paired rollbacks + deferred
    // APPLIED_LEDGER entries.
    // Bumped 135 -> 136 for the Job Recommendation seen-marker draft
    // (20260714170000_worker_opportunity_seen_v1): ONE first-seen table +
    // gated mark RPC powering the honest "new matches" spine count. DRAFT /
    // needs-human-gate, NOT applied; paired rollback + deferred
    // APPLIED_LEDGER entry.
    // Bumped 136 -> 137 for the Journal Proof Engine template registry draft
    // (20260714180000_journal_profession_templates_v1): ONE §10 slug
    // registry table (all seeds inactive; admin-only writes; authenticated
    // read of active rows). DRAFT / needs-human-gate, NOT applied; paired
    // rollback + deferred APPLIED_LEDGER entry.
    // Bumped 137 -> 139 for the Company Architecture Completion v1 drafts
    // (20260714210000_company_memberships_v1 — active-organization pointer
    // on the EXISTING membership model + validation triggers + viewer slug;
    // 20260714211000_dashboard_preferences_v1 — owner-only server-side
    // dashboard card preferences, 8 KB bound). Both DRAFT /
    // needs-human-gate, NOT applied; paired rollbacks + deferred
    // APPLIED_LEDGER entries.
    // Bumped 139 -> 140 for the Labour Market Intelligence layer v1 draft
    // (20260714230000_market_intelligence_observations_v1 — source registry,
    // observation contract, insight query log; all external sources OFF).
    // DRAFT / needs-human-gate, NOT applied; paired rollback.
    // Bumped 140 -> 142 for the Wagon 1 worker-discovery-consent drafts
    // (20260716120000_contact_disclosure_requests_v1 +
    // 20260716121000_request_rate_limits_v3). Both DRAFT / needs-human-gate,
    // NOT applied; paired rollbacks.
    // Bumped 142 -> 144 for the Trust Connect Teams v1 drafts
    // (20260716130000_team_profile_details_v1 — 1:1 team-scoped
    // availability/deployable-size/destinations details, RPC-only writes;
    // 20260716131000_team_enquiries_v1 — employer→team enquiry state
    // machine on the shared contact/consent contract, append-only events).
    // Both DRAFT / needs-human-gate, NOT applied; paired rollbacks.
    // Bumped 144 -> 145 for Pilot Onboarding and Measurement v1
    // (20260716140000_pilots_cohort_v1 — admin-only pilots /
    // pilot_participants / append-only pilot_outcomes, RPC-only writes).
    // DRAFT / needs-human-gate, NOT applied; paired rollback.
    // Bumped 145 -> 146 for Open Markets Update v1
    // (20260717130000_open_markets_countries_draft_v1 — six additive
    // `countries` reference rows GE/BE/FR/ES/AT/CH, on conflict do nothing).
    // DRAFT / needs-human-gate, NOT applied; paired rollback.
    // Bumped 146 -> 147 for Canonical Ideas Integration v1
    // (20260717150000_demand_interest_seen_v1 — worker-only seen-model for
    // demand_interest_signals ack notifications, RPC-only writes).
    // DRAFT / needs-human-gate, NOT applied; paired rollback.
    // Bumped 147 -> 148 for Wagon 6 Project Operations slice 1
    // (20260718140000_project_operations_stages). RED / owner-authorized.
    // Bumped 148 -> 149 for Wagon 7 Workforce (Leave/Absence).
    // Bumped 149 -> 150 for Wagon 8 Project Economics (project_budgets).
    // Bumped 150 -> 151 for Wagon 9 Assets & Logistics.
    // Bumped 151 -> 152 for the Wagon 9 assets RLS recursion fix.
    // Bumped 152 -> 153 for Wagon 10 Commercial CRM.
    // Bumped 153 -> 154 for Wagon 11 Delivery & Quality.
    // Bumped 154 -> 155 for Wagon 13 Marketplace — work-resource listings.
    // Bumped 155 -> 156 for Wagon 13 slice 2 — public business profile.
    // Bumped 156 -> 157 for the P1 journal-recall repair (additive
    // vehicle-cleaning skill seed, 20260719150000). GREEN / paired rollback.
    // Bumped 157 -> 158 for W0 atomic supersede (function-only migration
    // 20260720100000_journal_atomic_supersede_v1, paired rollback).
    // Bumped 158 -> 159 for W1 photo continuity (20260720150000, paired rollback).
    // Bumped 159 -> 160 for the W1 stale learning lifecycle (20260720170000,
    // paired rollback) — still no migration from the market-map read layer.
    // Bumped 160 -> 161 for LMC Wagon 1 — immutable LMC ledger foundation
    // (20260720190000_lmc_ledger_foundation_v1, paired rollback). RED /
    // human-gated DRAFT, ships UNAPPLIED; still no migration from the
    // market-map read layer.
    // Bumped 161 -> 162 for the P0 anon SECURITY DEFINER authorization-bypass
    // fix (20260722120000_secdef_anon_authz_bypass_fix_v1, paired rollback).
    // RED / human-gated, ships UNAPPLIED; still no migration from the
    // market-map read layer.
    // Bumped 162 -> 163 for the P0 follow-up revoke of anonymous reachability
    // on the remaining 43 SECURITY DEFINER functions
    // (20260722160000_secdef_anon_reach_revoke_v1, paired rollback). RED,
    // ships UNAPPLIED and deliberately NOT human-gate-annotated — the owner
    // has not approved it. Grant-only: no table, policy or body is touched,
    // and still no migration from the market-map read layer.
    // Bumped 163 -> 164 for the worker contact-employer owner-resolution RPC
    // (20260723053000_contact_demand_owner_v1, paired rollback). Function-only
    // read RPC, human-gated (owner-instructed annotation 2026-07-23 after the
    // green security matrix), ships UNAPPLIED; still no migration from the
    // market-map read layer.
    // Bumped 164 -> 165 for the REAL two-subject agency->client bridge
    // (20260723180000_agency_real_client_bridge_v1, issue #859); owner-gated
    // DRAFT, RED CI by design, UNAPPLIED; no migration from the read layer.
    // Bumped 165 -> 166 for the booking-engagement bridge
    // (20260723120000_company_worker_engagements_v1, paired rollback). New
    // engagement table + four RPCs closing the accepted-booking →
    // project-assignment P1; RED, deliberately NOT human-gate-annotated,
    // ships UNAPPLIED; still no migration from the market-map read layer.
    // Bumped 166 -> 167 for the security-audit grant-hygiene migration
    // (20260727120000_secdef_public_grant_hygiene_v1, paired rollback). Audit
    // L-01 + L-08: revokes the residual default PUBLIC EXECUTE grant left on
    // three SECURITY DEFINER functions by 20260719120000 (the exact idiom behind
    // the 2026-07-22 P0) and pins one trigger's search_path. It only ever
    // REMOVES privilege; human-gate-annotated, RED by design, ships UNAPPLIED.
    // Still no migration from the market-map read layer.
    // Bumped 167 -> 168 for journal_entry_skills link provenance
    // (20260727180000_journal_entry_skill_provenance_v1, paired rollback).
    // ONE additive nullable checked column, GREEN (no grants, no RLS change,
    // no drops, no DML), UNAPPLIED at merge; per the doctrine's conditional
    // prod-apply autonomy a GREEN classification permits MCP apply_migration
    // after merge. Still no migration from the market-map read layer.

    // Bumped 168 -> 169 for W9 slice 1 organization membership revocation
    // (20260802160000_org_membership_revocation_v1, paired rollback). ONE new
    // SECURITY DEFINER function on the engagement_contexts membership spine;
    // RED by classification (SECURITY DEFINER + GRANT), UNAPPLIED at merge,
    // owner-gated. Still no migration from the market-map read layer.
    // Bumped 169 -> 170 for W12 Slice 1 atomic double-booking prevention
    // (20260802150000_booking_atomic_double_booking_v1, paired rollback).
    // Row lock + worker-scoped advisory lock + status-guarded UPDATE in the ONE
    // canonical accept RPC (v3; v1/v2 become thin delegators) plus a PARTIAL
    // `EXCLUDE USING gist` invariant. RED by design, deliberately NOT
    // human-gate-annotated, ships UNAPPLIED. Still no migration from the
    // market-map read layer.
    expect(count).toBeLessThanOrEqual(170);
  });
});
