import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVAL_CONFIDENCE_CAP,
  APPROVAL_CONFIDENCE_PER_ENTRY,
  APPROVAL_CONFIDENCE_WRITABLE_COLUMNS,
  approvalConfidenceBin,
  approvalConfidenceScore,
  nextStoredConfidence,
  parseApprovalConfidenceStatus,
} from "./manager-approval-confidence";

const ROOT = path.resolve(__dirname, "../../../..");
const MIGRATION = readFileSync(
  path.join(ROOT, "supabase/migrations/20261008120000_manager_approval_skill_confidence_v1.sql"),
  "utf8",
);
const read = (p: string) => readFileSync(path.join(ROOT, "apps/web", p), "utf8");

/** The SQL body of the function only, comments stripped. */
const FN = MIGRATION.slice(
  MIGRATION.indexOf("create or replace function"),
  MIGRATION.indexOf("revoke all on function"),
)
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("R-5 bounded contribution (pure)", () => {
  it("is zero with no approved entry and grows by the per-entry step", () => {
    expect(approvalConfidenceScore(0)).toBe(0);
    expect(approvalConfidenceScore(1)).toBe(APPROVAL_CONFIDENCE_PER_ENTRY);
    expect(approvalConfidenceScore(2)).toBe(2 * APPROVAL_CONFIDENCE_PER_ENTRY);
  });

  it("is bounded below the 30 substantiated band", () => {
    expect(APPROVAL_CONFIDENCE_CAP).toBeLessThan(30);
    expect(approvalConfidenceScore(1000)).toBe(APPROVAL_CONFIDENCE_CAP);
    expect(approvalConfidenceBin(approvalConfidenceScore(1000), "red")).toBe("green");
  });

  it("is idempotent: same distinct-entry set gives the same stored value", () => {
    const first = nextStoredConfidence(0, 2);
    expect(nextStoredConfidence(first, 2)).toBe(first);
    expect(nextStoredConfidence(first, 2)).toBe(nextStoredConfidence(nextStoredConfidence(first, 2), 2));
  });

  it("a second distinct approved entry increases within the bound; it never lowers", () => {
    const one = nextStoredConfidence(0, 1);
    const two = nextStoredConfidence(one, 2);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(APPROVAL_CONFIDENCE_CAP);
    expect(nextStoredConfidence(two, 0)).toBe(two);
  });

  it("ignores junk input", () => {
    expect(approvalConfidenceScore(Number.NaN)).toBe(0);
    expect(approvalConfidenceScore(-4)).toBe(0);
  });

  it("only ever writes confidence columns", () => {
    expect([...APPROVAL_CONFIDENCE_WRITABLE_COLUMNS].sort()).toEqual(
      ["confidence_bin", "confidence_score", "last_recompute_at"].sort(),
    );
  });

  it("parses the RPC status", () => {
    expect(parseApprovalConfidenceStatus("raised:2")).toEqual({ ok: true, raised: 2 });
    expect(parseApprovalConfidenceStatus("not_authorized")).toEqual({ ok: false, code: "not_authorized" });
    expect(parseApprovalConfidenceStatus(null)).toEqual({ ok: false, code: "error" });
  });
});

describe("R-5 migration guard (static)", () => {
  it("keeps the SQL constants in step with the TS constants", () => {
    expect(FN).toMatch(new RegExp(`c_per_entry constant int := ${APPROVAL_CONFIDENCE_PER_ENTRY};`));
    expect(FN).toMatch(new RegExp(`c_cap\\s+constant int := ${APPROVAL_CONFIDENCE_CAP};`));
  });

  it("the worker_skills UPDATE sets ONLY confidence columns - never verified/source/provenance", () => {
    const upd = FN.slice(FN.indexOf("update public.worker_skills"), FN.indexOf("get diagnostics"));
    const setClause = upd.slice(upd.indexOf("set"), upd.indexOf("from target"));
    const cols = [...setClause.matchAll(/^\s*(?:set\s+)?([a-z_]+)\s*=/gm)].map((m) => m[1]).sort();
    expect(cols).toEqual([...APPROVAL_CONFIDENCE_WRITABLE_COLUMNS].sort());
    expect(setClause).not.toMatch(/verified|source|provenance|verified_by|verified_at/);
    // never inserts a skill, never deletes
    expect(FN).not.toMatch(/insert into public\.worker_skills|delete from/i);
  });

  it("authorises employer reviewers only, via the shared resolver", () => {
    expect(FN).toContain("journal_entry_review_authority_v1(p_entry_id, uid)");
    expect(FN).toMatch(/is distinct from 'employer'/);
    expect(FN).not.toMatch(/client_accept/);
  });

  it("is SECURITY DEFINER with a pinned search_path and no anon/public execute", () => {
    expect(FN).toMatch(/security definer/);
    expect(FN).toMatch(/set search_path to 'public'/);
    expect(MIGRATION).toMatch(
      /revoke all on function public\.recompute_worker_skill_confidence_from_manager_approval_v1\(uuid\) from public, anon;/,
    );
    expect(MIGRATION).toMatch(/grant execute on function [^;]+ to authenticated;/);
    expect(MIGRATION).not.toMatch(/grant [^;]*[[:space:]]to[[:space:]]+(anon|public)[[:space:]]*;/i);
  });

  it("derives skills from the entry's own skill links and raise-only", () => {
    expect(FN).toMatch(/s\.journal_entry_id = p_entry_id/);
    expect(FN).toMatch(/t\.score > ws\.confidence_score/);
    expect(FN).toMatch(/jes\.created_at <= a\.first_approved_at/);
  });
});

describe("R-5 app wiring (static)", () => {
  const confirm = read("lib/journal/confirm-actions.ts");
  it("applyApprovalSkillEffects calls the definer door and never writes worker_skills", () => {
    expect(confirm).toContain("recompute_worker_skill_confidence_from_manager_approval_v1");
    expect(confirm).not.toMatch(/from\("worker_skills"\)/);
    expect(confirm).not.toMatch(/verified\s*:/);
  });
  it("single and batch approvals both raise confidence; counterparty never does", () => {
    expect(read("lib/journal/review-actions.ts")).toMatch(/applyApprovalSkillEffects\(supabase, \{ entryId/);
    expect(read("lib/journal/batch-review.ts")).toMatch(/applyApprovalSkillEffects/);
    expect(read("lib/journal/counterparty-actions.ts")).not.toMatch(/applyApprovalSkillEffects|manager_approval/);
    expect(read("lib/journal/counterparty-core.ts")).not.toMatch(/applyApprovalSkillEffects|manager_approval/);
  });
});
