import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the Org Demand Spine Stage B migration
 * (20260805100000_org_demand_row_scope_v1.sql) — OWNER-GATED, ships UNAPPLIED.
 *
 * Pins the package's honesty invariants:
 *   1. all three demand-chain tables gain a NULLABLE organization_id column
 *      referencing public.organizations (additive — the profile_id/owner_id
 *      legs stay);
 *   2. the three SELECT policies are extended ADDITIVELY: every original leg
 *      is kept and only an org-membership leg is appended; write policies
 *      are untouched in v1;
 *   3. organization_id is stamped SERVER-SIDE only — from the caller's
 *      company/org bridge via resolve_caller_organization_id(). No RPC
 *      accepts an organization id from the client (no p_organization_id
 *      parameter anywhere);
 *   4. demand_shortlist (direct-DML write path, no RPC) is stamped by a
 *      BEFORE INSERT OR UPDATE trigger;
 *   5. the file carries NO gate-approval annotation — it ships RED by
 *      design, and the owner applies it manually after review;
 *   6. a paired rollback exists and restores the original policy legs.
 */

const REPO = resolve(__dirname, "..", "..", "..", "..");
const MIG = resolve(
  REPO,
  "supabase/migrations/20260805100000_org_demand_row_scope_v1.sql",
);
const DOWN = resolve(
  REPO,
  "supabase/rollbacks/20260805100000_org_demand_row_scope_v1.down.sql",
);

const raw = readFileSync(MIG, "utf8");
const sql = raw.toLowerCase();
// Comment-stripped view: prose can never satisfy a structural assertion.
const code = sql
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("org-demand-row-scope v1 — columns are additive and nullable", () => {
  it("adds organization_id to all three demand-chain tables", () => {
    for (const table of [
      "customer_requests",
      "demand_shortlist",
      "booking_requests",
    ]) {
      expect(code).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+add column if not exists organization_id uuid references public\\.organizations\\(id\\)`,
        ),
      );
      expect(code).toContain(`create index if not exists ${table}_organization_idx`);
    }
  });

  it("never makes organization_id NOT NULL and never drops a profile/owner leg column", () => {
    expect(code).not.toMatch(/organization_id\s+uuid[^;]*not null/);
    expect(code).not.toMatch(/drop column/);
    expect(code).not.toMatch(/alter column\s+(profile_id|owner_id)/);
  });
});

describe("org-demand-row-scope v1 — RLS is ADDITIVE (reads only)", () => {
  const ORG_LEG =
    /organization_id is not null\s+and \(public\.belongs_to_organization\(organization_id\)\s+or public\.manages_organization\(organization_id\)\)/;

  it("customer_requests_select keeps the original legs and appends the org leg", () => {
    const policy = code.slice(
      code.indexOf("create policy customer_requests_select"),
      code.indexOf("create policy demand_shortlist_select"),
    );
    expect(policy).toMatch(/profile_id = auth\.uid\(\)/);
    expect(policy).toMatch(/public\.is_admin\(\)/);
    expect(policy).toMatch(ORG_LEG);
  });

  it("demand_shortlist_select keeps the original legs and appends the org leg", () => {
    const policy = code.slice(
      code.indexOf("create policy demand_shortlist_select"),
      code.indexOf("create policy booking_requests_select"),
    );
    expect(policy).toMatch(/owner_id = auth\.uid\(\)/);
    expect(policy).toMatch(/public\.is_admin\(\)/);
    expect(policy).toMatch(ORG_LEG);
  });

  it("booking_requests_select keeps owner + addressed-worker + admin legs and appends the org leg", () => {
    const start = code.indexOf("create policy booking_requests_select");
    const policy = code.slice(start, code.indexOf(";", start));
    expect(policy).toMatch(/owner_id = auth\.uid\(\)/);
    expect(policy).toMatch(
      /w\.id = worker_id and w\.profile_id = auth\.uid\(\)/,
    );
    expect(policy).toMatch(/public\.is_admin\(\)/);
    expect(policy).toMatch(ORG_LEG);
  });

  it("touches NO write policy (INSERT/UPDATE/DELETE/ALL stay profile-derived in v1)", () => {
    // The only policy statements in the file are the three SELECT recreations.
    const created = [...code.matchAll(/create policy\s+([a-z0-9_]+)/g)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual([
      "booking_requests_select",
      "customer_requests_select",
      "demand_shortlist_select",
    ]);
    expect(code).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/);
    const dropped = [...code.matchAll(/drop policy if exists\s+([a-z0-9_]+)/g)].map(
      (m) => m[1],
    );
    expect(new Set(dropped)).toEqual(new Set(created));
  });
});

describe("org-demand-row-scope v1 — stamping is server-side only", () => {
  it("no function accepts an organization id from the client", () => {
    // Comment-stripped view: the header PROSE names the forbidden parameter
    // to document its absence; only executable SQL is checked here.
    expect(code).not.toMatch(/p_organization_id/);
    expect(code).not.toMatch(/p_org_id/);
  });

  it("the bridge resolver is zero-argument (auth.uid() only) and anon-revoked", () => {
    expect(code).toMatch(
      /create or replace function public\.resolve_caller_organization_id\(\)/,
    );
    expect(code).toMatch(/c\.profile_id = auth\.uid\(\)/);
    expect(code).toMatch(
      /revoke all on function public\.resolve_caller_organization_id\(\) from anon/,
    );
  });

  it("all four demand-chain RPCs stamp via resolve_caller_organization_id()", () => {
    for (const fn of [
      "save_customer_request",
      "save_demand_draft",
      "submit_demand_request",
      "propose_booking_request",
    ]) {
      const start = code.indexOf(`create or replace function public.${fn}(`);
      expect(start, `${fn} must be redefined in the migration`).toBeGreaterThan(
        -1,
      );
      const next = code.indexOf("create or replace function", start + 1);
      const body = code.slice(start, next === -1 ? undefined : next);
      expect(body, `${fn} must stamp organization_id server-side`).toMatch(
        /public\.resolve_caller_organization_id\(\)/,
      );
      expect(body, `${fn} must write the organization_id column`).toMatch(
        /organization_id/,
      );
    }
  });

  it("demand_shortlist is stamped by a BEFORE INSERT OR UPDATE trigger (direct-DML path has no RPC)", () => {
    expect(code).toMatch(
      /create or replace function public\.demand_shortlist_stamp_organization\(\)/,
    );
    expect(code).toMatch(
      /create trigger demand_shortlist_stamp_org\s+before insert or update on public\.demand_shortlist/,
    );
    // The trigger function is trigger-only: nobody holds EXECUTE on it.
    expect(code).toMatch(
      /revoke all on function public\.demand_shortlist_stamp_organization\(\) from anon/,
    );
    expect(code).toMatch(
      /revoke all on function public\.demand_shortlist_stamp_organization\(\) from authenticated/,
    );
    expect(code).not.toMatch(
      /grant execute on function public\.demand_shortlist_stamp_organization/,
    );
  });

  it("every SECURITY DEFINER function in the file carries an explicit anon revoke", () => {
    // Belt-and-braces on top of secdef-local-reset-reproducibility.test.ts.
    const fns = [
      "resolve_caller_organization_id",
      "demand_shortlist_stamp_organization",
      "save_customer_request",
      "save_demand_draft",
      "submit_demand_request",
      "propose_booking_request",
    ];
    for (const fn of fns) {
      expect(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\) from anon`,
        ).test(code),
        `${fn} must be explicitly anon-revoked in this migration`,
      ).toBe(true);
    }
  });
});

describe("org-demand-row-scope v1 — owner gate honesty", () => {
  it("carries NO gate-approval annotation (ships RED by design)", () => {
    expect(raw).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("declares itself owner-gated and never-auto-applied", () => {
    expect(sql).toMatch(/owner-gated/);
    expect(sql).toMatch(/do not apply automatically/);
    expect(sql).toMatch(/never `db push`/);
  });

  it("the owner package doc exists", () => {
    expect(
      existsSync(resolve(REPO, "docs/human-gates/org-demand-row-scope-gate.md")),
    ).toBe(true);
  });
});

describe("org-demand-row-scope v1 — paired rollback", () => {
  it("exists and restores the ORIGINAL policy legs verbatim (no org leg left behind)", () => {
    expect(existsSync(DOWN)).toBe(true);
    const down = readFileSync(DOWN, "utf8").toLowerCase();
    const downCode = down
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(downCode).toMatch(
      /create policy customer_requests_select on public\.customer_requests for select\s+using \(profile_id = auth\.uid\(\) or public\.is_admin\(\)\)/,
    );
    expect(downCode).toMatch(
      /create policy demand_shortlist_select on public\.demand_shortlist for select\s+using \(owner_id = auth\.uid\(\) or public\.is_admin\(\)\)/,
    );
    expect(downCode).not.toMatch(/belongs_to_organization/);
    // Columns are dropped (safe: additive), functions restored, anon revokes kept.
    expect(downCode).toMatch(
      /alter table public\.customer_requests drop column if exists organization_id/,
    );
    expect(downCode).toMatch(/drop function if exists public\.resolve_caller_organization_id\(\)/);
    expect(downCode).toMatch(/from anon/);
    // Restored bodies must NOT still stamp (byte-exact originals).
    expect(downCode).not.toMatch(/resolve_caller_organization_id\(\)\)/);
  });
});
