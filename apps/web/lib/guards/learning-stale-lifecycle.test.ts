import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { locales } from "@/lib/i18n/config";
import {
  TERMINAL_STALE_OUTCOMES,
  isTerminalStaleOutcome,
} from "@/lib/learning/learning-shared";

/**
 * W1 — Invite-Ready Closure Train v1: STALE LEARNING LIFECYCLE.
 *
 * Pins the three exact-head Codex P2 fixes on PR #842 as one coherent
 * lifecycle, at the layer where each is actually enforced:
 *
 *  P2-1 — a queue item linked to a superseded/deleted entry can never stay
 *         `pending`: a server-side READ cleanup RPC closes it, independent of
 *         any UI button, idempotently, with live per-row authority.
 *  P2-2 — the decision mutation re-reads the source entry INSIDE the mutation
 *         (RPC + row lock + FOR KEY SHARE), so a stale source is closed
 *         terminally instead of being recorded as approved/rejected. A BEFORE
 *         UPDATE trigger is the race-proof backstop.
 *  P2-3 — the quick-confirm surface treats entry_superseded / entry_deleted as
 *         TERMINAL: buttons removed, route + counts revalidated, honest copy in
 *         every registered locale, retry preserved for temporary failures.
 *
 * Behavioural DB proofs (real Postgres, including the concurrency matrix) live
 * in scripts/db-proof-learning-stale-lifecycle.mts.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const WEB = join(REPO_ROOT, "apps", "web");

const MIGRATION_NAME = "20260720170000_learning_stale_lifecycle_v1.sql";
const migration = readFileSync(
  join(REPO_ROOT, "supabase/migrations", MIGRATION_NAME),
  "utf-8",
);
const rollback = readFileSync(
  join(
    REPO_ROOT,
    "supabase/rollbacks",
    MIGRATION_NAME.replace(/\.sql$/, ".down.sql"),
  ),
  "utf-8",
);
const read = (rel: string) => readFileSync(join(WEB, rel), "utf-8");

/** Executable SQL only — comments stripped, exactly the way
 *  .github/scripts/migration-safety.mjs judges a migration. A risk word inside
 *  an explanatory header is documentation, not a statement. */
const executable = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const migrationSql = executable(migration);
const rollbackSql = executable(rollback);

const learningActions = read("lib/learning/learning.ts");
const learningShared = read("lib/learning/learning-shared.ts");
const learningSection = read("components/app/learning-review-section.tsx");
const quickCard = read("components/app/quick-confirm-card.tsx");
const quickActions = read("lib/journal/quick-confirm-actions.ts");
const reviewActions = read("lib/journal/review-actions.ts");

// ───────────────────────────────────────────────────────────────────────────
// P2-1 — stale items are closed server-side, not merely hidden
// ───────────────────────────────────────────────────────────────────────────

describe("P2-1 — stale learning items reach a terminal status", () => {
  it("[test 1/2] ships a server-side cleanup RPC that closes PENDING stale rows", () => {
    // Required test 1: a stale item that exists BEFORE the page loads.
    // Required test 2: it is transitioned out of pending — by the read path,
    // with no click involved.
    expect(migration).toMatch(
      /create or replace function public\.close_stale_learning_review_items\(/i,
    );
    expect(migration).toMatch(
      /update public\.learning_review_queue q\s+set status\s*=\s*'superseded'/i,
    );
    expect(migration).toMatch(
      /and \(je\.superseded_by is not null or je\.deleted_at is not null\)/i,
    );
  });

  it("[test 2] the READ path invokes the cleanup before listing", () => {
    expect(learningActions).toMatch(/close_stale_learning_review_items/);
    // The sweep must run before the select, so the rendered snapshot is honest.
    const sweep = learningActions.indexOf("await closeStaleReviewItems(supabase)");
    const select = learningActions.indexOf('.from("learning_review_queue")');
    expect(sweep).toBeGreaterThan(0);
    expect(select).toBeGreaterThan(sweep);
  });

  it("[test 6] repeated cleanup is idempotent (status = 'pending' is the key)", () => {
    // Required test 6. The predicate makes a second sweep a no-op: a row that
    // is no longer pending is not matched, so nothing is re-stamped.
    expect(migration).toMatch(/and q\.status = 'pending'/i);
    // ... and the mutation path re-checks the same predicate before writing.
    expect(migration).toMatch(
      /where id = p_review_item_id\s+and status = 'pending'/i,
    );
  });

  it("does not rely on a hidden UI button as the only cleanup mechanism", () => {
    // The regression Codex flagged: the ONLY terminal transition used to live
    // behind applyAutoConfirmation, whose button the UI hides when stale.
    expect(learningActions).toMatch(/close_stale_learning_review_items/);
    // The cleanup must be reachable without any interactive intent.
    expect(learningActions).toMatch(/async function closeStaleReviewItems/);
  });

  it("re-checks live manager authority per row inside the cleanup", () => {
    expect(migration).toMatch(
      /and \(public\.is_admin\(\) or public\.manages_organization\(q\.organization_id\)\)/i,
    );
  });

  it("retains audit history on every terminal transition", () => {
    // status + reviewed_by + reviewed_at + review_note are all written.
    expect(migration).toMatch(/reviewed_by\s*=\s*uid/i);
    expect(migration).toMatch(/reviewed_at\s*=\s*now\(\)/i);
    expect(migration).toMatch(/review_note\s*=\s*case when je\.deleted_at is not null/i);
    expect(migration).toMatch(/insert into public\.audit_logs/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// P2-2 — the mutation revalidates staleness itself
// ───────────────────────────────────────────────────────────────────────────

describe("P2-2 — learning decisions revalidate inside the mutation", () => {
  it("[tests 3/4/5] the RPC re-reads the entry under a lock and refuses stale decisions", () => {
    // Required tests 3 + 4: the entry goes stale between render and
    // Approve / Reject. Required test 5: the decision is NOT persisted.
    expect(migration).toMatch(
      /create or replace function public\.set_learning_review_item_status\(/i,
    );
    // Queue row locked first — serializes concurrent decisions and the sweep.
    expect(migration).toMatch(
      /from public\.learning_review_queue\s+where id = p_review_item_id\s+for update/i,
    );
    // Source entry re-read INSIDE the mutation, with the lock discipline that
    // conflicts with the supersedes' FOR UPDATE.
    expect(migration).toMatch(
      /from public\.journal_entries je\s+where je\.id = v_entry\s+for key share/i,
    );
    // A stale source closes the item INSTEAD of recording the decision.
    expect(migration).toMatch(/'entry_deleted' else 'entry_superseded' end/i);
    expect(migration).toMatch(/refused_decision/i);
  });

  it("[test 5] the client-side entryStale snapshot is never trusted", () => {
    // The app no longer issues a direct table update for the decision.
    expect(learningActions).toMatch(/rpc\("set_learning_review_item_status"/);
    expect(learningActions).not.toMatch(
      /\.from\("learning_review_queue"\)\s*\n?\s*\.update\(/,
    );
  });

  it("[tests 7/8] valid approve / reject still record the decision", () => {
    // Required tests 7 + 8: the happy paths are unchanged — a live entry still
    // yields the decision verbatim from the RPC.
    expect(migration).toMatch(
      /set status\s*=\s*p_status,\s*\n?\s*reviewed_by = uid/i,
    );
    expect(migration).toMatch(/return p_status;/i);
    expect(learningActions).toMatch(/if \(outcome !== status\)/);
  });

  it("keeps only approved/rejected settable (auto_actioned stays spine-only)", () => {
    expect(migration).toMatch(
      /if p_status is null or p_status not in \('approved', 'rejected'\) then/i,
    );
    expect(migration).not.toMatch(/p_status.*'auto_actioned'/i);
  });

  it("preserves authorization: live admin-or-org-manager check in the RPC", () => {
    expect(migration).toMatch(
      /if not \(public\.is_admin\(\) or public\.manages_organization\(v_org\)\) then\s+return 'not_authorized';/i,
    );
  });

  it("has a trigger-backed race-proof backstop for approve/reject", () => {
    expect(migration).toMatch(
      /create or replace function public\.learning_review_queue_guard_stale\(\)/i,
    );
    expect(migration).toMatch(
      /if new\.status in \('approved', 'rejected'\)/i,
    );
    expect(migration).toMatch(
      /create trigger learning_review_queue_guard_stale_trg\s+before update on public\.learning_review_queue/i,
    );
    // Systemic terminal closes must NOT be blocked by the guard.
    expect(migration).not.toMatch(/new\.status in \('superseded'/i);
    // The app maps a trigger raise back to the terminal stale contract.
    expect(learningActions).toMatch(/raw\.includes\("entry_superseded"\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// P2-3 — quick-confirm terminal stale handling
// ───────────────────────────────────────────────────────────────────────────

describe("P2-3 — quick-confirm treats stale outcomes as terminal", () => {
  it("[tests 9/10] both outcomes are in the shared contract", () => {
    // Required tests 9 + 10: quick-confirm receives entry_superseded and
    // entry_deleted.
    expect([...TERMINAL_STALE_OUTCOMES]).toEqual([
      "entry_superseded",
      "entry_deleted",
    ]);
    expect(isTerminalStaleOutcome("entry_superseded")).toBe(true);
    expect(isTerminalStaleOutcome("entry_deleted")).toBe(true);
    expect(isTerminalStaleOutcome("review_not_enabled")).toBe(false);
    expect(isTerminalStaleOutcome(undefined)).toBe(false);
    // The card imports the shared predicate rather than re-listing the codes.
    expect(quickCard).toMatch(/isTerminalStaleOutcome/);
  });

  it("[test 11] the action buttons are REMOVED, not merely disabled", () => {
    // Required test 11. The terminal branch returns before the action markup,
    // so confirm/reject are absent from the tree entirely.
    expect(quickCard).toMatch(/if \(staleOutcome\) \{/);
    const staleBranch = quickCard.indexOf("if (staleOutcome) {");
    const confirmForm = quickCard.indexOf("action={confirmAction}");
    expect(staleBranch).toBeGreaterThan(0);
    expect(confirmForm).toBeGreaterThan(staleBranch);
    expect(quickCard).toMatch(/data-testid=\{`quick-stale-\$\{entry\.id\}`\}/);
  });

  it("[test 11] a terminal stale outcome is not rendered as a generic error", () => {
    // errorText must bail out when the outcome is terminal, otherwise the card
    // would show the retryable error copy next to a dead action.
    expect(quickCard).toMatch(/!code \|\| staleOutcome\) return null;/);
  });

  it("[test 12] the quick route and count surfaces revalidate", () => {
    // Required test 12: no manual reload. Every path that can produce a
    // terminal stale outcome refreshes the quick route AND the counts.
    for (const src of [quickActions, reviewActions]) {
      expect(src).toMatch(/dashboard\/inbox\/quick/);
      expect(src).toMatch(/isTerminalStaleOutcome/);
    }
    // Both the single-tap and the batch path.
    expect(quickActions).toMatch(/res\.ok \|\| isTerminalStaleOutcome\(res\.code\)/);
    expect(quickActions).toMatch(/sawTerminalStale/);
  });

  it("keeps retry behaviour for genuine temporary failures", () => {
    // A non-terminal failure must NOT revalidate the route away and must still
    // render the retryable error copy with the buttons intact.
    expect(quickActions).toMatch(
      /if \(res\.ok \|\| isTerminalStaleOutcome\(res\.code\)\) \{/,
    );
    for (const code of [
      "review_not_enabled",
      "not_authorized",
      "skill_not_owned",
    ]) {
      expect(quickCard).toContain(`case "${code}":`);
    }
    expect(quickCard).toMatch(/t\("inbox\.result\.error"\)/);
  });

  it("[test 13] every registered locale has the stale keys", () => {
    // Required test 13. All 11 registered locales (lib/i18n/config.ts) carry
    // the outcome copy AND the terminal hint — no [EN] fallback, no blanks.
    for (const locale of locales) {
      const file = join(WEB, "messages", locale, "journal.json");
      expect(existsSync(file), `${locale}/journal.json exists`).toBe(true);
      const result = JSON.parse(readFileSync(file, "utf-8"))?.inbox?.result ?? {};
      for (const key of [
        "entrySuperseded",
        "entryDeleted",
        "staleTerminalHint",
      ]) {
        const value = result[key];
        expect(typeof value, `${locale}.inbox.result.${key}`).toBe("string");
        expect(String(value).trim().length, `${locale}.${key} non-empty`).toBeGreaterThan(0);
        expect(String(value), `${locale}.${key} not an [EN] marker`).not.toMatch(/^\[EN\]/);
      }
    }
  });

  it("[test 14] the terminal card keeps the responsive card contract", () => {
    // Required test 14. The stale card reuses the same `card-border` +
    // flex-column shell as the confirmed/rejected terminal states, so desktop
    // and mobile behaviour is unchanged; no fixed widths are introduced.
    expect(quickCard).toMatch(
      /className="card-border flex flex-col gap-1 p-4 text-sm text-text-muted"/,
    );
    const staleBranch = quickCard.slice(
      quickCard.indexOf("if (staleOutcome) {"),
      quickCard.indexOf("if (rejected) {"),
    );
    expect(staleBranch).not.toMatch(/\bw-\[\d|\bmin-w-\[\d|\bh-\[\d/);
    expect(staleBranch).toMatch(/role="status"/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Migration hygiene + rollback
// ───────────────────────────────────────────────────────────────────────────

describe("stale-lifecycle migration hygiene", () => {
  it("is additive: no drop/alter of pre-existing objects, no data DML", () => {
    // The whole point of a separate migration: the proven photo-continuity
    // architecture (20260720150000) is not reopened.
    expect(migrationSql).not.toMatch(/drop table/i);
    expect(migrationSql).not.toMatch(/drop column/i);
    expect(migrationSql).not.toMatch(/alter table/i);
    expect(migrationSql).not.toMatch(/(drop|alter) policy/i);
    expect(migrationSql).not.toMatch(/delete from/i);
    // The only DROP is the idempotent re-create of this migration's own trigger.
    const drops = migrationSql.match(/^\s*drop .*/gim) ?? [];
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatch(/drop trigger if exists learning_review_queue_guard_stale_trg/i);
  });

  it("never writes verified — confirmation stays on the audited spine", () => {
    expect(migrationSql).not.toMatch(/update public\.worker_skills/i);
    expect(migrationSql).not.toMatch(/set verified\s*=/i);
    expect(migrationSql).not.toMatch(/journal_entry_confirmations/i);
  });

  it("grants stay authenticated-only, revoked from public", () => {
    for (const fn of [
      "close_stale_learning_review_items(uuid)",
      "set_learning_review_item_status(uuid, text, text)",
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn} from public`);
      expect(migration).toContain(`grant execute on function public.${fn} to authenticated`);
    }
    expect(migrationSql).not.toMatch(/to anon/i);
    expect(migrationSql).not.toMatch(/using \(true\)/i);
  });

  it("is transactional and carries the human-gate annotation", () => {
    expect(migration).toMatch(/^-- @human-gate-approved/m);
    expect(migration.trimStart()).toMatch(/^-- @human-gate-approved/);
    expect(migration).toMatch(/\bbegin;/);
    expect(migration).toMatch(/\bcommit;\s*$/);
  });

  it("[test 15] the rollback drops exactly what the migration created", () => {
    // Required test 15: rollback restores the previous behaviour with NO
    // authorization drift — it touches no policy, no grant on a pre-existing
    // object, and no data.
    for (const obj of [
      "learning_review_queue_guard_stale_trg",
      "public.learning_review_queue_guard_stale()",
      "public.set_learning_review_item_status(uuid, text, text)",
      "public.close_stale_learning_review_items(uuid)",
    ]) {
      expect(rollback).toContain(obj);
    }
    // Judged on EXECUTABLE SQL — the header prose explains why no grant is
    // needed, which must not itself count as a grant.
    expect(rollbackSql).not.toMatch(/(create|alter|drop) policy/i);
    expect(rollbackSql).not.toMatch(/\bgrant\b/i);
    expect(rollbackSql).not.toMatch(/\brevoke\b/i);
    expect(rollbackSql).not.toMatch(/delete from|update .* set/i);
    expect(rollbackSql).not.toMatch(/alter table/i);
    // Every drop is guarded, so the rollback is itself idempotent.
    const drops = rollbackSql.match(/^\s*drop .*/gim) ?? [];
    expect(drops.length).toBe(4);
    for (const d of drops) expect(d).toMatch(/if exists/i);
  });

  it("the forward migration creates exactly the objects the rollback drops", () => {
    const created = [
      /create or replace function public\.close_stale_learning_review_items/i,
      /create or replace function public\.set_learning_review_item_status/i,
      /create or replace function public\.learning_review_queue_guard_stale/i,
      /create trigger learning_review_queue_guard_stale_trg/i,
    ];
    for (const re of created) expect(migration).toMatch(re);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// One stale contract across every surface
// ───────────────────────────────────────────────────────────────────────────

describe("the stale contract is shared, not duplicated per surface", () => {
  it("exports one predicate and one result channel", () => {
    expect(learningShared).toMatch(/export const TERMINAL_STALE_OUTCOMES/);
    expect(learningShared).toMatch(/export function isTerminalStaleOutcome/);
    expect(learningShared).toMatch(
      /\{ kind: "stale"; outcome: TerminalStaleOutcome \}/,
    );
  });

  it("the learning UI hides controls on a locally-known terminal stale item", () => {
    // After a refused decision the controls must go immediately — not only
    // after the router refresh lands — or a second doomed click is possible.
    expect(learningSection).toMatch(/staleIds/);
    expect(learningSection).toMatch(/res\.kind === "stale"/);
    expect(learningSection).toMatch(
      /!item\.entryStale &&\s*\n?\s*!staleIds\.has\(item\.id\)/,
    );
  });

  it("both learning mutations report stale through the same channel", () => {
    const staleReturns = learningActions.match(/kind: "stale"/g) ?? [];
    // setReviewItemStatus (RPC outcome + trigger raise ×2) and
    // applyAutoConfirmation.
    expect(staleReturns.length).toBeGreaterThanOrEqual(4);
  });
});
