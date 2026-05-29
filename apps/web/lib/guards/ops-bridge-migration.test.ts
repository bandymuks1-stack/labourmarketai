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
    expect(guard).toMatch(/SPRINT_BASELINE = 29/);
  });
});
