import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the employment↔journal ops-bridge migration 0030 (PR A).
 * Pins that it is strictly ADDITIVE and safe — no drops, renames,
 * backfill, RLS or grant changes — and carries the agreed bridge fields
 * with a conservative role CHECK and a review-off default.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
function readRepo(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}

describe("ops-bridge migration 0030 is additive + safe", () => {
  const sql = readRepo(
    "supabase/migrations/0030_company_agency_worker_ops_bridge.sql",
  ).toLowerCase();

  it("adds the four bridge columns to BOTH relationship tables", () => {
    for (const table of ["company_workers", "agency_workers"]) {
      expect(sql).toContain(`alter table public.${table}`);
    }
    for (const col of [
      "operations_role",
      "operations_title",
      "journal_review_enabled",
      "journal_review_scope",
    ]) {
      // Added via "add column if not exists <col>" (idempotent).
      expect(sql).toMatch(
        new RegExp(`add column if not exists\\s+${col}`),
      );
    }
  });

  it("defaults journal review OFF and never auto-enables", () => {
    expect(sql).toMatch(
      /journal_review_enabled\s+boolean\s+not null\s+default\s+false/,
    );
    expect(sql).not.toMatch(/journal_review_enabled[^;]*default\s+true/);
  });

  it("constrains operations_role to the conservative value set", () => {
    for (const v of [
      "worker",
      "foreman",
      "project_manager",
      "company_admin",
      "agency_admin",
    ]) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it("performs NO destructive or RLS/grant change", () => {
    // Strip "--" line comments — the header prose legitimately mentions
    // grants/RLS while explaining the migration does NOT change them.
    const code = sql
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from/);
    // No data backfill (no UPDATE statements).
    expect(code).not.toMatch(/\bupdate\s+public\./);
    // No RLS / policy / grant changes — columns inherit existing ones.
    expect(code).not.toMatch(/create\s+policy|drop\s+policy/);
    expect(code).not.toMatch(/\bgrant\b|\brevoke\b/);
  });

  it("contract doc exists and explains the additive bridge", () => {
    const doc = readRepo(
      "docs/contracts/employment-journal-bridge-contract-v1.md",
    );
    expect(doc.length).toBeGreaterThan(1500);
    expect(doc).toMatch(/additive/i);
    expect(doc.toLowerCase()).toContain("journal_review_enabled");
    expect(doc.toLowerCase()).toContain("owner-gated");
  });

  it("the migration-count baseline guard was bumped to allow 0030", () => {
    const guard = readFileSync(
      resolve(APP, "lib", "guards", "product-readiness.test.ts"),
      "utf8",
    );
    // Bumped to 31 on the engagement-context-provisioning-rpc-v1 slice
    // (migration 0032 adds the provisioning RPCs), then to 32 on the
    // journal-review-enable-toggle-v1 slice (migration 0033), then to 33 on the
    // manager-review-evidence-result-v1 slice (migration 0034 adds the gated
    // review_journal_entry + reviewable_journal_entry_ids RPCs), then to 34 on
    // the sales-core-nonstop-v1 unblock (migration 0035 backfills org-owner
    // engagements), then to 35 (migration 0036 adds the accept-worker-invitation
    // link RPCs), then to 37 on the converge-single-product slice (two reversible
    // owner-approved migrations: drop legacy threads/messages + projects
    // organization_id FK move), then to 38 on the TASK 03 consolidation (one
    // salvaged journal_integrity_guards migration), then to 39 on the keystone
    // (TASK 01 membership_engagement_reroute), then to 40 (TASK 05
    // demand-intake consolidation), then to 41 for the journal_entry_work_items
    // RED gate (PR #196, owner-approved + applied to prod via Supabase MCP),
    // then to 42 for the project/object/client RED gate (PR #197, owner-approved
    // + applied to prod via Supabase MCP), then to 43 for the
    // journal-entry-skill-links-v1 slice (additive journal_entry_skills durable
    // evidence-support relation, committed + queued, NOT applied), then to 44
    // for the company-profile-request-v1 slice (additive company_profile_request
    // migration: org-detail columns + 4-state verification ladder +
    // save_company_setup upsert that requests but never fabricates verified;
    // committed + queued, NOT applied), then to 45 for the
    // company-verification-admin slice (additive admin_set_company_verification
    // SECURITY DEFINER RPC, admin-only + audit-logged, applied to prod after
    // owner approval), then to 46 for the company-automatic-first correction
    // (additive company_automatic_first: widen CHECK + active_unverified default
    // + automatic-status save_company_setup), then to 47 for the worker
    // work-card slice (additive 20260608120000_worker_work_card: add
    // workers.work_card_confirmed_at + owner-scoped save/confirm RPCs), then to
    // 48 for the RPC execute hardening slice (additive
    // 20260608140000_worker_work_card_execute_hardening: revoke PUBLIC/anon
    // EXECUTE on the two RPCs, keep authenticated), then to 53 for Pilot
    // Operations v2 (pilot-ops-v2-status-docs: additive operational-status +
    // readiness-checklist tables with RPC-only writes), then to 54 for
    // candidate-provider-draft-v1 (additive owner-scoped candidate_drafts table).
    // The baseline only ever grows deliberately. Then to 58 for the S2
    // esco-taxonomy-foundation set (three additive migrations: esco core
    // catalogue, esco_uri refs, candidate_skills - applied to prod via MCP
    // after owner review) on top of main's 55 (conversations-ui draft), then
    // to 59 for s3-documents-readiness (worker_documents_readiness, applied
    // to prod via MCP after owner review), then to 60 for the
    // esco-labels-all-official-languages widening DRAFT (20260610230000),
    // then to 61 for the esco-service-role-grants fix (20260610234500),
    // then to 63 at the S4 merge (project autolink body-replace +
    // market_rate_averages with the prod n>=2 fix; APPLIED 2026-06-11),
    // then to 64 for batch_journal_review (exceptions-pyramid batch confirm;
    // APPLIED 2026-06-11, ledger 20260611064423), then to 65 for the S5
    // agency-demand-visibility DRAFT (20260611150000; needs-human-gate,
    // not applied).
    // then to 66 for the confirmation-role CHECK (20260602130000;
    // APPLIED to prod 2026-06-11, ledger 20260611091834).
    // then to 67 for the S6 worker-docs-consent DRAFT (20260611170000;
    // needs-human-gate, not applied).
    // then to 69 for company-role-simplicity-v1 (20260612090000 company_type
    // + save_company_setup_v2 country validation; 20260612091000
    // journal_entry_photos free-tier photo evidence — both additive GREEN).
    // then to 70 for the RU-locale CHECK widening (20260612130000
    // widen_original_language_ru — additive GREEN, prod apply via MCP).
    // then to 71 for the chat-visibility revocation migration
    // (20260612170000 conversation_participant_revocation — RED, applied via
    // owner channel + verified, landed sync-only).
    // then to 72 for Phase A search_path hygiene (20260612180000
    // pin_function_search_path — additive GREEN, ALTER FUNCTION SET only).
    // then to 73 for Phase B1 FK indexes (20260612190000 phase_b1_fk_indexes
    // — 15 additive GREEN CREATE INDEX on active-path foreign keys).
    // then to 74 for Phase B2 FK indexes (20260612200000 phase_b2_fk_indexes
    // — 10 additive GREEN CREATE INDEX on taxonomy/reference foreign keys).
    // then to 75 for Phase B3 FK indexes (20260612210000 phase_b3_fk_indexes
    // — 24 additive GREEN CREATE INDEX, remaining person/org FKs; closes B).
    // then to 76 for Full Cycle Sprint v1 scouting (20260612220000
    // demand_shortlist — additive GREEN owner-scoped table, no existing RLS).
    // then to 79 for the pre-payment readiness sprint PR2 — three additive RED
    // migrations (worker_availability_preferences, booking_requests,
    // worker_document_verification); see product-readiness.test.ts for detail.
    // then to 80 for the Stripe test-mode sprint PR2 — one additive RED migration
    // (billing_test_mode_records: 3 test-mode billing tables).
    // then to 81 for the worker demand-visibility RPC — one additive RED
    // migration (list_open_demand_for_workers, applied to prod via MCP after
    // strict security review; read-only, worker-gated, curated non-personal).
    // then to 82 for company-demand-locations-red-draft-v1 (20260615120000
    // company_demand_locations — additive RED-draft owner-scoped geo table, the
    // first real market-map demand layer candidate; NOT applied, human-gated).
    // then to 83 for company-demand-locations-signal-only-write (20260615210000
    // — RED policy hardening: owner writes clamped to signal-only + dedup index;
    // closes the verified+coordinates direct-write bypass; NOT applied).
    // then to 84 for market-map-data-model-v1 (20260617120000 — additive RED-draft:
    // preferred_locations + consented_login_location_signals tables + additive
    // columns on company_demand_locations/projects; NOT applied, human-gated).
    // then to 85 for profile-avatar-upload-v1 (20260623200000_profile_avatar;
    // additive RED: avatar_url column + private profile-avatars bucket +
    // owner-scoped storage policies; NOT applied, human-gated).
    // then to 86 for W8 service_offerings (20260627121713_service_offerings;
    // additive RED: new owner-scoped provider service-offerings table; RLS
    // owner-scoped, grant authenticated only, no anon/public, no SECURITY
    // DEFINER, no payment columns; NOT applied, human-gated).
    // then to 87 for W6 human_in_loop_learning (20260627132759; additive RED:
    // 3 new owner/org-scoped learning tables + ONE SECURITY DEFINER RPC reusing
    // the confirmation spine under live manager authority; default-OFF policy;
    // no anon/public, no using(true), no payment; NOT applied, human-gated).
    // then to 88 for W10 projects org backfill (20260627143433; owner-approved
    // data backfill of 4 legacy draft projects to the canonical org via the
    // legacy bridge, ambiguity-guarded, reversible; APPLIED via MCP).
    // then to 89 for P0 marketplace service_offering_requests (20260627145318;
    // additive RED: discovery RLS (authenticated + active-only) + new 2-party
    // request table + 3 SECURITY DEFINER RPCs (request/respond/withdraw);
    // SELECT-only grant, no anon/public, no using(true), no payment; NOT applied).
    // then to 90 for requester identity on the provider inbox (20260627174500;
    // additive RED: ONE SECURITY DEFINER read RPC requester_identities_for_provider
    // returning ONLY buyer display name, provider-scoped; execute revoked from
    // public + granted to authenticated; no table/policy change; NOT applied).
    // then to 91 for "new since last seen" (20260627181500_service_requests_seen;
    // additive RED: one-row-per-user seen table (user_id pk + seen_at) own-row-only
    // RLS + SELECT grant, writes RPC-only, + ONE SECURITY DEFINER upsert RPC
    // mark_service_requests_seen(); no profile change, no PII; NOT applied).
    // then to 92 for the P0 admin self-promotion guard (20260702130000;
    // additive RED: BEFORE triggers on profiles.active_role /
    // profile_roles.role raising 42501 for JWT-bearing non-admin grantors;
    // closes the self-promotion hole; APPLIED to prod via MCP 2026-07-02).
    // then to 93 for worker personal-engagement provisioning (20260702140000;
    // additive RED: AFTER INSERT trigger on workers + idempotent 0013-shape
    // backfill so the journal opens for every worker's first session;
    // owner-approved apply 2026-07-02).
    // then to 94 for the pilot_events anon INSERT grant (20260702150000;
    // ONE insert-only grant to anon so pre-auth login_started lands; RLS
    // already caps anon rows to profile_id IS NULL; owner-approved apply
    // 2026-07-02).
    // then to 95 for approved-route MODEL A (20260702170000; recreate the
    // worker-demand RPC with a verified-company join + company_name +
    // route_status columns; owner-approved apply 2026-07-02).
    // then to 96 for the service-role report read grant (20260702200000;
    // SELECT on pilot_events + column-scoped profiles/profile_roles reads
    // for the local owner activation report; owner-gated).
    // then to 97 for the universal profession/skill catalogue seed
    // (20260704120000; strictly additive INSERT-only seed of 37 universal
    // skills + 17 professions + links so every profession family is
    // first-class, not construction-only; guarded-delete rollback;
    // owner-gated apply).
    // then to 98 for the truth-audit legacy-professions repair
    // (20260704130000; builder/rebar_worker/site_manager were never
    // migration-seeded — INSERT-only, idempotent, owner-gated apply).
    // then to 99 for the wave-2 catalogue expansion (20260704150000;
    // class-E labour-market gaps — office/data-entry, warehouse scanning,
    // kitchen help, repair, beauty, HR; INSERT-only, owner-gated apply).
    // then to 100 for the worker express-interest signal (20260704230000
    // demand_interest_signals; additive RED: worker-owned interest table
    // mirroring demand_shortlist, default-closed RLS + demand-owner read,
    // grant to authenticated only; APPLIED to prod via MCP 2026-07-05).
    // then to 101 for company interest acknowledgement (20260705120000;
    // additive RED: ONE ownership-checked SECURITY DEFINER RPC setting
    // reviewed/contacted only, withdrawn immutable; needs-human-gate
    // DRAFT, NOT applied).
    // then to 102 for the worker demand location label (20260705130000;
    // RED recreate of the worker-demand RPC adding ONE coarse
    // location_label column; needs-human-gate DRAFT, NOT applied).
    // Then to 103 for the customer_requests status-transition guard
    // (20260705150000; RED invoker trigger closing owner status latitude
    // to the app whitelist; needs-human-gate DRAFT, owner-gated apply).
    // Then to 104 for the §8.1 safe counterpart identity reader
    // (20260705170000; RED: ONE SECURITY DEFINER read RPC returning ONLY
    // the counterpart display name of a 2-person direct conversation the
    // caller belongs to; needs-human-gate DRAFT, owner-gated apply).
    // Then to 105 for the §8.5 transport demand enum (20260705200000;
    // RED: gated recreate of the worker-demand RPC adding ONE
    // strict-whitelist transport column from payload.transport — the
    // accommodation enum path cloned; needs-human-gate DRAFT, owner-gated).
    // Then to 106 for the §8.6 equipment/tools layer (20260705210000;
    // RED: gated recreate of the worker-demand RPC adding ONE
    // strict-whitelist required_tools slug-list column from
    // payload.required_tools — EXISTING taxonomy slugs only, no new
    // taxonomy; needs-human-gate DRAFT, owner-gated).
    // Then to 107 for the §8.3 teams/brigades minimum (20260705220000;
    // RED-class definer functions but NO recreate of any existing RPC:
    // additive organization_type widening ('team') + NEW create_team_v1 /
    // get_team_capability_summary_v1 on the existing org spine; membership
    // stays the existing add_org_member engagement path; needs-human-gate
    // DRAFT, owner-gated).
    // Then to 108 for the §8.8 handover passport shell (20260705230000;
    // RED-class definer function but NO recreate of any existing RPC: ONE
    // new append-only project_handover_entries table (manager-only select
    // via can_manage_project, RPC-only writes) + NEW
    // add_project_handover_entry_v1 on the existing project spine;
    // needs-human-gate DRAFT, owner-gated).
    // Then to 109 for the §8.13 internal follow-up task queue
    // (20260705235000; RED-class definer functions but NO recreate of any
    // existing RPC: ONE new follow_up_tasks table (admin-only select via
    // is_admin, RPC-only writes, honest pending/done/dismissed lifecycle,
    // NO external transport) + NEW create_follow_up_task_v1 /
    // set_follow_up_task_status_v1; needs-human-gate DRAFT, owner-gated).
    // Then to 110 for the WAGON 8 project work gallery read scope
    // (20260705250000; ADDITIVE ONLY: two SELECT policies mirroring the
    // journal_entries manager boundary onto journal_entry_photos + the
    // private storage bucket — no new table/bucket/RPC, no writes widened;
    // owner-gated apply).
    // Then to 111 for the WAGON 10 help-request intake (20260705260000;
    // RED-class definer function but NO recreate of any existing object:
    // ONE new-name RPC submit_help_request_v1 inserting typed help rows on
    // the EXISTING customer_requests table at 'in_review';
    // @human-gate-approved, owner-gated apply).
    // Then to 112 for the booking-responses seen model (20260706120000
    // booking_requests_seen, audit PR5) — additive per-user seen table +
    // gated upsert RPC mirroring the marketplace seen twin; DRAFT,
    // @human-gate-approved, owner-gated apply.
    // Then to 113 for the privacy-request intake (20260706150000, quality-
    // train PR G) — one NEW-name gated RPC on the EXISTING customer_requests
    // intake, help-request twin; DRAFT, needs-human-gate.
    // Then to 114 for the owner-approved conversation source relation
    // (20260706210000) — two nullable columns on conversations + one
    // participant-scoped SECURITY DEFINER reader RPC; DRAFT,
    // needs-human-gate, owner-gated apply.
    // Then to 115 for the anonymous company-need public intake
    // (20260707120000 company_need_public_intake) — ONE new dedicated
    // write-only table (RLS on, NO anon/authenticated policy) + ONE new
    // SECURITY DEFINER RPC (submit_company_need_public_v1) granted to anon;
    // customer_requests untouched; DRAFT, needs-human-gate, owner-gated apply.
    // Then to 116 for consent-and-disclosure v1 (20260711130000
    // privacy_consent_and_disclosure_v1) — owner-authorized in the consent
    // goal command: append-only consent + disclosure ledgers, fail-closed
    // employer RLS swap, narrow SECURITY DEFINER RPCs (authenticated only);
    // @human-gate-approved; paired rollback; applied via Supabase MCP.
    // Then to 119 for worker demand structured_v2 exposure (20260711330000,
    // PR #730) — owner-authorized migration-activation programme; APPLIED to
    // production 2026-07-11 (ledger 20260711203058); paired rollback.
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
    // Bumped 125 -> 127 for the user-journey root-cause repair v1 drafts
    // (20260712120000_journal_entry_restore +
    // 20260712130000_conversation_message_attachments) — both DRAFT /
    // needs-human-gate, NOT applied; paired rollbacks in the PR.
    // Bumped 127 -> 128 for the canonical invitations draft
    // (20260712200000_canonical_invitations_v1) - core-network area B;
    // DRAFT / needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 128 -> 129 for the company operating geography draft
    // (20260713120000_company_locations_v1, production UX repair v2) —
    // DRAFT / needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 129 -> 130 for the staffing-agency client records draft
    // (20260713160000_agency_clients_v1, canonical journey P5) —
    // DRAFT / needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 130 -> 131 for the intake service-role grants draft
    // (20260713190000, canonical journey P3 defect fix) — DRAFT /
    // needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 131 -> 132 for the multi-source talent draft
    // (20260713210000_multi_source_talent_v1, Labour Market OS P5–P7) —
    // DRAFT / needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 132 -> 133 for the AI Router v1 run-audit draft
    // (20260714150000_ai_runs_audit_v1, append-only ai_runs log) —
    // DRAFT / needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 133 -> 135 for the Full CV System v1 drafts (20260714160000 +
    // 20260714161000) — DRAFT / needs-human-gate, NOT applied; paired
    // rollbacks in the PR.
    // Bumped 135 -> 136 for the Job Recommendation seen-marker draft
    // (20260714170000_worker_opportunity_seen_v1) — DRAFT /
    // needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 136 -> 137 for the Journal Proof Engine template registry
    // draft (20260714180000_journal_profession_templates_v1) — DRAFT /
    // needs-human-gate, NOT applied; paired rollback in the PR.
    // Bumped 137 -> 139 for the Company Architecture Completion v1 drafts
    // (20260714210000_company_memberships_v1 +
    // 20260714211000_dashboard_preferences_v1) — DRAFT / needs-human-gate,
    // NOT applied; paired rollbacks in the PR.
    // Bumped 139 -> 140 for the Labour Market Intelligence layer v1 draft
    // (20260714230000_market_intelligence_observations_v1) — DRAFT /
    // needs-human-gate, NOT applied; this cross-pin follows the
    // product-readiness baseline bump made with that layer.
    // Bumped 140 -> 142 for the Wagon 1 worker-discovery-consent drafts
    // (20260716120000_contact_disclosure_requests_v1 +
    // 20260716121000_request_rate_limits_v3) — DRAFT / needs-human-gate,
    // NOT applied; paired rollbacks in the PR.
    // Bumped 142 -> 144 for the Trust Connect Teams v1 drafts
    // (20260716130000_team_profile_details_v1 +
    // 20260716131000_team_enquiries_v1) — DRAFT / needs-human-gate, NOT
    // applied; paired rollbacks in the PR.
    // Bumped 144 -> 145 for Pilot Onboarding and Measurement v1
    // (20260716140000_pilots_cohort_v1) — DRAFT / needs-human-gate, NOT
    // applied; cross-pin follows the product-readiness baseline bump.
    // Bumped 145 -> 147 for Open Markets Update v1 (#794 drift repair,
    // 20260717130000_open_markets_countries_draft_v1) + Canonical Ideas
    // Integration v1 (20260717150000_demand_interest_seen_v1). Both DRAFT /
    // needs-human-gate, NOT applied; cross-pin follows product-readiness.
    // Bumped 147 -> 148 for Wagon 6 Project Operations Core slice 1
    // (20260718140000_project_operations_stages). Cross-pin follows.
    // Bumped 148 -> 149 for Wagon 7 Workforce (Leave/Absence). Cross-pin follows.
    // Bumped 149 -> 150 for Wagon 8 Project Economics (project_budgets).
    // Bumped 150 -> 151 for Wagon 9 Assets & Logistics.
    // Bumped 151 -> 152 for the Wagon 9 assets RLS recursion fix.
    // Bumped 152 -> 153 for Wagon 10 Commercial CRM.
    // Bumped 153 -> 154 for Wagon 11 Delivery & Quality.
    // Bumped 154 -> 155 for Wagon 13 Marketplace — work-resource listings.
    // Bumped 155 -> 156 for Wagon 13 slice 2 — public business profile.
    // Bumped 156 -> 157 for the P1 journal-recall repair (vehicle-cleaning seed).
    // Bumped 157 -> 158 for W0 atomic supersede (function-only, paired rollback).
    // Bumped 158 -> 159 for W1 photo continuity (function-only, paired rollback).
    // Bumped 159 -> 160 for the W1 stale learning lifecycle (function+trigger
    // only, additive, paired rollback).
    // Bumped 160 -> 161 for LMC Wagon 1 (immutable LMC ledger foundation).
    // Bumped 161 -> 162 for the P0 anon SECURITY DEFINER authorization-bypass
    // fix (20260722120000) — function bodies + EXECUTE grants only, paired
    // rollback, RED / human-gated, ships UNAPPLIED.
    // Bumped 162 -> 163 for the P0 follow-up revoke of anonymous reachability
    // on the remaining 43 SECURITY DEFINER functions (20260722160000) —
    // EXECUTE grants only, no function body touched, paired rollback, RED and
    // deliberately NOT human-gate-annotated because the owner has not approved
    // it. Ships UNAPPLIED.
    // Bumped 163 -> 164 for the worker contact-employer owner-resolution RPC
    // (20260723053000_contact_demand_owner_v1) — function-only read RPC,
    // paired rollback, human-gated (owner-instructed annotation 2026-07-23
    // after the green security matrix), ships UNAPPLIED.
    // Bumped 164 -> 165 for the REAL two-subject agency->client bridge
    // (20260723180000_agency_real_client_bridge_v1, issue #859); owner-gated
    // DRAFT, RED CI by design, UNAPPLIED.
    // Bumped 165 -> 166 for the booking-engagement bridge
    // (20260723120000_company_worker_engagements_v1) — new engagement table +
    // four RPCs, paired rollback, RED and deliberately NOT
    // human-gate-annotated. Ships UNAPPLIED.
    // Bumped 166 -> 167 for the security-audit grant-hygiene migration
    // (20260727120000_secdef_public_grant_hygiene_v1) — audit L-01 + L-08,
    // revoke-only, paired rollback, human-gate-annotated, ships UNAPPLIED.
    //
    // ...and changed from an EXACT literal match to a numeric floor while doing
    // so. This assertion exists to prove the baseline is high enough for
    // migration 0030 to exist; pinning the exact number meant every unrelated,
    // legitimate migration anywhere in the repo broke this test and had to
    // update a second file in lockstep (that is why the 164 -> 165 -> 166 trail
    // above exists). A floor keeps the real property — the baseline can never
    // drop below what 0030 needs — without the false coupling. Lowering it still
    // fails here, and an unexplained RAISE is still caught by the documented
    // bump-comment convention in product-readiness.test.ts itself.
    // Cross-pin follows: 199 -> 201 for the Document & Evidence Engine v1
    // pair (20260817120000 + 20260817121000) — floor semantics unchanged.
    const baseline = Number(/SPRINT_BASELINE = (\d+)/.exec(guard)?.[1] ?? 0);
    expect(
      baseline,
      "product-readiness.test.ts SPRINT_BASELINE not found — the migration-count " +
        "baseline guard was renamed or removed, so nothing pins migration 0030 any more",
    ).toBeGreaterThan(0);
    expect(
      baseline,
      `SPRINT_BASELINE is ${baseline}, below the 166 that migration 0030 requires`,
    ).toBeGreaterThanOrEqual(166);
  });
});
