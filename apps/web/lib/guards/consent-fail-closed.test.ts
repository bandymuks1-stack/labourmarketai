import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Consent-and-disclosure v1 — fail-closed migration guard.
 *
 * Pins the SQL invariants of
 * supabase/migrations/20260711130000_privacy_consent_and_disclosure_v1.sql:
 * default-invisible workers, append-only ledgers, auth.uid()-only RPCs,
 * no consent backfill, no admin grant path, stale-version fail-closed.
 * (Required tests 1, 2, 6, 9–17, 19–22, 25 of the consent goal.)
 */

const root = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  root,
  "supabase",
  "migrations",
  "20260711130000_privacy_consent_and_disclosure_v1.sql",
);
const ROLLBACK = join(
  root,
  "supabase",
  "rollbacks",
  "20260711130000_privacy_consent_and_disclosure_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const sqlNoComments = sql.replace(/--[^\n]*/g, "");

describe("migration + rollback files", () => {
  it("migration and paired rollback exist (required test 25)", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = readFileSync(ROLLBACK, "utf8");
    // Rollback restores the ORIGINAL policies and drops everything added.
    expect(down).toMatch(/create policy workers_select/);
    expect(down).toMatch(/drop table if exists public\.privacy_consent_events/);
    expect(down).toMatch(/drop table if exists public\.personal_data_disclosures/);
  });

  it("is acknowledged RED (human-gate annotation present — owner-authorized)", () => {
    expect(sql).toMatch(/^--\s*@human-gate-approved/m);
  });
});

describe("fail-closed employer visibility (required tests 1, 2, 6, 17)", () => {
  it("workers/worker_skills/worker_professions SELECT go through can_view_worker", () => {
    for (const [policy, col] of [
      ["workers_select", "id"],
      ["worker_skills_select", "worker_id"],
      ["worker_professions_select", "worker_id"],
    ] as const) {
      const re = new RegExp(
        `create policy ${policy}[\\s\\S]{0,200}?using \\(public\\.can_view_worker\\(${col}\\)\\)`,
      );
      expect(sqlNoComments).toMatch(re);
    }
  });

  it("bare is_employer() never appears as a standalone policy condition", () => {
    // is_employer may appear ONLY inside can_view_worker, AND-ed with the
    // discoverability consent check. Inspect just each policy's USING clause
    // (the first 250 chars of the segment), not the unrelated SQL after it.
    const policies = sqlNoComments
      .split(/create policy/)
      .slice(1)
      .map((p) => p.slice(0, 250))
      .filter((p) => /is_employer/.test(p));
    expect(policies).toHaveLength(0);
    const fn = sqlNoComments.split("function public.can_view_worker")[1] ?? "";
    const employerBranch = fn.split("is_employer()")[1] ?? "";
    expect(employerBranch).toMatch(/worker_profile_discoverable/);
  });

  it("discoverability requires CURRENT consent text version (required test 19)", () => {
    const fn = sqlNoComments.split("function public.worker_profile_discoverable")[1]?.split("$$;")[0] ?? "";
    expect(fn).toMatch(/action = 'granted' and e\.consent_text_version = p\.current_version/);
    expect(fn).toMatch(/order by e\.created_at desc/);
    expect(fn).toMatch(/coalesce\(/); // no row => false, fail closed
  });

  it("withdrawal wins immediately: newest ledger row decides (required test 17)", () => {
    // limit 1 over created_at desc means a later 'withdrawn' row overrides
    // any earlier grant with no update-in-place.
    const fn = sqlNoComments.split("function public.worker_profile_discoverable")[1]?.split("$$;")[0] ?? "";
    expect(fn).toMatch(/limit 1/);
  });

  it("withdrawal never deletes profile/CV/journal data (required test 18)", () => {
    const withdraw = sqlNoComments.split("function public.withdraw_profile_discoverability_consent")[1]?.split("$$;")[0] ?? "";
    expect(withdraw).not.toMatch(/delete\s+from/i);
    expect(withdraw).not.toMatch(/update\s+public\.(workers|profiles|journal)/i);
  });
});

describe("append-only consent ledger (required tests 15, 16)", () => {
  it("no UPDATE or DELETE policy exists on privacy_consent_events", () => {
    const section = sqlNoComments.split("privacy_consent_events")[1] ?? "";
    expect(sqlNoComments).not.toMatch(
      /create policy [\w]+\s+on public\.privacy_consent_events for (update|delete)/,
    );
    expect(section).toBeTruthy();
  });

  it("a BEFORE UPDATE OR DELETE trigger blocks every mutation (incl. service role)", () => {
    expect(sqlNoComments).toMatch(
      /create trigger privacy_consent_events_append_only\s+before update or delete on public\.privacy_consent_events/,
    );
    expect(sqlNoComments).toMatch(/raise exception 'privacy ledger is append-only/);
  });

  it("worker sees ONLY their own history; employers/admins have no ledger SELECT (required test 14)", () => {
    const m = sqlNoComments.match(
      /create policy privacy_consent_events_select_own[\s\S]{0,200}?using \((.+)\);/,
    );
    expect(m?.[1].trim()).toBe("user_id = auth.uid()");
    // No other policy of ANY kind on the events table:
    const all = new Set(
      (sqlNoComments.match(/create policy ([\w]+)\s+on public\.privacy_consent_events/g) ?? []).map(
        (s) => s.replace(/\s+/g, " "),
      ),
    );
    expect([...all]).toHaveLength(1);
  });

  it("disclosure ledger allows only the one-way revoked_access_at stamp", () => {
    expect(sqlNoComments).toMatch(/personal_data_disclosures_append_only/);
    expect(sqlNoComments).toMatch(/old\.revoked_access_at is not null/);
    expect(sqlNoComments).toMatch(/rows are immutable except a one-way revoked_access_at stamp/);
  });
});

describe("no backfill, no fake consent (required test 2 + REAL CONSENTS rule)", () => {
  it("the ONLY insert in the migration is the two-row purposes seed", () => {
    const inserts = sqlNoComments.match(/insert into public\.[\w]+/g) ?? [];
    // grant/withdraw RPC bodies contain inserts into privacy_consent_events /
    // personal_data_disclosures — those run only per real user action. The
    // only STATEMENT-level (non-function) insert is the purposes seed.
    const topLevel = sqlNoComments
      .split(/create or replace function/)[0]
      .match(/insert into public\.[\w]+/g) ?? [];
    expect(topLevel).toEqual(["insert into public.privacy_consent_purposes"]);
    expect(inserts.filter((i) => i.includes("privacy_consent_purposes"))).toHaveLength(1);
  });

  it("no UPDATE of profiles.consent_* and no granted backfill anywhere", () => {
    expect(sqlNoComments).not.toMatch(/update\s+public\.profiles/i);
    expect(sqlNoComments).not.toMatch(/consent_data_processing/);
    // Every ledger insert is a VALUES insert of the caller's own row —
    // never an INSERT ... SELECT bulk backfill.
    const inserts =
      sqlNoComments.match(/insert into public\.privacy_consent_events[\s\S]*?;/g) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(4);
    for (const ins of inserts) {
      expect(ins).toMatch(/values/);
      expect(ins.split(/\bvalues\b/)[0]).not.toMatch(/\bselect\b/i);
    }
  });
});

describe("RPC authorization model (required tests 13, 20, 21)", () => {
  it("grant/withdraw RPCs derive the subject from auth.uid() and take NO user-id parameter", () => {
    for (const fn of [
      "grant_profile_discoverability_consent",
      "withdraw_profile_discoverability_consent",
      "grant_employer_data_disclosure",
      "withdraw_employer_data_disclosure",
    ]) {
      const body = sqlNoComments.split(`function public.${fn}`)[1]?.split("$$;")[0] ?? "";
      expect(body, fn).toMatch(/auth\.uid\(\)/);
      const signature = body.split("returns")[0];
      expect(signature, fn).not.toMatch(/p_user/i);
      expect(signature, fn).not.toMatch(/uuid[\s\S]*?user/i);
    }
  });

  it("no admin-grants-consent function exists (required test 20)", () => {
    // Admin RPCs are read-only counts/states; no function grants or edits
    // consent on behalf of another user.
    const adminFns = [
      ...new Set(sqlNoComments.match(/function public\.admin_[\w]+/g) ?? []),
    ];
    expect(adminFns.sort()).toEqual([
      "function public.admin_list_worker_privacy_states",
      "function public.admin_privacy_readiness_counts",
    ]);
    for (const name of ["admin_list_worker_privacy_states", "admin_privacy_readiness_counts"]) {
      const body = sqlNoComments.split(`function public.${name}`)[1]?.split("$$;")[0] ?? "";
      expect(body, name).not.toMatch(/insert into public\.privacy_consent_events/);
    }
  });

  it("every RPC grant targets authenticated only — never anon or public (required test 21)", () => {
    const grants = sqlNoComments.match(/grant execute on function [^;]+;/g) ?? [];
    expect(grants.length).toBeGreaterThanOrEqual(10);
    for (const g of grants) expect(g).toMatch(/to authenticated;/);
    expect(sqlNoComments).not.toMatch(/grant [^;]*to anon/);
    // Ledger tables: SELECT only for authenticated (writes only via RPC).
    expect(sqlNoComments).toMatch(/revoke all on public\.privacy_consent_events from authenticated/);
    expect(sqlNoComments).toMatch(/grant select on public\.privacy_consent_events to authenticated/);
  });

  it("search_path is pinned on every function", () => {
    const defs = sqlNoComments.match(/create or replace function[\s\S]*?language/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(12);
    const missing = (sqlNoComments.match(/create or replace function [\s\S]*?\$\$;/g) ?? []).filter(
      (d) => !/set search_path = public/.test(d),
    );
    expect(missing).toHaveLength(0);
  });
});

describe("employer-specific disclosure constraints (required tests 9–12, 22)", () => {
  const grantFn =
    sqlNoComments.split("function public.grant_employer_data_disclosure")[1]?.split("$$;")[0] ?? "";

  it("requires a real recipient organization (test 10)", () => {
    expect(grantFn).toMatch(/unknown_recipient_organization/);
    expect(grantFn).toMatch(/from public\.organizations o where o\.id = p_recipient_organization_id/);
  });

  it("requires a real, typed context (test 11)", () => {
    expect(grantFn).toMatch(/'company_need', 'booking', 'service_request'/);
    expect(grantFn).toMatch(/unknown_context/);
  });

  it("enforces the closed selected-fields whitelist (test 12)", () => {
    expect(grantFn).toMatch(/'full_name', 'phone', 'email', 'cv_document',/);
    expect(grantFn).toMatch(/field_not_allowed/);
  });

  it("disclosure execution is admin-gated, consent-gated and payload-narrowing (tests 9, 21, 22 + Phase 14)", () => {
    const rec = sqlNoComments.split("function public.record_personal_data_disclosure")[1]?.split("$$;")[0] ?? "";
    expect(rec).toMatch(/public\.is_admin\(\)/);
    expect(rec).toMatch(/DISCLOSURE_AUTHORIZATION_REQUIRED/);
    expect(rec).toMatch(/PAYLOAD_WIDER_THAN_CONSENT/);
  });

  it("disclosure permission is recipient+context specific and version-current (tests 10, 11, 19)", () => {
    const has = sqlNoComments.split("function public.has_employer_data_disclosure")[1]?.split("$$;")[0] ?? "";
    expect(has).toMatch(/e\.recipient_organization_id = p_recipient_organization_id/);
    expect(has).toMatch(/e\.context_type = p_context_type/);
    expect(has).toMatch(/e\.context_id = p_context_id/);
    expect(has).toMatch(/consent_text_version = p\.current_version/);
  });
});

describe("profiles stay contact-fail-closed (test 8 / audit latent risk 1)", () => {
  it("no migration ever grants employers a profiles SELECT policy", () => {
    const dir = join(root, "supabase", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const content = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      const profilePolicies = content
        .split(/create policy/)
        .slice(1)
        .filter((p) => /on\s+(public\.)?profiles\b/.test(p.split("using")[0] ?? ""));
      for (const p of profilePolicies) {
        expect(p, `profiles policy in ${f} must not use is_employer`).not.toMatch(/is_employer/);
      }
    }
  });
});
