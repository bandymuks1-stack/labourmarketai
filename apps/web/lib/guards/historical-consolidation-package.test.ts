import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The historical consolidation package (owner 2026-10-14) may change ONE
 * thing — which project row a group of imported rows counts toward — and
 * must prove in the same transaction that nothing else moved. These pins keep
 * that true for any later edit of the files.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");
const LEDGER = read("supabase/migrations/20261014090000_historical_consolidation_ledger_v1.sql");
const PACKAGE = read("supabase/migrations/20261014090100_historical_consolidation_package_v1.sql");
const PACKAGE_DOWN = read("supabase/rollbacks/20261014090100_historical_consolidation_package_v1.down.sql");
const LEDGER_DOWN = read("supabase/rollbacks/20261014090000_historical_consolidation_ledger_v1.down.sql");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("consolidation package: records are never written", () => {
  it("no INSERT / UPDATE / DELETE touches evidence records, work objects or people", () => {
    for (const sql of [PACKAGE, PACKAGE_DOWN]) {
      expect(code(sql)).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.(organization_evidence_records|work_objects|organization_people|organization_evidence_events)\b/i);
      expect(code(sql)).not.toMatch(/\bdelete\s+from\b/i);
      expect(code(sql)).not.toMatch(/\bdrop\s+(table|column)\b/i);
    }
  });

  it("checksums before and after — records, hours, people, record fingerprints, project rows, work objects — or the transaction aborts", () => {
    const c = code(PACKAGE);
    for (const v of ["b_records", "b_hours", "b_people", "b_fp", "b_projects", "b_objects"]) expect(c).toContain(v);
    expect(c).toMatch(/md5\(string_agg\(coalesce\(record_fingerprint, id::text\), ',' order by id\)\)/);
    expect(c).toMatch(/is distinct from \(b_records, b_hours, b_people, b_fp, b_projects, b_objects\)/);
    expect(c).toMatch(/raise exception 'consolidation package v1: checksum changed/);
  });

  it("every group size is asserted, and the total merged count", () => {
    const c = code(PACKAGE);
    for (const expected of ["n <> 180", "n <> 40", "n <> 13", "n <> 10", "n <> 8", "n <> 95"]) expect(c).toContain(expected);
  });

  it("idempotent, and skipped where the organization does not exist (clean db reset / CI)", () => {
    expect(PACKAGE).toMatch(/organization absent — skipped/);
    expect(PACKAGE).toMatch(/already applied — nothing to do/);
  });

  it("each merge is audited and recorded in the ledger with its reasons", () => {
    const c = code(PACKAGE);
    expect(c).toMatch(/insert into public\.audit_logs/);
    expect(c).toMatch(/insert into public\.historical_consolidation_decisions/);
    for (const field of ["original_text", "normalized_name", "mismatch_types", "signals", "certainty", "conflicts", "decision", "rule_version"]) {
      expect(c).toContain(field);
    }
  });
});

describe("undo exists at both levels", () => {
  it("one decision: revert_historical_consolidation_v1 restores the row only if it still points at that canonical", () => {
    expect(LEDGER).toMatch(/create or replace function public\.revert_historical_consolidation_v1/);
    expect(code(LEDGER)).toMatch(/and canonical_project_id = d\.canonical_project_id/);
    expect(code(LEDGER)).toMatch(/insert into public\.audit_logs/);
  });

  it("the whole package: its rollback returns rows to active and refuses if records changed", () => {
    expect(code(PACKAGE_DOWN)).toMatch(/set record_state = 'active', canonical_project_id = null/);
    expect(code(PACKAGE_DOWN)).toMatch(/rollback aborted: record checksum changed/);
  });

  it("the ledger cannot be dropped while a merge it explains is live", () => {
    expect(code(LEDGER_DOWN)).toMatch(/rollback refused: live merges are recorded/);
  });

  it("no client role may write the ledger", () => {
    expect(code(LEDGER)).toMatch(/grant select on table public\.historical_consolidation_decisions to authenticated;/);
    expect(code(LEDGER)).not.toMatch(/grant (insert|update|delete)[^;]*historical_consolidation_decisions/i);
  });
});
