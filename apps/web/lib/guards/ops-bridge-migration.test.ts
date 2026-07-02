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
    expect(guard).toMatch(/SPRINT_BASELINE = 93/);
  });
});
