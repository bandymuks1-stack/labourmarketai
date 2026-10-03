import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * EVID-2 - SELF_DECLARED != CONFIRMED_BY_AUTHORIZED_OTHER_PARTY.
 *
 * Owner decision (binding): a person may declare, submit, attach evidence to
 * and describe their own work, but must not turn their own assertion into
 * independently confirmed work by reviewing it themselves.
 *
 * Production (read 2026-10-03): the three confirmation writers
 * (`review_journal_entry`, `confirm_entry_and_verify_skills`,
 * `apply_learning_auto_confirmation`) and the direct-INSERT RLS policy all
 * authorise on `is_admin() OR manages_organization(org)` and never compare the
 * reviewer with the entry's worker. 5 of 21 confirmation rows were
 * self-authored and 2 of 6 verified skills were verified by their own subject.
 *
 * The migration is forward-only and rewrites NO row: those historical rows are
 * classified at READ time (lib/journal/review-status.ts isSelfConfirmation,
 * pinned by self-confirmation-not-independent.test.ts). Runtime proof (58
 * assertions on a scratch PostgreSQL 16 with the production catalog):
 * scripts/db-proof/journal-self-review-block.sh.
 */

const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const NAME = "20261003150000_journal_confirmation_self_review_block_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const down = read(`supabase/rollbacks/${NAME}.down.sql`);
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
const body = code(sql);

describe("EVID-2 migration shape", () => {
  it("carries the human-gate marker; the rollback carries none", () => {
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(down).not.toContain("@human-gate-approved");
  });

  it("is named by the section-16 timestamp convention and avoids the historical-model forbidden words", () => {
    expect(NAME).toMatch(/^\d{14}_[a-z0-9_]+$/);
    expect(NAME).not.toMatch(/evidence|player|team|calendar|history|visual/);
    expect(NAME > "20261003144407").toBe(true);
  });

  it("only CREATE OR REPLACEs the five functions: same signatures, no new surface", () => {
    const fns = [...body.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(fns.sort()).toEqual(
      [
        "apply_learning_auto_confirmation",
        "confirm_entry_and_verify_skills",
        "journal_entry_confirmations_guard",
        "review_journal_entry",
        "reviewable_journal_entry_ids",
      ].sort(),
    );
    expect(body).not.toMatch(/\bCREATE\s+(TABLE|POLICY|TRIGGER|VIEW)\b/i);
    // ACL hygiene only: REVOKEs (no-ops on production); nothing is ever GRANTed.
    expect(body).not.toMatch(/\bGRANT\b/i);
    for (const m of body.matchAll(/revoke all on function public\.\w+\([^)]*\) from (\w+);/gi)) {
      expect(["public", "anon", "authenticated"]).toContain(m[1]);
    }
    expect(body).not.toMatch(/\bDROP\b/i);
    expect(body).not.toMatch(/\bALTER\b/i);
  });

  it("rewrites no existing row (append-only history, no data statement)", () => {
    expect(body).not.toMatch(/\b(delete\s+from|truncate)\b/i);
    expect(body).not.toMatch(/update\s+public\.journal_entry_confirmations/i);
    // The only UPDATEs are the pre-existing worker_skills/learning-queue
    // writes inside the replaced function bodies (unchanged logic).
    for (const m of body.matchAll(/update\s+public\.(\w+)/gi)) {
      expect(["worker_skills", "learning_review_queue"]).toContain(m[1]);
    }
  });

  it("keeps SECURITY DEFINER with a pinned search_path on every replaced function", () => {
    const defs = body.split("CREATE OR REPLACE FUNCTION").slice(1);
    expect(defs).toHaveLength(5);
    for (const d of defs) {
      expect(d).toMatch(/SECURITY DEFINER/);
      expect(d).toMatch(/SET search_path TO 'public'/);
    }
  });
});

describe("EVID-2 authority rules", () => {
  it("the guard trigger function is the choke point and is NULL-safe", () => {
    const guard = body.slice(
      body.indexOf("journal_entry_confirmations_guard"),
      body.indexOf("review_journal_entry"),
    );
    expect(guard).toContain("raise exception 'self_review_not_allowed'");
    expect(guard).toMatch(/w\.profile_id is not null/);
    expect(guard).toMatch(/coalesce\(w\.profile_id = new\.confirmer_id, false\)/);
    // the existing stale-entry refusals are retained
    expect(guard).toContain("'entry_deleted'");
    expect(guard).toContain("'entry_superseded'");
    expect(guard).toContain("for update");
  });

  it("every writer returns the clean status BEFORE any insert", () => {
    for (const fn of [
      "review_journal_entry",
      "confirm_entry_and_verify_skills",
      "apply_learning_auto_confirmation",
    ]) {
      const start = body.indexOf(`public.${fn}(`);
      const end = body.indexOf("end $function$;", start);
      const def = body.slice(start, end);
      const selfAt = def.indexOf("return 'self_review_not_allowed'");
      const insertAt = def.indexOf("insert into public.journal_entry_confirmations");
      expect(selfAt).toBeGreaterThan(0);
      expect(insertAt).toBeGreaterThan(selfAt);
      expect(def).toMatch(/coalesce\(w\.profile_id = uid, false\)/);
      // authority comes first: an outsider still just gets not_authorized
      expect(def.indexOf("not_authorized")).toBeLessThan(selfAt);
    }
  });

  it("a historical self-confirmation does not hide the entry from OTHER reviewers", () => {
    const start = body.indexOf("public.reviewable_journal_entry_ids(");
    const def = body.slice(start);
    expect(def).toMatch(/coalesce\(w2\.profile_id = c\.confirmer_id, false\)/);
    expect(def).toMatch(/coalesce\(w\.profile_id = auth\.uid\(\), false\)/);
  });

  it("the rollback restores the prior bodies (no self-review rule left)", () => {
    expect(down).not.toContain("self_review_not_allowed");
    expect(down).not.toMatch(/\b(drop|alter)\b/i);
    expect((down.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(5);
  });

  it("a runtime proof script and its prelude/seed ship with the migration", () => {
    for (const f of ["sh", "prelude.sql", "seed.sql"]) {
      expect(existsSync(join(ROOT, `scripts/db-proof/journal-self-review-block.${f}`))).toBe(true);
    }
  });
});

describe("EVID-2 app wording", () => {
  const LOCALES_WITH_JOURNAL_RESULT_KEYS = ["en", "lt", "ru", "de", "nl", "pl"] as const;

  it("the refusal has an honest, non-player message in every locale that carries the inbox result keys", () => {
    for (const l of LOCALES_WITH_JOURNAL_RESULT_KEYS) {
      const raw = read(`apps/web/messages/${l}/journal.json`);
      const json = JSON.parse(raw) as { inbox: { result: Record<string, string> } };
      const msg = json.inbox.result.selfReviewNotAllowed;
      expect(typeof msg, l).toBe("string");
      expect(msg.length, l).toBeGreaterThan(20);
      expect(msg.toLowerCase(), l).not.toMatch(/demo|player/);
    }
  });

  it("every review surface maps the code, treats it as terminal, and never turns it into a generic error", () => {
    const actions = read("apps/web/lib/journal/review-actions.ts");
    expect(actions).toContain('"self_review_not_allowed"');
    const membership = read("apps/web/lib/operations/org-membership.ts");
    expect(membership).toContain("self_review_not_allowed");
    const inbox = read("apps/web/components/app/journal-inbox-entry.tsx");
    expect(inbox.match(/selfReviewNotAllowed/g)?.length).toBe(2);
    expect(inbox).toMatch(/"self_review_not_allowed",\s*\n?\s*"review_not_enabled"/);
    const quick = read("apps/web/components/app/quick-confirm-card.tsx");
    expect(quick).toContain("selfReviewNotAllowed");
  });

  it("the read-side classification of historical self-confirmations is still in place", () => {
    const rs = read("apps/web/lib/journal/review-status.ts");
    expect(rs).toContain("export function isSelfConfirmation");
    expect(rs).toContain("export function deriveIndependentReviewResult");
  });
});
