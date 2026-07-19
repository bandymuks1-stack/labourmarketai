import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W0 — Invite-Ready Closure Train v1: atomic supersede + in-transaction
 * selected-skill evidence (post-#840 review P1 repair).
 *
 * Pins `supabase/migrations/20260720100000_journal_atomic_supersede_v1.sql`:
 *  - `journal_entry_supersede_v2` locks the old row (`FOR UPDATE`), refuses
 *    stale/concurrent saves with the structured `entry_superseded` error and
 *    advances `superseded_by` only via a conditional update — one live
 *    descendant, ever;
 *  - selected taxonomy slugs are validated INSIDE the transaction (format,
 *    active row) and persisted as verified=false / self_declared evidence
 *    with insert-only conflict handling (no downgrade, no fake verification);
 *  - decision markers + non-rederivable skill links carry forward in the
 *    SAME transaction;
 *  - the legacy `journal_entry_supersede` is hardened with the same lock +
 *    stale rejection so the deployed app is race-safe during rollout;
 *  - both functions revoke public and grant only `authenticated`;
 *  - a reversible rollback file exists and drops v2.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION_PATH =
  "supabase/migrations/20260720100000_journal_atomic_supersede_v1.sql";
const migration = readFileSync(join(REPO_ROOT, MIGRATION_PATH), "utf-8");
const rollback = readFileSync(
  join(
    REPO_ROOT,
    "supabase/rollbacks/20260720100000_journal_atomic_supersede_v1.down.sql",
  ),
  "utf-8",
);

/** The v2 function body (from its CREATE to the legacy function's CREATE). */
const v2Start = migration.indexOf("journal_entry_supersede_v2");
const legacyStart = migration.indexOf(
  "create or replace function public.journal_entry_supersede(",
);
const v2Body = migration.slice(v2Start, legacyStart);
const legacyBody = migration.slice(legacyStart);

describe("W0 migration — journal_entry_supersede_v2 atomicity", () => {
  it("locks the old entry row FOR UPDATE before any check", () => {
    expect(v2Body).toMatch(
      /from public\.journal_entries\s+where id = p_old_entry_id\s+for update/i,
    );
  });

  it("raises the structured stale/conflict errors", () => {
    for (const err of [
      "entry_not_found",
      "not_owner",
      "cannot_supersede_deleted",
      "entry_superseded",
    ]) {
      expect(v2Body).toContain(`raise exception '${err}'`);
    }
  });

  it("refuses an already-superseded old entry inside the transaction", () => {
    expect(v2Body).toMatch(
      /if v_old_superseded_by is not null then\s+raise exception 'entry_superseded'/i,
    );
  });

  it("enforces ONE live correction per confirmed original", () => {
    expect(v2Body).toMatch(
      /correction_of = p_old_entry_id[\s\S]*deleted_at is null[\s\S]*superseded_by is null[\s\S]*raise exception 'entry_superseded'/i,
    );
  });

  it("advances superseded_by only via a conditional update and fails hard otherwise", () => {
    expect(v2Body).toMatch(
      /set superseded_by = v_new_entry_id[\s\S]*where id = p_old_entry_id\s+and superseded_by is null/i,
    );
    expect(v2Body).toMatch(
      /if not found then\s+raise exception 'entry_superseded'/i,
    );
  });

  it("validates selected slugs in-transaction: strict format + active taxonomy row", () => {
    expect(v2Body).toMatch(/\^\[a-z0-9_-\]\{1,64\}\$/);
    expect(v2Body).toContain(`raise exception 'invalid_skill_slug'`);
    expect(v2Body).toContain(`raise exception 'skill_slug_unknown'`);
    expect(v2Body).toMatch(/is_active is not false/i);
  });

  it("resolves selected∩rejected to REJECTED deterministically", () => {
    expect(v2Body).toMatch(/not \(s = any\(v_rejected\)\)/i);
  });

  it("persists selected evidence honestly: verified=false, self_declared, insert-only", () => {
    expect(v2Body).toMatch(
      /insert into public\.worker_skills[\s\S]*false, 'self_declared', 'yellow'[\s\S]*on conflict \(worker_id, skill_id\) do nothing/i,
    );
    expect(v2Body).toMatch(
      /insert into public\.journal_entry_skills[\s\S]*on conflict \(journal_entry_id, skill_id\) do nothing/i,
    );
  });

  it("carries decision markers + old skill links in the SAME transaction", () => {
    expect(v2Body).toMatch(
      /'ambiguous_resolved',\s*'skill_rejected',\s*\n?\s*'skill_claim_rejected',\s*'unresolved_dismissed'/i,
    );
    // Re-selected slug's old rejection marker is NOT carried (re-add wins).
    expect(v2Body).toMatch(
      /not \(m\.metric_slug = 'skill_rejected'[\s\S]*any\(v_selected\)\)/i,
    );
    // Link carry excludes skills rejected in THIS save.
    expect(v2Body).toMatch(
      /from public\.journal_entry_skills l[\s\S]*not \(sk\.slug = any\(v_rejected\)\)/i,
    );
  });

  it("never fabricates verification anywhere in the migration", () => {
    expect(migration).not.toMatch(/verified\s*(=|,)\s*true/i);
    expect(migration).not.toMatch(/manager_confirmed/);
  });
});

describe("W0 migration — hardened legacy journal_entry_supersede", () => {
  it("gains the FOR UPDATE lock", () => {
    expect(legacyBody).toMatch(
      /from public\.journal_entries\s+where id = p_old_entry_id\s+for update/i,
    );
  });

  it("refuses a superseded old entry and updates the pointer conditionally", () => {
    expect(legacyBody).toMatch(
      /if v_old_superseded_by is not null then\s+raise exception 'entry_superseded'/i,
    );
    expect(legacyBody).toMatch(
      /where id = p_old_entry_id\s+and superseded_by is null/i,
    );
  });
});

describe("W0 migration — grants and rollback", () => {
  it("revokes public and grants only authenticated on BOTH functions", () => {
    expect(migration).toMatch(
      /revoke all on function public\.journal_entry_supersede_v2\([\s\S]*?\) from public/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.journal_entry_supersede_v2\([\s\S]*?\) to authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.journal_entry_supersede\(\s*uuid, uuid, text, uuid, text, char\(2\), text, text, jsonb\s*\) from public/i,
    );
    expect(migration).not.toMatch(/service_role/);
  });

  it("both functions are security definer with a pinned search_path", () => {
    const definers = migration.match(/security definer/gi) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(2);
    const searchPaths = migration.match(/set search_path = public/gi) ?? [];
    expect(searchPaths.length).toBeGreaterThanOrEqual(2);
  });

  it("rollback drops v2 and restores the prior legacy body", () => {
    expect(rollback).toMatch(
      /drop function if exists public\.journal_entry_supersede_v2/i,
    );
    expect(rollback).toMatch(
      /create or replace function public\.journal_entry_supersede\(/i,
    );
  });
});

describe("W0 app wiring — action + editor conflict UX", () => {
  const actions = readFileSync(
    join(process.cwd(), "lib/journal/actions.ts"),
    "utf-8",
  );
  const editor = readFileSync(
    join(process.cwd(), "components/app/journal-entry-compact-editor.tsx"),
    "utf-8",
  );

  it("the action calls the atomic v2 RPC with selected + rejected slugs", () => {
    expect(actions).toMatch(/["']journal_entry_supersede_v2["']/);
    expect(actions).toMatch(/p_selected_slugs: selectedSlugs/);
    expect(actions).toMatch(/p_rejected_slugs: rejectedSlugs/);
  });

  it("the action no longer performs post-commit evidence writes", () => {
    expect(actions).not.toMatch(/linkSelectedTaxonomySkills/);
    expect(actions).not.toMatch(/carryForwardEntryDecisionMarkers/);
    expect(actions).not.toMatch(/carryForwardEntrySkillLinks/);
  });

  it("the editor renders a distinct conflict state with a reload action", () => {
    expect(editor).toMatch(/result\.code === "entry_superseded"/);
    expect(editor).toMatch(/setConflict\(true\)/);
    expect(editor).toMatch(/journal-compact-conflict/);
    expect(editor).toMatch(/compactEdit\.conflictNote/);
    expect(editor).toMatch(/compactEdit\.conflictReload/);
  });

  it("every locale ships the conflict copy", () => {
    const locales = [
      "da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv",
    ];
    for (const loc of locales) {
      const journal = JSON.parse(
        readFileSync(
          join(process.cwd(), `messages/${loc}/journal.json`),
          "utf-8",
        ),
      ) as { compactEdit?: Record<string, string> };
      expect(journal.compactEdit?.conflictNote, loc).toBeTruthy();
      expect(journal.compactEdit?.conflictReload, loc).toBeTruthy();
    }
  });
});
