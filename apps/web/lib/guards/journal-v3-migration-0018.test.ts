import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for `supabase/migrations/0018_journal_correction_lifecycle.sql`.
 *
 * v3 lifecycle contract:
 *  - Pre-confirmation: worker can soft-delete or supersede their own entries.
 *  - Post-confirmation: soft-delete is rejected; supersede becomes a
 *    correction-request (correction_of link), original stays intact.
 *  - RPCs are `security definer` with internal `owns_worker` checks so a
 *    caller can never act on someone else's entry. No service_role.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const migration = readFileSync(
  join(REPO_ROOT, "supabase/migrations/0018_journal_correction_lifecycle.sql"),
  "utf-8",
);

describe("0018 — additive schema for the correction lifecycle", () => {
  it("adds `deleted_at` and `correction_of` with IF NOT EXISTS (idempotent)", () => {
    expect(migration).toMatch(
      /alter table public\.journal_entries[\s\S]*add column if not exists deleted_at\s+timestamptz/i,
    );
    expect(migration).toMatch(
      /add column if not exists correction_of\s+uuid references public\.journal_entries\(id\)/i,
    );
  });

  it("creates partial indexes for the new columns", () => {
    expect(migration).toMatch(
      /create index if not exists idx_journal_entries_deleted_at[\s\S]*where deleted_at is not null/i,
    );
    expect(migration).toMatch(
      /create index if not exists idx_journal_entries_correction_of[\s\S]*where correction_of is not null/i,
    );
  });

  it("does not drop, weaken, or remove any pre-existing schema or row", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|function|policy)\b/i);
    expect(migration).not.toMatch(/\balter\s+table[\s\S]*\bdrop\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe("0018 — journal_entry_soft_delete RPC", () => {
  it("exists with the right signature + returns void", () => {
    expect(migration).toMatch(
      /create or replace function public\.journal_entry_soft_delete\(\s*p_entry_id uuid\s*\)[\s\S]*returns void/i,
    );
  });

  it("is `security definer` with a pinned search_path", () => {
    // Security-definer is what lets it flip lifecycle columns past the
    // default-deny UPDATE policy. `set search_path = public` removes a
    // standard definer privilege-escalation vector.
    expect(migration).toMatch(
      /create or replace function public\.journal_entry_soft_delete[\s\S]*security definer[\s\S]*set search_path = public/i,
    );
  });

  it("re-checks ownership inside the function (owns_worker) before mutating", () => {
    expect(migration).toMatch(
      /public\.journal_entry_soft_delete[\s\S]*owns_worker[\s\S]*update public\.journal_entries/i,
    );
  });

  it("rejects deletion of confirmed entries with a tagged exception", () => {
    expect(migration).toMatch(/already_confirmed_use_correction_request/i);
  });

  it("is revoked from public + granted to authenticated only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.journal_entry_soft_delete\(uuid\) from public/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.journal_entry_soft_delete\(uuid\) to authenticated/i,
    );
  });
});

describe("0018 — journal_entry_supersede RPC", () => {
  it("creates a new entry that links to the old one (superseded_by pre-confirmation, correction_of post-confirmation)", () => {
    // Pre-confirmation path — old row points at the new id.
    expect(migration).toMatch(
      /update public\.journal_entries[\s\S]*set superseded_by = v_new_entry_id/i,
    );
    // Post-confirmation path — new row's correction_of is set, old is left alone.
    expect(migration).toMatch(
      /case when v_old_confirmed > 0 then p_old_entry_id else null end/i,
    );
  });

  it("is `security definer` with internal owns_worker check", () => {
    expect(migration).toMatch(
      /create or replace function public\.journal_entry_supersede[\s\S]*security definer[\s\S]*owns_worker/i,
    );
  });

  it("is revoked from public + granted to authenticated only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.journal_entry_supersede\([\s\S]*\) from public/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.journal_entry_supersede\([\s\S]*\) to authenticated/i,
    );
  });

  it("rejects supersede of already-soft-deleted entries", () => {
    expect(migration).toMatch(/cannot_supersede_deleted/i);
  });
});
