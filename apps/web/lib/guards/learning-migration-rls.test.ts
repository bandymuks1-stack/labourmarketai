import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 human_in_loop_learning — migration safety + RLS guard.
 *
 * The learning model is RED-class (3 new tables + ONE SECURITY DEFINER RPC,
 * owner-applied). This guard statically pins the safety invariants so a future
 * edit can't loosen them:
 *   - additive only (CREATE, never ALTER/DROP of an existing table);
 *   - RLS enabled on every new table; policies owner/org-scoped via
 *     owns_worker / manages_organization / is_admin — never using(true), never
 *     anon/public; grants to `authenticated` only;
 *   - the one RPC is SECURITY DEFINER with `set search_path = public`, revoked
 *     from public and granted execute to authenticated only;
 *   - the human-gate annotation is present;
 *   - a guarded, reversible rollback exists (refuses to drop a non-empty table).
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIG = join(REPO, "supabase", "migrations", "20260627132759_human_in_loop_learning.sql");
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260627132759_human_in_loop_learning.down.sql",
);
const read = (p: string) => readFileSync(p, "utf8");

/** Strip SQL comments so honesty notes ("NO using(true)", "ONE SECURITY DEFINER
 *  RPC") are not mistaken for executable SQL. */
const stripSqlComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const TABLES = ["learning_policy_settings", "learning_signals", "learning_review_queue"] as const;

describe("human_in_loop_learning migration is additive + RLS-safe", () => {
  const raw = read(MIG);
  const sql = stripSqlComments(raw).toLowerCase();

  it("creates the three tables additively (create if not exists, no destructive ops)", () => {
    for (const t of TABLES) {
      expect(sql, `create ${t}`).toMatch(new RegExp(`create table if not exists public\\.${t}`));
    }
    // No ALTER/DROP of any OTHER existing table.
    expect(sql).not.toMatch(
      /alter table public\.(?!learning_policy_settings|learning_signals|learning_review_queue)/,
    );
    expect(sql).not.toMatch(/drop table(?! if exists public\.learning_)/);
    expect(sql).not.toMatch(/delete from|truncate /);
  });

  it("enables RLS on every new table", () => {
    for (const t of TABLES) {
      expect(sql, `rls ${t}`).toMatch(
        new RegExp(`alter table public\\.${t}\\s+enable row level security`),
      );
    }
  });

  it("scopes every policy via owns_worker / manages_organization / is_admin (no bare access)", () => {
    // Policy predicates use the existing authority helpers, never a raw flag.
    expect(sql).toMatch(/manages_organization\(organization_id\)/);
    expect(sql).toMatch(/owns_worker\(subject_worker_id\)/);
    // The review queue + policy writes are org-manager scoped.
    expect(sql).toMatch(/create policy learning_review_queue_update/);
    expect(sql).toMatch(/create policy learning_policy_settings_update/);
  });

  it("never opens a table with using(true) or to anon/public", () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/with\s+check\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/\bto anon\b/);
    // `\bto public\b` (not bare `to public`) so `insert into public.…` is not a
    // false match.
    expect(sql).not.toMatch(/\bto public\b/);
  });

  it("grants only to authenticated (never anon/public), no delete grant on append-only signals", () => {
    expect(sql).toMatch(/grant select, insert, update on public\.learning_policy_settings to authenticated/);
    expect(sql).toMatch(/grant select, insert\s+on public\.learning_signals\s+to authenticated/);
    expect(sql).toMatch(/grant select, insert, update\s+on public\.learning_review_queue\s+to authenticated/);
    // signals are append-only: no UPDATE/DELETE policy or grant on them.
    expect(sql).not.toMatch(/create policy learning_signals_(update|delete)/);
  });

  it("the one RPC is SECURITY DEFINER, search_path-pinned, revoked from public, granted to authenticated", () => {
    expect(sql).toMatch(
      /create or replace function public\.apply_learning_auto_confirmation\(p_review_item_id uuid\)/,
    );
    expect(sql).toMatch(/security definer set search_path = public/);
    expect(sql).toMatch(/revoke all on function public\.apply_learning_auto_confirmation\(uuid\) from public/);
    expect(sql).toMatch(
      /grant execute on function public\.apply_learning_auto_confirmation\(uuid\) to authenticated/,
    );
    // No OTHER new SECURITY DEFINER functions (only the one approved RPC).
    expect((sql.match(/security definer/g) ?? []).length).toBe(1);
  });

  it("carries the human-gate annotation (RED, owner-applied)", () => {
    expect(raw).toMatch(/@human-gate-approved/);
    expect(raw).toMatch(/DO NOT APPLY automatically/i);
  });
});

describe("human_in_loop_learning rollback is present and guarded", () => {
  it("exists, refuses to drop non-empty tables, and drops the RPC", () => {
    expect(existsSync(ROLLBACK), "rollback file present").toBe(true);
    const down = read(ROLLBACK).toLowerCase();
    expect(down).toMatch(/refusing automatic rollback/);
    for (const t of TABLES) {
      expect(down, `drop ${t}`).toMatch(new RegExp(`drop table if exists public\\.${t}`));
    }
    expect(down).toMatch(/drop function if exists public\.apply_learning_auto_confirmation\(uuid\)/);
  });
});
