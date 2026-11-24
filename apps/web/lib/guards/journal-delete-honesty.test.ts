import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Destructive-action honesty guard (user-journey root-cause repair v1,
 * finding #1).
 *
 * The journal delete confirmation used to leak the implementation term
 * "soft-delete" and promised history retention with no recovery path. Pins:
 *
 *   - NO user-facing catalog string anywhere contains implementation
 *     terminology for deletion (soft-delete / soft delete / softDelete);
 *   - the delete confirmation copy exists per journal locale and describes
 *     the real consequence in plain language;
 *   - delete has an immediate visible result + a working restore (undo);
 *   - the restore RPC migration mirrors 0018's security contract;
 *   - the journal entry location is the entry's OWN snapshot: no location
 *     store/profile read in the entries list, and a missing snapshot renders
 *     the explicit "not specified" key.
 */

const APP = join(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const readApp = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MESSAGES_DIR = join(APP, "messages");

function allMessageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...allMessageFiles(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

describe("no implementation terminology in ANY user-facing catalog", () => {
  it("no locale string mentions soft-delete / softDelete", () => {
    for (const file of allMessageFiles(MESSAGES_DIR)) {
      const raw = readFileSync(file, "utf8");
      expect(raw, file).not.toMatch(/soft[- ]?delete/i);
      // RU translation of the old copy ("мягкое удаление") counts too.
      expect(raw, file).not.toMatch(/мягкое удаление/i);
    }
  });
});

const JOURNAL_LOCALES = ["lt", "en", "ru", "nl", "de", "fi"] as const;

describe("delete confirmation copy — plain language, honest consequence", () => {
  for (const loc of JOURNAL_LOCALES) {
    it(`${loc}: deleteConfirm + restore keys exist and stay human`, () => {
      const entry = (
        JSON.parse(readApp(`messages/${loc}/journal.json`)) as {
          entry: Record<string, string>;
        }
      ).entry;
      for (const k of ["deleteConfirm", "deletedNotice", "restore", "restoring", "locationLabel", "locationUnset"]) {
        expect(entry[k]?.trim().length, `${loc} entry.${k}`).toBeGreaterThan(0);
      }
      // No implementation vocabulary in the destructive-action copy.
      expect(entry.deleteConfirm).not.toMatch(/soft|rpc|sql|database|db\b|row\b/i);
    });
  }
  it("lt: the unknown-location fallback is the exact required wording", () => {
    const entry = (
      JSON.parse(readApp("messages/lt/journal.json")) as { entry: Record<string, string> }
    ).entry;
    expect(entry.locationUnset).toBe("Vieta nenurodyta");
  });
});

describe("delete → visible result + working undo (row component)", () => {
  const row = readApp("components/app/journal-entry-row.tsx");
  it("successful delete swaps the row to a removed-placeholder (immediate visible result)", () => {
    expect(row).toMatch(/setDeleted\(true\)/);
    expect(row).toMatch(/journal-entry-deleted-/);
  });
  it("the placeholder carries a real restore control wired to the restore action", () => {
    expect(row).toMatch(/restoreJournalEntry/);
    expect(row).toMatch(/journal-entry-restore-/);
    expect(row).toMatch(/setDeleted\(false\)/);
  });
  it("actions export restoreJournalEntry calling the journal_entry_restore RPC", () => {
    const actions = readApp("lib/journal/actions.ts");
    expect(actions).toMatch(/export async function restoreJournalEntry/);
    expect(actions).toMatch(/"journal_entry_restore"/);
  });
});

describe("restore RPC migration mirrors 0018's security contract", () => {
  const MIG = join(REPO, "supabase/migrations/20260712120000_journal_entry_restore.sql");
  const migration = readFileSync(MIG, "utf8");
  const sqlNoComments = migration.replace(/^\s*--.*$/gm, "");
  it("is a DRAFT with the needs-human-gate header and has a rollback", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    expect(existsSync(join(REPO, "supabase/rollbacks/20260712120000_journal_entry_restore.down.sql"))).toBe(true);
  });
  it("security definer + pinned search_path + owns_worker recheck", () => {
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/set search_path = public/);
    expect(migration).toMatch(/owns_worker\(v_worker_id\)/);
  });
  it("idempotent, refuses superseded entries, clears deleted_at only", () => {
    expect(migration).toMatch(/if v_deleted_at is null then\s*return;/);
    expect(migration).toMatch(/entry_superseded_cannot_restore/);
    expect(migration).toMatch(/set deleted_at = null/);
  });
  it("revokes PUBLIC, grants execute to authenticated only", () => {
    expect(migration).toMatch(/revoke all on function public\.journal_entry_restore\(uuid\) from public/);
    expect(migration).toMatch(/grant execute on function public\.journal_entry_restore\(uuid\) to authenticated/);
    expect(sqlNoComments).not.toMatch(/grant[\s\S]*?\bto\s+anon\b/i);
  });
});

describe("journal entry location is the entry's OWN snapshot", () => {
  const page = readApp("app/[locale]/dashboard/journal/page.tsx");
  it("renders the per-entry location line with the honest fallback", () => {
    expect(page).toMatch(/journal-entry-location-/);
    expect(page).toMatch(/entry\.locationUnset/);
    expect(page).toMatch(/site\?\.value_text \?\? t\("entry\.locationUnset"\)/);
  });
  it("never derives an entry location from the live location store or profile coords", () => {
    expect(page).not.toMatch(/readSelectedLocation|location-store/);
    expect(page).not.toMatch(/current_location_country[\s\S]{0,200}site/);
  });
});
