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

  it("never touches storage objects (metadata-only continuity)", () => {
    expect(migration).not.toMatch(/storage\.objects/i);
    expect(migration).not.toMatch(/storage\.buckets/i);
    expect(migration).not.toMatch(/delete from public\.journal_entry_photos/i);
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

  it("no fabricated verification anywhere", () => {
    expect(migration).not.toMatch(/verified\s*(=|,)\s*true/i);
    expect(migration).not.toMatch(/manager_confirmed/);
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

  it("rollback restores the W0 body (no photo move)", () => {
    expect(rollback).toMatch(
      /create or replace function public\.journal_entry_supersede_v2\(/i,
    );
    expect(rollback).not.toMatch(/journal_entry_photos/);
  });
});
