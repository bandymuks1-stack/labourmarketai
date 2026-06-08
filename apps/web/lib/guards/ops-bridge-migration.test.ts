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
    // workers.work_card_confirmed_at + owner-scoped save/confirm RPCs). The
    // baseline only ever grows deliberately.
    expect(guard).toMatch(/SPRINT_BASELINE = 47/);
  });
});
