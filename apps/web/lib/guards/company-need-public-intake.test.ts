import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * ANONYMOUS PUBLIC DEMAND INTAKE v1 — SAFETY GUARDS.
 *
 * The public /company-need route now PERSISTS an anonymous structured need
 * for follow-up via a dedicated write-only table + a SECURITY DEFINER RPC.
 * This guard pins the safe-by-default shape so it cannot silently regress:
 *   - a dedicated table (not customer_requests) with RLS enabled and NO
 *     anon/authenticated read/insert/update/delete policy → write-only via
 *     the RPC, no public reads;
 *   - the RPC is the only anon write path (execute granted to anon), and it
 *     constrains the country to the PR #675 target markets;
 *   - the app persists via the RPC and degrades honestly when it is not
 *     applied yet (42883/42P01), never a false success;
 *   - the success copy says the request was received for follow-up (human),
 *     never claims AI/automated processing;
 *   - a rollback file ships alongside the migration.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const readApp = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const MIGRATION = "supabase/migrations/20260707120000_company_need_public_intake.sql";
const ROLLBACK = "supabase/rollbacks/20260707120000_company_need_public_intake.down.sql";
const TABLE = "public.company_need_public_intakes";
const RPC = "submit_company_need_public_v1";

// Executable SQL only (strip -- line and /* */ block comments) so the
// explanatory header (which names customer_requests to say it is NOT touched)
// does not trip the content assertions.
const stripSqlComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("the intake migration is a safe-by-default write-only surface", () => {
  const sql = stripSqlComments(readRepo(MIGRATION)).toLowerCase();

  it("creates the dedicated table and enables RLS on it", () => {
    expect(sql).toContain(`create table if not exists ${TABLE}`);
    expect(sql).toContain(`alter table ${TABLE} enable row level security`);
  });

  it("does NOT touch customer_requests (authenticated path stays untouched)", () => {
    expect(sql).not.toContain("customer_requests");
  });

  it("adds NO anon/authenticated read/insert/update/delete policy on the table", () => {
    // Zero CREATE POLICY statements → deny-all for anon + authenticated;
    // only the SECURITY DEFINER RPC (owner-run) writes, service-role reads.
    expect(sql).not.toMatch(/create\s+policy/);
    // and no direct table grant to anon/public (write is via the function only)
    expect(sql).not.toMatch(/grant[\s\S]{0,80}?on\s+table[\s\S]{0,40}?to\s+(anon|public)/);
  });

  it("exposes exactly one anon write path — the SECURITY DEFINER RPC", () => {
    expect(sql).toContain(`create or replace function public.${RPC}`);
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toMatch(/grant\s+execute\s+on\s+function[\s\S]*?to\s+anon/);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*?from\s+public/);
  });

  it("constrains the country to the PR #675 10-market list inside the RPC", () => {
    for (const cc of ["lt", "lv", "ee", "pl", "de", "nl", "dk", "no", "se", "fi"]) {
      expect(sql).toContain(`'${cc}'`);
    }
  });

  it("ships a rollback file that drops only the new function + table", () => {
    expect(existsSync(join(REPO_ROOT, ROLLBACK))).toBe(true);
    const down = readRepo(ROLLBACK).toLowerCase();
    expect(down).toContain(`drop function if exists public.${RPC}`);
    expect(down).toContain(`drop table if exists ${TABLE}`);
  });
});

describe("the app persists via the RPC and degrades honestly", () => {
  const helper = readApp("lib/staffing/company-need-public-intake.ts");
  const action = readApp("lib/staffing/company-need-form-actions.ts");

  it("calls the anon RPC by name", () => {
    expect(helper).toContain(`rpc("${RPC}"`);
  });

  it("treats undefined-function/undefined-table as 'unavailable' (honest degrade)", () => {
    expect(helper).toContain("42883");
    expect(helper).toContain("42P01");
    expect(helper).toContain("unavailable");
  });

  it("the server action persists on submit and threads a `persisted` flag", () => {
    expect(action).toContain("persistPublicCompanyNeed");
    expect(action).toContain("persisted");
  });
});

describe("success copy is honest (received for human follow-up, not AI-processed)", () => {
  const ACTIVE = ["lt", "en", "ru"] as const;
  const catalog = (loc: string) =>
    JSON.parse(readApp(`messages/${loc}.json`)) as {
      companyNeed: Record<string, string>;
    };

  it("received copy exists in every active locale and mentions follow-up, not AI", () => {
    for (const loc of ACTIVE) {
      const cn = catalog(loc).companyNeed;
      expect(typeof cn.receivedTitle).toBe("string");
      expect(cn.receivedBody.length).toBeGreaterThan(20);
      expect(cn.receivedBody).not.toMatch(/\bAI\b|dirbtin|искусственн/i);
    }
  });

  it("the form renders a distinct received-success testid when persisted", () => {
    const form = readApp("components/app/company-need-form.tsx");
    expect(form).toContain("company-need-received");
    expect(form).toContain("labels.receivedTitle");
    expect(form).toContain("state.persisted");
  });

  it("the honest note above the form no longer claims 'nothing is saved here'", () => {
    for (const loc of ACTIVE) {
      const note = catalog(loc).companyNeed.honestNote.toLowerCase();
      expect(note).not.toMatch(/neišsaugoma|nothing is saved|ничего не сохран/);
    }
  });
});
