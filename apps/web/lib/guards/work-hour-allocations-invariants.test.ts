import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ALLOCATIONS_TABLE } from "@/lib/work-hours/allocations-model";

/**
 * THE INVARIANTS A PAYROLL-ADJACENT RECORD MUST KEEP.
 *
 * These are asserted against the MIGRATION SOURCE, not against a mock, because
 * each one is a property of the database rather than of the TypeScript in
 * front of it. The application could be replaced tomorrow and these would
 * still have to hold.
 *
 * The invariant that motivated the whole feature:
 *
 *     Vitalii · 2026-08-29 · Object 01 → 8 h
 *     Vitalii · 2026-08-29 · Object 05 → 2 h
 *
 * Two rows. A unique index on (worker, date) — or even on
 * (worker, date, object) — would silently destroy the second, which is
 * exactly the overwrite bug this table exists to prevent. So the absence of
 * that index is itself a guarded property; absences are invisible to review
 * and only a test keeps them.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260829140000_work_hour_allocations_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260829140000_work_hour_allocations_v1.down.sql",
);

const sql = (): string => readFileSync(MIGRATION, "utf8");

describe("multiple allocations per worker, day and object stay possible", () => {
  it("declares NO unique index or constraint on the allocation table", () => {
    const src = sql();
    // Any unique index on this table is a candidate for the overwrite bug.
    // Catching all of them and reviewing by hand beats guessing the shape.
    const uniques = src.match(/create\s+unique\s+index[^;]*work_hour_allocations[^;]*;/gi) ?? [];
    expect(
      uniques,
      "a unique index here would make a worker's second object overwrite the first",
    ).toHaveLength(0);

    const tableUniques = src.match(/\bunique\s*\(/gi) ?? [];
    expect(tableUniques, "no UNIQUE(...) table constraint either").toHaveLength(0);
  });

  it("the absence is documented, so nobody 'fixes' it later", () => {
    // A missing constraint looks like an oversight unless the file says why.
    expect(sql()).toMatch(/NO UNIQUENESS ON \(worker, date\)/i);
  });
});

describe("who worked and who typed it are different columns", () => {
  it("both exist and reference different things", () => {
    const src = sql();
    expect(src).toMatch(/worker_id\s+uuid\s+not null\s+references\s+public\.workers/i);
    expect(src).toMatch(/entered_by\s+uuid\s+not null\s+references\s+public\.profiles/i);
  });

  it("RLS forces entered_by to the acting session — it cannot be forged", () => {
    expect(
      sql(),
      "without this an operator could record hours as if the worker had entered them",
    ).toMatch(/entered_by\s*=\s*auth\.uid\(\)/);
  });
});

describe("history is superseded, never destroyed", () => {
  it("carries the journal_entries correction idiom rather than a third one", () => {
    const src = sql();
    expect(src).toMatch(/correction_of\s+uuid/i);
    expect(src).toMatch(/superseded_by\s+uuid/i);
  });

  it("grants no DELETE to any client role and declares no delete policy", () => {
    const src = sql();
    expect(
      src,
      "authenticated must not be able to delete a work record",
    ).not.toMatch(/grant[^;]*\bdelete\b[^;]*\bto\b[^;]*authenticated/i);
    expect(
      src.match(/create policy[^;]*for\s+delete/gi) ?? [],
      "no delete policy — a mistake is corrected, not erased",
    ).toHaveLength(0);
  });

  it("withholds TRUNCATE from client roles", () => {
    // The append-only hole: RLS does not apply to TRUNCATE, so a granted
    // TRUNCATE empties the table regardless of every policy above it.
    const src = sql();
    expect(src).toMatch(/revoke all on public\.work_hour_allocations from anon/i);
    expect(src).toMatch(/revoke all on public\.work_hour_allocations from authenticated/i);
    expect(src).not.toMatch(/grant[^;]*truncate[^;]*to\s+(anon|authenticated)/i);
  });
});

describe("the tenant boundary is the same one timesheets already use", () => {
  it("select is owns_worker OR manages_organization OR is_admin", () => {
    const src = sql();
    expect(src).toMatch(/public\.owns_worker\(worker_id\)/);
    expect(src).toMatch(/public\.manages_organization\(organization_id\)/);
    expect(src).toMatch(/public\.is_admin\(\)/);
  });

  it("RLS is actually enabled — policies without it are decoration", () => {
    expect(sql()).toMatch(
      /alter table public\.work_hour_allocations enable row level security/i,
    );
  });
});

describe("hours alone are an attendance fact, not evidence", () => {
  it("the Work Journal link is optional", () => {
    // A NOT NULL journal_entry_id would force every hours entry to manufacture
    // a narrative, and a narrative is what later becomes skill evidence.
    const src = sql();
    expect(src).toMatch(/journal_entry_id\s+uuid\s+references\s+public\.journal_entries/i);
    expect(src).not.toMatch(/journal_entry_id\s+uuid\s+not null/i);
  });

  it("carries no approval COLUMNS — that decision belongs to the timesheet", () => {
    // Matched as a column DECLARATION, not as a word: the migration discusses
    // approved_by/at in its "deliberately not added" note, and a guard that
    // fails on its own documentation teaches people to delete the
    // documentation.
    const src = sql();
    expect(src, "approval lives in timesheets, not on the fact").not.toMatch(
      /^\s*approved_by\s+\w/im,
    );
    expect(src).not.toMatch(/^\s*approved_at\s+\w/im);
  });
});

describe("colour is UX metadata and nothing else", () => {
  it("is nullable, format-checked, and documented as never a business input", () => {
    const src = sql();
    expect(src).toMatch(/add column if not exists color_hex text/i);
    expect(src).toMatch(/color_hex\s*~\s*'\^#\[0-9A-Fa-f\]\{6\}\$'/);
    expect(src).toMatch(/[Nn]ever an input to any business rule/);
  });

  it("does not restrict how many objects may exist", () => {
    // The pilot starts with four. Nothing may encode four.
    const src = sql();
    expect(src).not.toMatch(/check\s*\([^)]*name\s+in\s*\(\s*'01'/i);
  });
});

describe("the migration is reversible and additive", () => {
  it("ships a rollback that drops exactly what it created", () => {
    const down = readFileSync(ROLLBACK, "utf8");
    expect(down).toMatch(/drop table if exists public\.work_hour_allocations/i);
    expect(down).toMatch(/drop column if exists color_hex/i);
  });

  it("drops nothing that existed before it", () => {
    const src = sql();
    const drops = src.match(/^\s*drop\s+(table|column|constraint)\b.*$/gim) ?? [];
    // `drop policy if exists` / `drop trigger if exists` are idempotent
    // re-creates of this migration's OWN objects, not destruction.
    expect(drops, `forward migration must not drop pre-existing objects: ${drops.join(" | ")}`).toHaveLength(0);
  });

  it("the model and the migration agree on the table name", () => {
    expect(sql()).toContain(ALLOCATIONS_TABLE);
  });
});
