import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LINK_RESULT_CODES,
  MAX_EVIDENCE_PER_TASK,
  MAX_TASKS_PER_ENTRY,
  UNLINK_REASON_MAX,
  ZERO_EVIDENCE_SUMMARY,
  deriveEvidenceSummary,
  evidencePreview,
  isLinkResultCode,
  isLinkSuccess,
  linkResultMessageKey,
} from "@/lib/journal/task-evidence-model";

/**
 * GUARD — Work Journal ↔ work_task evidence link (field-work audit v1, P0).
 *
 * The audit found the platform's central defect: the ONLY execution engine
 * with real production data (the Work Journal — 36 entries, 8 photos, 12
 * manager confirmations) had no way to say which task it was evidence for,
 * so finishing a task produced nothing durable and `work_tasks` sat at zero.
 *
 * This guard pins the properties that make the fix honest rather than just
 * functional. Each `it` below is a rule that must survive every refactor.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase/migrations/20260819190000_journal_task_evidence_link_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase/rollbacks/20260819190000_journal_task_evidence_link_v1.down.sql",
);

const migrationSql = readFileSync(MIGRATION, "utf8");
const rollbackSql = readFileSync(ROLLBACK, "utf8");

/**
 * The migration's header explains at length WHICH things it deliberately does
 * NOT touch, so it necessarily names them in prose. Assertions about what the
 * migration DOES must therefore run against executable SQL only — the same
 * `stripComments` discipline the migration-safety gate uses.
 */
const migrationCode = migrationSql.replace(/--[^\n]*/g, "");

describe("task evidence link — the model stays honest", () => {
  it("counts evidence, never scores it (§19 — no context-free percentage)", () => {
    const summary = deriveEvidenceSummary([
      { confirmedAt: "2026-08-01T00:00:00Z", photoCount: 2 },
      { confirmedAt: null, photoCount: 0 },
      { confirmedAt: null, photoCount: 1 },
    ]);
    expect(summary).toEqual({
      total: 3,
      confirmed: 1,
      unconfirmed: 2,
      withPhotos: 2,
    });
    // No percentage, ratio, score or readiness field may ever appear here —
    // a task is not "33% proven".
    const keys = Object.keys(summary).join(",");
    expect(keys).not.toMatch(/percent|ratio|score|rating|strength|readiness/i);
  });

  it("an empty task has an empty summary, not a hidden default", () => {
    expect(deriveEvidenceSummary([])).toEqual(ZERO_EVIDENCE_SUMMARY);
    expect(ZERO_EVIDENCE_SUMMARY.total).toBe(0);
    expect(ZERO_EVIDENCE_SUMMARY.confirmed).toBe(0);
  });

  it("linking NEVER promotes an unconfirmed entry to confirmed (§7)", () => {
    // Every item unconfirmed → confirmed must stay 0 no matter how many
    // links exist. Confirmation is read from the journal, never inferred.
    const summary = deriveEvidenceSummary(
      Array.from({ length: 25 }, () => ({ confirmedAt: null, photoCount: 3 })),
    );
    expect(summary.confirmed).toBe(0);
    expect(summary.unconfirmed).toBe(25);
  });

  it("result codes are a closed set with stable i18n leaves", () => {
    for (const code of LINK_RESULT_CODES) {
      expect(isLinkResultCode(code)).toBe(true);
      expect(linkResultMessageKey(code)).toBe(`tasks.evidence.result.${code}`);
    }
    expect(isLinkResultCode("definitely_not_a_code")).toBe(false);
  });

  it("idempotent outcomes read as success, not failure", () => {
    expect(isLinkSuccess("ok")).toBe(true);
    expect(isLinkSuccess("already_linked")).toBe(true);
    expect(isLinkSuccess("not_found")).toBe(false);
    expect(isLinkSuccess("not_allowed")).toBe(false);
    expect(isLinkSuccess("limit_reached")).toBe(false);
  });

  it("previews truncate without inventing text", () => {
    expect(evidencePreview("short text")).toBe("short text");
    const long = "x".repeat(500);
    const out = evidencePreview(long, 20);
    expect(out.length).toBe(20);
    expect(out.endsWith("…")).toBe(true);
    // Whitespace is flattened, content is never reworded.
    expect(evidencePreview("a\n\n  b")).toBe("a b");
  });
});

describe("task evidence link — the migration keeps the doctrine", () => {
  it("does NOT add a task_id column to the append-only journal", () => {
    // §3.1: journal_entries has no UPDATE policy. A column could only ever
    // be set by the worker at insert time, so a foreman could never link
    // evidence that already exists. The link is a table, by design.
    expect(migrationCode).not.toMatch(
      /alter\s+table\s+public\.journal_entries/i,
    );
  });

  it("never touches the journal save path or the hash chain (§3.3)", () => {
    expect(migrationCode).not.toMatch(/create_journal_entry_full/i);
    expect(migrationCode).not.toMatch(/journal_entry_supersede/i);
    expect(migrationCode).not.toMatch(/hash_self|hash_prev/i);
  });

  it("revocation is a record, never a delete (§4.3)", () => {
    expect(migrationSql).toMatch(/unlinked_at/);
    expect(migrationSql).toMatch(/unlinked_by/);
    expect(migrationSql).toMatch(/unlink_reason/);
    // The unlink RPC must UPDATE the row, never DELETE it.
    const unlinkFn = migrationSql.slice(
      migrationSql.indexOf("unlink_journal_entry_from_task_v1"),
    );
    expect(unlinkFn).toMatch(/update\s+public\.journal_entry_tasks/i);
    expect(unlinkFn).not.toMatch(/delete\s+from\s+public\.journal_entry_tasks/i);
  });

  it("authenticated callers get SELECT only — writes go through the RPCs", () => {
    expect(migrationSql).toMatch(
      /grant\s+select\s+on\s+public\.journal_entry_tasks\s+to\s+authenticated/i,
    );
    expect(migrationSql).toMatch(
      /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.journal_entry_tasks\s+from\s+authenticated/i,
    );
  });

  it("stays default-closed: never grants anything to anon or public (§4)", () => {
    expect(migrationCode).not.toMatch(/grant[^;]*\bto\s+anon\b/i);
    expect(migrationCode).not.toMatch(/grant[^;]*\bto\s+public\b/i);
    // RLS is on, and the read policy is not a blanket true.
    expect(migrationSql).toMatch(
      /alter\s+table\s+public\.journal_entry_tasks\s+enable\s+row\s+level\s+security/i,
    );
    expect(migrationCode).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("link visibility mirrors journal visibility — it can only narrow", () => {
    // The read policy is gated on the entry, not on the task: a manager who
    // may read a task but not the entry must not learn the entry exists.
    expect(migrationSql).toMatch(
      /create\s+policy\s+journal_entry_tasks_select[\s\S]{0,200}can_read_journal_entry_v1\s*\(\s*entry_id\s*\)/i,
    );
  });

  it("ships a rollback that refuses to destroy live evidence claims", () => {
    expect(rollbackSql).toMatch(/unlinked_at\s+is\s+null/i);
    expect(rollbackSql).toMatch(/raise\s+exception/i);
    expect(rollbackSql).toMatch(/drop\s+table\s+if\s+exists\s+public\.journal_entry_tasks/i);
  });

  it("bounds mirror the migration exactly (one contract, both sides)", () => {
    expect(migrationSql).toContain(`>= ${MAX_EVIDENCE_PER_TASK}`);
    expect(migrationSql).toContain(`>= ${MAX_TASKS_PER_ENTRY}`);
    expect(migrationSql).toContain(`> ${UNLINK_REASON_MAX}`);
    expect(migrationSql).toContain(`<= ${UNLINK_REASON_MAX}`);
  });

  it("carries the owner approval AND still states the gated route", () => {
    // Owner decision 2026-08-19 (PR #1212) approved this RED migration for
    // the P0 link capability ONLY. The annotation makes CI pass; it is NOT an
    // auto-merge pass — the PR still ships as a draft with needs-human-gate
    // (CLAUDE.md: "an acknowledgement, not an auto-merge pass"). Asserted
    // with the migration-safety gate's OWN regex so this guard and CI can
    // never disagree about whether the file is annotated.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(migrationSql)).toBe(true);
    expect(migrationSql).toMatch(/needs-human-gate/i);
    // The approval is scope-bound, and the file must say so — the next agent
    // must not read this annotation as a licence for the parked capabilities.
    expect(migrationSql).toMatch(/GPS/);
    expect(migrationSql).toMatch(/does NOT extend/i);
  });

  it("stays ADDITIVE — the approval covers no destructive operation", () => {
    // Scope lock: the owner approved a link table, not a schema expansion.
    // No DROP of any pre-existing object, no table/column removal.
    expect(migrationCode).not.toMatch(/drop\s+table/i);
    expect(migrationCode).not.toMatch(/drop\s+column/i);
    expect(migrationCode).not.toMatch(/drop\s+policy/i);
    expect(migrationCode).not.toMatch(/alter\s+policy/i);
    // Nothing outside the approved P0 surface is created.
    const created = [...migrationCode.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)]
      .map((m) => m[1]);
    expect(created).toEqual(["journal_entry_tasks"]);
  });

});
