import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Journal evidence integrity v1 (RED, owner decision N-9, audit 2026-10-16).
 *
 * Static pins over the migration pair. The behavioural proof (forged client
 * hashes overwritten, mutation and deletion refused, chain verified, bypass
 * only for service_role inside an erasure transaction) runs on a throwaway
 * local PostgreSQL cluster: apps/web/scripts/db-proof/journal-evidence-integrity-local.mjs.
 * These pins keep the file's shape from drifting away from what was proven.
 */
const ROOT = join(__dirname, "../../../..");
const UP = join(ROOT, "supabase/migrations/20261016190000_journal_evidence_integrity_v1.sql");
const DOWN = join(ROOT, "supabase/rollbacks/20261016190000_journal_evidence_integrity_v1.down.sql");

describe("20261016190000_journal_evidence_integrity_v1", () => {
  const up = readFileSync(UP, "utf8");

  it("is RED-acknowledged and ships a paired rollback", () => {
    expect(up.startsWith("-- @human-gate-approved")).toBe(true);
    expect(existsSync(DOWN)).toBe(true);
    expect(up).toMatch(/^-- ROLLBACK: supabase\/rollbacks\/20261016190000_journal_evidence_integrity_v1\.down\.sql/m);
  });

  it("the chain is computed server-side on INSERT and client values are overwritten", () => {
    expect(up).toMatch(/create trigger journal_entries_chain_v1\s+before insert on public\.journal_entries/);
    expect(up).toContain("perform pg_advisory_xact_lock(hashtext('journal_chain:' || new.worker_id::text));");
    expect(up).toContain("new.hash_prev    := v_head;");
    expect(up).toContain("new.hash_version := 2;");
    // proof F2 (2026-10-16): the chain ORDER is server-set and monotonic per worker
    expect(up).toContain("new.created_at   := greatest(now(), coalesce(v_head_at, now()) + interval '1 microsecond');");
    // proof F3: project attribution is a lifecycle fact, not hashed evidence
    expect(up).not.toMatch(/coalesce\(new\.project_id::text, ''\) \|\| '\|' \|\|\s*to_char/);
    expect(up).toMatch(/new\.hash_self\s+:= encode\(extensions\.digest\(/);
    // over STORED columns only — never a value that is not persisted
    expect(up).not.toMatch(/now\(\)\s*::text|clock_timestamp\(\)/);
  });

  it("content and provenance columns are immutable; delete and truncate are refused", () => {
    expect(up).toMatch(/create trigger journal_entries_evidence_guard_v1\s+before update or delete on public\.journal_entries/);
    expect(up).toMatch(/create trigger journal_entries_truncate_guard_v1\s+before truncate on public\.journal_entries/);
    for (const col of [
      "worker_id", "engagement_context_id", "entry_type_slug", "profession_id",
      "original_text", "original_language", "hash_prev", "hash_self", "hash_version",
      "created_at", "correction_of",
    ]) {
      expect(up, col).toMatch(new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`));
    }
    // the lifecycle columns the live RPCs change are NOT pinned
    for (const col of ["deleted_at", "superseded_by", "updated_at", "visibility_scope"]) {
      expect(up, col).not.toMatch(new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`));
    }
    expect(up).toContain("if tg_op = 'DELETE' then");
    expect(up).toMatch(/raise exception 'journal_entry_immutable: delete is never permitted/);
  });

  it("the ONE bypass is service_role inside an erasure transaction, nothing weaker", () => {
    expect(up).toContain("select current_user = 'service_role'");
    expect(up).toContain("coalesce(current_setting('lm.evidence_guard_bypass', true), '') = 'erasure'");
    expect(up).toMatch(/revoke all on function public\.journal_evidence_guard_bypassed_v1\(\) from public, anon, authenticated;/);
    // proof F1: the SECURITY INVOKER guards evaluate the predicate as the caller
    expect(up).toContain("grant execute on function public.journal_evidence_guard_bypassed_v1() to service_role;");
  });

  it("the verifier runs as the caller (RLS decides) and reports per entry, never a summary", () => {
    expect(up).toMatch(/create or replace function public\.verify_journal_chain_v1\(p_worker_id uuid\)[\s\S]*?security invoker/);
    for (const s of ["'legacy'", "'self_mismatch'", "'prev_mismatch'", "'partial_view'", "'ok'"]) {
      expect(up).toContain(s);
    }
    expect(up).toContain("grant execute on function public.verify_journal_chain_v1(uuid) to authenticated, service_role;");
  });

  it("evidence photos become orphan-only deletable; audit_logs become immutable", () => {
    expect(up).toMatch(/create policy "journal-entry-photos owner delete" on storage\.objects[\s\S]*?not exists \(\s*select 1 from public\.journal_entry_photos p where p\.storage_path = storage\.objects\.name/);
    expect(up).toMatch(/create trigger audit_logs_immutable_guard_v1\s+before update or delete on public\.audit_logs/);
    expect(up).toMatch(/create trigger audit_logs_truncate_guard_v1\s+before truncate on public\.audit_logs/);
  });

  it("every function pins search_path and no RPC signature or RLS policy on the tables changes", () => {
    const fns = up.match(/create or replace function [\s\S]*?\$\$;/g) ?? [];
    expect(fns.length).toBeGreaterThanOrEqual(6);
    for (const f of fns) expect(f).toMatch(/set search_path = public, pg_temp/);
    expect(up).not.toMatch(/create or replace function public\.create_journal_entry_full/);
    expect(up).not.toMatch(/create policy journal_entries_/);
    expect(up).not.toMatch(/drop policy if exists journal_entries_/);
  });

  it("the rollback reverses every object and restores the previous photo policy", () => {
    const down = readFileSync(DOWN, "utf8");
    for (const s of [
      "drop trigger if exists journal_entries_chain_v1",
      "drop trigger if exists journal_entries_evidence_guard_v1",
      "drop trigger if exists journal_entries_truncate_guard_v1",
      "drop trigger if exists audit_logs_immutable_guard_v1",
      "drop trigger if exists audit_logs_truncate_guard_v1",
      "drop function if exists public.verify_journal_chain_v1(uuid)",
      "drop function if exists public.journal_evidence_guard_bypassed_v1()",
      "alter table public.journal_entries drop column if exists hash_version",
      'create policy "journal-entry-photos owner delete" on storage.objects',
    ]) {
      expect(down, s).toContain(s);
    }
    expect(down).toMatch(/raise warning/);
  });
});
