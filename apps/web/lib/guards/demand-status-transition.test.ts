import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEMAND_CLOSEABLE_STATUSES,
  DEMAND_REOPENABLE_STATUSES,
} from "@/lib/demand/demand-lifecycle-model";

/**
 * CUSTOMER_REQUESTS STATUS-TRANSITION GUARD (PR15 hardening).
 *
 * The owner-row UPDATE RLS (needed by the live close / reopen /
 * draft-remove flows) also allowed a direct PostgREST PATCH of `status`
 * to ANY CHECK-list value — including the admin-only pipeline states.
 * Migration 20260705150000 installs a DB trigger whose whitelist mirrors
 * the app's closed transition set. These pins keep migration, rollback
 * and app model in lockstep so invalid transitions can never silently
 * come back.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MIGRATION =
  "supabase/migrations/20260705150000_customer_requests_status_transition_guard.sql";
const ROLLBACK =
  "supabase/rollbacks/20260705150000_customer_requests_status_transition_guard.down.sql";
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("migration + rollback exist and stay in lockstep", () => {
  it("ships the trigger migration with its paired rollback", () => {
    expect(existsSync(join(REPO_ROOT, MIGRATION))).toBe(true);
    expect(existsSync(join(REPO_ROOT, ROLLBACK))).toBe(true);
  });

  it("the rollback fully reverses the migration (trigger + function)", () => {
    const down = read(ROLLBACK);
    expect(down).toMatch(/drop trigger if exists customer_requests_status_transition_guard/);
    expect(down).toMatch(
      /drop function if exists public\.customer_requests_status_transition_guard\(\)/,
    );
  });
});

describe("the trigger is narrow, invoker-only and whitelist-closed", () => {
  const sql = () => read(MIGRATION);
  // CRLF-safe comment strip — SQL comments may legitimately DISCUSS the
  // banned shapes; only executable SQL is checked.
  const code = () =>
    sql()
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");

  it("is human-gated and NOT security definer", () => {
    expect(sql()).toMatch(/^--\s*@human-gate-approved/);
    expect(code()).not.toMatch(/security\s+definer/i);
  });

  it("fires on UPDATE of status only (INSERT stays RPC-pinned)", () => {
    expect(sql()).toMatch(/before update of status on public\.customer_requests/);
    expect(sql()).not.toMatch(/before (insert|delete)/i);
  });

  it("bypasses exactly two caller classes: no-JWT and admin", () => {
    expect(sql()).toMatch(/auth\.uid\(\) is null or public\.is_admin\(\)/);
  });

  it("whitelists exactly the app's owner transitions", () => {
    const s = sql();
    expect(s).toMatch(/'draft' and new\.status in \('submitted', 'closed'\)/);
    expect(s).toMatch(/'submitted' and new\.status = 'closed'/);
    expect(s).toMatch(/'closed' and new\.status = 'submitted'/);
    // Owners must never reach the admin pipeline states through ANY branch.
    expect(s).not.toMatch(/new\.status\s*(=|in)[^)\n]*('in_review'|'needs_followup'|'approved')/);
    // Invalid transitions raise loudly — never pass silently.
    expect(s).toMatch(/raise exception 'invalid demand status transition/);
  });

  it("the whitelist mirrors the app lifecycle model", () => {
    // close: submitted → closed; reopen: closed → submitted. If the model
    // ever widens, this test forces a matching (owner-gated) DB change.
    expect([...DEMAND_CLOSEABLE_STATUSES]).toEqual(["submitted"]);
    expect([...DEMAND_REOPENABLE_STATUSES]).toEqual(["closed"]);
  });

  it("the app's draft-remove path stays inside the whitelist", () => {
    // deleteDemandDraft closes a DRAFT (draft → closed) with an explicit
    // status precondition — the trigger allows exactly that shape.
    const drafts = readFileSync(
      join(APP_ROOT, "lib", "demand", "demand-drafts.ts"),
      "utf8",
    );
    expect(drafts).toMatch(/\.update\(\{ status: "closed" \}\)/);
    expect(drafts).toMatch(/\.eq\("status", "draft"\)/);
  });

  it("close/reopen keep their status preconditions (never hit the raise)", () => {
    const lifecycle = readFileSync(
      join(APP_ROOT, "lib", "demand", "demand-lifecycle.ts"),
      "utf8",
    );
    expect(lifecycle).toMatch(/status: "closed"[\s\S]{0,200}\.eq\("status", "submitted"\)/);
    expect(lifecycle).toMatch(/status: "submitted"[\s\S]{0,200}\.eq\("status", "closed"\)/);
  });
});
