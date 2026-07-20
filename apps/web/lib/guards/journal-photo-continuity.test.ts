import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W1 — Invite-Ready Closure Train v1: journal attachment continuity.
 *
 * Pins `supabase/migrations/20260720150000_journal_photo_continuity_v1.sql`:
 *  - the atomic supersede transaction moves the old entry's ACTIVE photo
 *    metadata rows to the new live entry (unconfirmed supersede only);
 *  - confirmed originals (correction lane) keep their photo — the move is
 *    gated on `v_old_confirmed = 0`;
 *  - failed/removed photo rows stay on the historical entry;
 *  - NO storage object is copied, moved or deleted (metadata-only continuity;
 *    the immutable object + its path keep provenance to the original upload);
 *  - all W0 atomicity invariants survive in the replaced body (row lock,
 *    structured errors, conditional pointer update);
 *  - grants stay authenticated-only; paired rollback restores the W0 body.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const migration = readFileSync(
  join(
    REPO_ROOT,
    "supabase/migrations/20260720150000_journal_photo_continuity_v1.sql",
  ),
  "utf-8",
);
const rollback = readFileSync(
  join(
    REPO_ROOT,
    "supabase/rollbacks/20260720150000_journal_photo_continuity_v1.down.sql",
  ),
  "utf-8",
);

describe("W1 migration — photo continuity inside the atomic supersede", () => {
  it("moves ACTIVE photo metadata to the new live entry in-transaction", () => {
    expect(migration).toMatch(
      /update public\.journal_entry_photos\s+set entry_id = v_new_entry_id/i,
    );
    expect(migration).toMatch(
      /where entry_id = p_old_entry_id\s+and upload_status in \('uploading','uploaded'\)/i,
    );
  });

  it("confirmed originals keep their photo (move gated on v_old_confirmed = 0)", () => {
    const moveIdx = migration.indexOf(
      "update public.journal_entry_photos",
    );
    const gate = migration.lastIndexOf("if v_old_confirmed = 0 then", moveIdx);
    expect(gate).toBeGreaterThan(0);
    // The gate sits inside the photo-continuity block, directly before the move.
    expect(moveIdx - gate).toBeLessThan(200);
  });

  it("never mutates storage objects (metadata-only continuity; read policy only)", () => {
    expect(migration).not.toMatch(/(insert into|update|delete from)\s+storage\.objects/i);
    expect(migration).not.toMatch(/(insert into|update|delete from)\s+storage\.buckets/i);
    expect(migration).not.toMatch(/delete from public\.journal_entry_photos/i);
    // The only storage.objects reference is the SELECT policy.
    expect(migration).toMatch(/on storage\.objects for select/i);
  });

  it("keeps every W0 atomicity invariant in the replaced body", () => {
    expect(migration).toMatch(
      /from public\.journal_entries\s+where id = p_old_entry_id\s+for update/i,
    );
    for (const err of [
      "entry_not_found",
      "not_owner",
      "cannot_supersede_deleted",
      "entry_superseded",
      "invalid_skill_slug",
      "skill_slug_unknown",
    ]) {
      expect(migration).toContain(`raise exception '${err}'`);
    }
    expect(migration).toMatch(
      /set superseded_by = v_new_entry_id[\s\S]*where id = p_old_entry_id\s+and superseded_by is null/i,
    );
  });

  it("no fabricated verification outside the verbatim manager-confirm RPC", () => {
    // confirm_entry_and_verify_skills is copied VERBATIM from 20260530140000
    // (the real, manager-gated verification flow) plus only a stale check —
    // everything else in the migration must never write verification.
    const confirmStart = migration.indexOf(
      "create or replace function public.confirm_entry_and_verify_skills(",
    );
    const confirmEnd = migration.indexOf("end $$;", confirmStart) + 7;
    const outside =
      migration.slice(0, confirmStart) + migration.slice(confirmEnd);
    expect(outside).not.toMatch(/verified\s*=\s*true/i);
    expect(outside).not.toMatch(/set\s+verified/i);
  });

  it("grants stay authenticated-only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.journal_entry_supersede_v2\([\s\S]*?\) from public/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.journal_entry_supersede_v2\([\s\S]*?\) to authenticated/i,
    );
    expect(migration).not.toMatch(/service_role/);
  });

  it("rollback reverts behavior but RETAINS coherent authorization (Codex rev2 P1)", () => {
    expect(rollback).toMatch(
      /create or replace function public\.journal_entry_supersede_v2\(/i,
    );
    // W0 body restored WITHOUT the photo move.
    const rbV2End = rollback.indexOf("$$;");
    expect(rollback.slice(0, rbV2End)).not.toMatch(
      /update public\.journal_entry_photos/i,
    );
    expect(rollback).toMatch(
      /create or replace function public\.register_journal_entry_photo\(/i,
    );
    // The path-segment storage policy must NEVER come back: after any
    // cross-context move it would re-expose objects to the old org.
    expect(rollback).not.toMatch(/storage\.foldername/i);
    expect(rollback).not.toMatch(
      /grant update on public\.journal_entry_photos to authenticated/i,
    );
    expect(rollback).toMatch(/DELIBERATELY RETAINED/);
  });

  it("one-time backfill repairs pre-migration stranded photos safely (Codex rev2 P1)", () => {
    expect(migration).toMatch(/with recursive chain as \(/i);
    // Explicit cycle detection (owner-hold v4 item 6) + single-mover-per-tip.
    expect(migration).toMatch(/array\[je\.id\] as path/i);
    expect(migration).toMatch(/not \(n\.id = any\(c\.path\)\)/i);
    expect(migration).not.toMatch(/c\.depth/i);
    expect(migration).toMatch(/select distinct on \(l\.live_entry_id\)/i);
    // Cutover quiesce (owner-hold v4 item 5).
    expect(migration).toMatch(/lock table public\.journal_entries in exclusive mode/i);
    // Only ACTIVE stranded rows, only to a LIVE non-deleted tip.
    expect(migration).toMatch(
      /je\.superseded_by is not null[\s\S]*tip\.deleted_at is null/i,
    );
    // Never creates a second active attachment on the tip.
    expect(migration).toMatch(
      /not exists \(\s*select 1 from public\.journal_entry_photos q\s+where q\.entry_id = l\.live_entry_id/i,
    );
  });
});

describe("W1 rev7 — confirmation lifecycle serialization (owner-hold v4)", () => {
  it("BEFORE INSERT guard trigger serializes every confirmation path", () => {
    expect(migration).toMatch(
      /create or replace function public\.journal_entry_confirmations_guard\(\)/i,
    );
    expect(migration).toMatch(
      /from public\.journal_entries\s+where id = new\.entry_id\s+for key share/i,
    );
    expect(migration).toMatch(
      /create trigger journal_entry_confirmations_guard\s+before insert on public\.journal_entry_confirmations/i,
    );
    const guard = migration.slice(
      migration.indexOf("journal_entry_confirmations_guard()"),
    );
    expect(guard).toContain(`raise exception 'entry_superseded'`);
    expect(guard).toContain(`raise exception 'entry_deleted'`);
  });

  it("interactive confirmation RPCs return clean stale statuses", () => {
    for (const fn of ["review_journal_entry", "confirm_entry_and_verify_skills"]) {
      const body = migration.slice(
        migration.indexOf(`create or replace function public.${fn}(`),
      );
      const end = body.indexOf("end $$;");
      expect(body.slice(0, end)).toContain(`return 'entry_superseded';`);
      expect(body.slice(0, end)).toContain(`return 'entry_deleted';`);
    }
  });

  it("direct-insert policy refuses stale targets (defense in depth)", () => {
    const pol = migration.slice(
      migration.indexOf(
        "create policy journal_entry_confirmations_insert",
      ),
    );
    const polEnd = pol.indexOf(");");
    expect(pol.slice(0, polEnd)).toMatch(/je\.superseded_by is null/i);
    expect(pol.slice(0, polEnd)).toMatch(/je\.deleted_at is null/i);
  });

  it("rollback drops the guard trigger and restores original RPCs + policy", () => {
    expect(rollback).toMatch(
      /drop trigger if exists journal_entry_confirmations_guard/i,
    );
    expect(rollback).toMatch(
      /drop function if exists public\.journal_entry_confirmations_guard\(\)/i,
    );
    expect(rollback).toMatch(
      /create or replace function public\.review_journal_entry\(/i,
    );
    expect(rollback).toMatch(
      /create or replace function public\.confirm_entry_and_verify_skills\(/i,
    );
    // Restored policy is the ORIGINAL (no staleness predicate).
    const rbPol = rollback.slice(
      rollback.indexOf("create policy journal_entry_confirmations_insert"),
    );
    expect(rbPol.slice(0, rbPol.indexOf(");"))).not.toMatch(
      /superseded_by is null/i,
    );
  });
});

describe("W1 rev6 — LEGACY supersede photo parity (owner-hold #2 P1)", () => {
  it("the 9-arg legacy RPC carries the identical gated photo move", () => {
    const legacyStart = migration.indexOf(
      "create or replace function public.journal_entry_supersede(",
    );
    expect(legacyStart).toBeGreaterThan(0);
    const legacyBody = migration.slice(
      legacyStart,
      migration.indexOf("$$;", legacyStart),
    );
    expect(legacyBody).toMatch(
      /update public\.journal_entry_photos\s+set entry_id = v_new_entry_id/i,
    );
    expect(legacyBody).toMatch(
      /upload_status in \('uploading','uploaded'\)/i,
    );
    expect(legacyBody).toMatch(/for update/i);
  });

  it("rollback restores the LEGACY RPC to the W0 body (no photo move)", () => {
    const rbLegacyStart = rollback.indexOf(
      "create or replace function public.journal_entry_supersede(",
    );
    expect(rbLegacyStart).toBeGreaterThan(0);
    const rbLegacyBody = rollback.slice(
      rbLegacyStart,
      rollback.indexOf("$$;", rbLegacyStart),
    );
    expect(rbLegacyBody).not.toMatch(/journal_entry_photos/i);
    expect(rbLegacyBody).toMatch(/for update/i);
  });
});

describe("W1 rev2 — registration serialized with the supersede (owner-hold P2)", () => {
  it("register_journal_entry_photo locks the entry row and refuses stale entries", () => {
    const fn = migration.slice(
      migration.indexOf("create or replace function public.register_journal_entry_photo("),
    );
    expect(fn).toMatch(/from public\.journal_entries je[\s\S]*for update of je/i);
    expect(fn).toContain(`raise exception 'entry_superseded'`);
    expect(fn).toContain(`raise exception 'entry_deleted'`);
    // Cap check remains AFTER the lock (race-proof ordering).
    const lockIdx = fn.indexOf("for update of je");
    const capIdx = fn.indexOf("photo_limit_reached");
    expect(lockIdx).toBeGreaterThan(0);
    expect(capIdx).toBeGreaterThan(lockIdx);
  });
});

describe("W1 rev2 — one coherent authorization source (owner-hold P1)", () => {
  it("storage manager policy resolves the CANONICAL metadata row, never the path segment", () => {
    const policy = migration.slice(
      migration.indexOf(`create policy "journal-entry-photos org manager select"`),
    );
    expect(policy).toMatch(/p\.storage_path = storage\.objects\.name/i);
    expect(policy).toMatch(/join public\.journal_entries je on je\.id = p\.entry_id/i);
    expect(policy).toMatch(/manages_organization\(ec\.organization_id\)/i);
    // The embedded historical entry id must never be authorization input.
    expect(policy.slice(0, policy.indexOf(");"))).not.toMatch(
      /storage\.foldername/i,
    );
  });

  it("photo rows cannot be repointed: WITH CHECK + upload_status-only grant", () => {
    expect(migration).toMatch(
      /create policy journal_entry_photos_update[\s\S]*using \(profile_id = auth\.uid\(\)\)\s*with check \(profile_id = auth\.uid\(\)\)/i,
    );
    expect(migration).toMatch(
      /revoke update on public\.journal_entry_photos from authenticated/i,
    );
    expect(migration).toMatch(
      /grant update \(upload_status\) on public\.journal_entry_photos to authenticated/i,
    );
  });
});
