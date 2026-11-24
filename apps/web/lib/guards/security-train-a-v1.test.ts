import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Security train A (2026-08-17 advisor triage) — static guards for the four
 * policy-correction DRAFT migrations and the one deliberate non-fix.
 *
 * House style (contact-disclosure-requests-migration.test.ts /
 * chat-visibility-rls.test.ts): read the migration SQL, strip comments so a
 * rollback comment block can never satisfy an assertion, and pin the
 * predicates that make the authority matrix hold. The behavioural matrix each
 * block encodes:
 *
 *   anonymous          — every corrected policy is `to authenticated`; every
 *                        new helper has EXECUTE revoked from anon + public.
 *   owner / admin      — explicit branches preserved.
 *   org member/manager — admitted ONLY via ACTIVE membership/engagement rows
 *                        scoped by organization_id equality.
 *   wrong organization — org-scoped equality predicates: no branch admits an
 *                        org other than the row's own.
 *   revoked member     — every membership branch requires status = 'active';
 *                        membership_actor_role_v1 returns NULL for a revoked
 *                        row by the same clause.
 *   cross-tenant       — no corrected policy retains `using (true)`.
 */

const root = join(__dirname, "..", "..", "..", "..");
const MIG_DIR = join(root, "supabase", "migrations");
const RB_DIR = join(root, "supabase", "rollbacks");

const FILES = {
  catalog: "20260817120000_catalog_least_privilege_v1",
  invitations: "20260817121000_invitation_org_authority_v1",
  disclosure: "20260817122000_contact_disclosure_org_authority_v1",
  finance: "20260817123000_finance_org_authority_v1",
} as const;

function readMig(base: string): string {
  return readFileSync(join(MIG_DIR, `${base}.sql`), "utf8");
}
/** Comment-stripped executable SQL — assertions can never be satisfied by a
 *  comment or by the DOWN block quoted at the end of the file. */
function exec(base: string): string {
  return readMig(base)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

describe("draft gate, human-gate marker, rollback pairing", () => {
  it("every migration carries the DRAFT header and the mandate-cited marker", () => {
    for (const base of Object.values(FILES)) {
      const sql = readMig(base);
      expect(sql, base).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
      // The real migration-safety.mjs ANNOTATION regex (line-anchored).
      expect(sql, base).toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
      // Comment text wraps across `-- ` lines — normalise before phrase checks.
      const prose = sql.replace(/\r?\n--[ \t]?/g, " ");
      expect(prose, base).toMatch(/owner mandate\s+2026-08-17/);
      expect(prose, base).toMatch(/§4 migration\s+authority/);
    }
  });

  it("every migration has a paired rollback restoring the pre-change state", () => {
    for (const base of Object.values(FILES)) {
      expect(existsSync(join(RB_DIR, `${base}.down.sql`)), base).toBe(true);
    }
    // The rollbacks restore policies/functions — they never drop tables.
    for (const base of Object.values(FILES)) {
      const down = readFileSync(join(RB_DIR, `${base}.down.sql`), "utf8");
      expect(down, base).not.toMatch(/drop table/i);
    }
  });

  it("no destructive statements anywhere (policy/function corrections only)", () => {
    for (const base of Object.values(FILES)) {
      const sql = exec(base);
      expect(sql, base).not.toMatch(/drop table/i);
      expect(sql, base).not.toMatch(/drop column/i);
      expect(sql, base).not.toMatch(/\bdelete from\b/i);
      expect(sql, base).not.toMatch(/\btruncate\b/i);
    }
  });
});

describe("Fix B — catalog least privilege (productivity_units, profession_templates, skill_icons)", () => {
  const sql = exec(FILES.catalog);
  const tables = ["productivity_units", "profession_templates", "skill_icons"];

  it("replaces each using(true) SELECT policy and admits NO anonymous reader", () => {
    for (const t of tables) {
      expect(sql).toMatch(new RegExp(`drop policy if exists ${t}_select on public\\.${t}`));
      expect(sql).toMatch(
        new RegExp(`create policy ${t}_select on public\\.${t}\\s+for select\\s+to authenticated`),
      );
    }
    // Cross-tenant closure: the unconditional read is gone from this surface.
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/to anon\b/);
  });

  it("platform rows stay shared; org rows need an ACTIVE membership or engagement in THAT org", () => {
    for (const t of tables) {
      const body = sql.split(`create policy ${t}_select`)[1]?.split(";")[0] ?? "";
      expect(body, t).toMatch(/organization_id is null/);
      expect(body, t).toMatch(/public\.is_admin\(\)/);
      // wrong-organization exclusion: equality against the ROW's org id.
      expect(body, t).toMatch(
        new RegExp(`m\\.organization_id = ${t}\\.organization_id`),
      );
      expect(body, t).toMatch(
        new RegExp(`ec\\.organization_id = ${t}\\.organization_id`),
      );
      // revoked-member exclusion: both branches require active status.
      expect(body, t).toMatch(/m\.status = 'active'/);
      expect(body, t).toMatch(/ec\.status = 'active'/);
    }
  });

  it("does not touch the admin-only write policies", () => {
    expect(sql).not.toMatch(/_write/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)/i);
  });
});

describe("Fix C — invitation org-bound authority", () => {
  const sql = exec(FILES.invitations);

  it("helper mirrors the create-side predicate and is closed to anon/public", () => {
    expect(sql).toMatch(
      /create or replace function public\.invitation_org_authority_v1\(p_organization_id uuid\)/,
    );
    expect(sql).toMatch(/p_organization_id is not null/);
    expect(sql).toMatch(/o\.owner_profile_id = auth\.uid\(\)/);
    expect(sql).toMatch(/public\.manages_organization\(p_organization_id\)/);
    expect(sql).toMatch(
      /revoke execute on function public\.invitation_org_authority_v1\(uuid\) from public/,
    );
    expect(sql).toMatch(
      /revoke execute on function public\.invitation_org_authority_v1\(uuid\) from anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.invitation_org_authority_v1\(uuid\) to authenticated/,
    );
  });

  it("SELECT policy: inviter OR admin OR org authority, authenticated only", () => {
    const body = sql.split("create policy invitations_select")[1]?.split(";")[0] ?? "";
    expect(body).toMatch(/to authenticated/);
    expect(body).toMatch(/inviter_profile_id = auth\.uid\(\)/);
    expect(body).toMatch(/public\.is_admin\(\)/);
    expect(body).toMatch(/public\.invitation_org_authority_v1\(organization_id\)/);
  });

  it("revoke/resend/mark-delivery gain the SAME org branch, NULL-safe", () => {
    for (const fn of [
      "revoke_invitation_v1",
      "resend_invitation_v1",
      "mark_invitation_delivery_v1",
    ]) {
      const body = sql.split(`create or replace function public.${fn}`)[1]?.split("end $$")[0] ?? "";
      expect(body, fn).toMatch(/v_inviter is distinct from uid/);
      expect(body, fn).toMatch(/public\.invitation_org_authority_v1\(v_org\)/);
      expect(body, fn).toMatch(/organization_id/);
      expect(body, fn).toMatch(/security definer/);
      expect(body, fn).toMatch(/set search_path to 'public'/);
    }
  });

  it("resend keeps token rotation invariants (hash format, pending-only, bounded)", () => {
    const body = sql.split("create or replace function public.resend_invitation_v1")[1] ?? "";
    expect(body).toMatch(/\^\[0-9a-f\]\{64\}\$/);
    expect(body).toMatch(/'resend_limit'/);
    expect(body).toMatch(/v_status <> 'pending'/);
  });

  it("token-bound person flows stay untouched (accept/decline/preview not redefined)", () => {
    expect(sql).not.toMatch(/function public\.accept_invitation/);
    expect(sql).not.toMatch(/function public\.decline_invitation_v1/);
    expect(sql).not.toMatch(/function public\.get_invitation_preview_v1/);
    expect(sql).not.toMatch(/function public\.create_invitation_v1/);
  });

  it("app keeps 'my sent invitations' person-scoped with an explicit filter", () => {
    const src = readFileSync(join(root, "apps", "web", "lib", "invitations", "network.ts"), "utf8");
    const start = src.indexOf("export async function listMySentInvitations");
    const end = src.indexOf("export ", start + 10);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/\.eq\("inviter_profile_id", user\.id\)/);
  });
});

describe("Fix C — contact-disclosure org-bound authority", () => {
  const sql = exec(FILES.disclosure);

  it("SELECT policy adds org demand authority beside owner/subject/admin", () => {
    const body =
      sql.split("create policy contact_disclosure_requests_select")[1]?.split(";")[0] ?? "";
    expect(body).toMatch(/to authenticated/);
    expect(body).toMatch(/owner_id = auth\.uid\(\)/);
    expect(body).toMatch(/w\.profile_id = auth\.uid\(\)/);
    expect(body).toMatch(/public\.is_admin\(\)/);
    expect(body).toMatch(/public\.has_org_demand_access\(organization_id\)/);
  });

  it("withdraw allows owner OR org demand authority, NULL-safe", () => {
    const body =
      sql.split("create or replace function public.withdraw_contact_disclosure_request_v1")[1] ??
      "";
    expect(body).toMatch(/v_row\.owner_id is distinct from v_uid/);
    expect(body).toMatch(/public\.has_org_demand_access\(v_row\.organization_id\)/);
    // The state machine is unchanged: only an open request can be withdrawn,
    // and the change is audit-logged through the shared logger.
    expect(body).toMatch(/v_row\.status <> 'created'/);
    expect(body).toMatch(/perform public\.contact_disclosure_log_change\(/);
  });

  it("respond stays SUBJECT-WORKER-bound by design (not redefined here)", () => {
    expect(sql).not.toMatch(/function public\.respond_contact_disclosure_request_v1/);
    expect(sql).not.toMatch(/function public\.propose_contact_disclosure_request_v1/);
  });
});

describe("Fix C — finance org-bound authority", () => {
  const sql = exec(FILES.finance);

  it("helper: legacy owner OR org owner/admin via membership_actor_role_v1; managers excluded", () => {
    const body =
      sql.split("create or replace function public.finance_company_authority_v1")[1]?.split("$$;")[0] ??
      "";
    expect(body).toMatch(/p_company_id is not null/);
    expect(body).toMatch(/public\.owns_company\(p_company_id\)/);
    expect(body).toMatch(/o\.legacy_company_id = p_company_id/);
    expect(body).toMatch(
      /public\.membership_actor_role_v1\(auth\.uid\(\), o\.id\) in \('owner','admin'\)/,
    );
    // Least privilege: money data does NOT extend to manager roles.
    expect(body).not.toMatch(/'manager'/);
    expect(body).not.toMatch(/'external_manager'/);
    expect(sql).toMatch(
      /revoke execute on function public\.finance_company_authority_v1\(uuid\) from anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.finance_company_authority_v1\(uuid\) to authenticated/,
    );
  });

  it("fr_select: creator OR admin OR company authority, authenticated only", () => {
    const body = sql.split("create policy fr_select")[1]?.split(";")[0] ?? "";
    expect(body).toMatch(/to authenticated/);
    expect(body).toMatch(/created_by = auth\.uid\(\)/);
    expect(body).toMatch(/public\.is_admin\(\)/);
    expect(body).toMatch(/public\.finance_company_authority_v1\(company_id\)/);
  });

  it("all three RPC authority clauses use the org-aware helper, none keep a bare owns_company gate", () => {
    for (const fn of [
      "create_finance_record_v1",
      "update_finance_record_v1",
      "set_finance_record_status_v1",
    ]) {
      const body = sql.split(`create or replace function public.${fn}`)[1]?.split("end $$")[0] ?? "";
      expect(body, fn).toMatch(/public\.finance_company_authority_v1\(/);
      expect(body, fn).not.toMatch(/public\.owns_company\(/);
    }
  });

  it("input validation and abuse caps survive the authority change verbatim", () => {
    expect(sql).toMatch(/\^\[0-9\]\{1,12\}\$/);
    expect(sql).toMatch(/>= 2000/);
    expect(sql).toMatch(/'record_limit_reached'/);
    expect(sql).toMatch(/public\.can_manage_project\(v_project\)/);
  });
});

describe("Fix A — worker_absence_scheduling stays SECURITY DEFINER by documented design", () => {
  /**
   * The 2026-08-17 advisor ERROR (lint 0010 security_definer_view) on
   * public.worker_absence_scheduling is a DOCUMENTED, INTENTIONAL exception,
   * not an oversight. 20260808120000_worker_absence_scheduling_view_v1.sql
   * narrowed worker_absences RLS so a manager reads the full row (including
   * the private `note` and health-adjacent `absence_type`) ONLY while
   * status='requested'; approved-absence scheduling facts flow through the
   * definer view, which carries no private column BY CONSTRUCTION. Converting
   * the view to security_invoker would require re-admitting managers to
   * approved base rows — reintroducing the exact leak the migration closed
   * (its header rejects that as "option B"). These assertions pin the design
   * so a future "advisor cleanup" cannot silently undo it.
   */
  const VIEW_MIG = "20260808120000_worker_absence_scheduling_view_v1";
  const sql = exec(VIEW_MIG);

  it("the view exposes scheduling columns only — no note, no absence_type", () => {
    const view = sql.split("create view public.worker_absence_scheduling")[1]?.split(";")[0] ?? "";
    expect(view).toMatch(/a\.start_date/);
    expect(view).toMatch(/a\.status/);
    expect(view).not.toMatch(/\bnote\b/);
    expect(view).not.toMatch(/absence_type/);
    expect(view).toMatch(/a\.status = 'approved'/);
    expect(view).toMatch(/public\.caller_manages_worker\(a\.worker_id\)/);
  });

  it("anon is revoked from the view; base policy keeps the requested-only manager window", () => {
    expect(sql).toMatch(/revoke all on public\.worker_absence_scheduling from anon/);
    expect(sql).toMatch(/public\.caller_manages_worker\(worker_id\) and status = 'requested'/);
  });

  it("no migration flips the view to security_invoker without handling the private columns", () => {
    const offenders = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => {
        const body = readFileSync(join(MIG_DIR, f), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/--[^\n]*/g, "");
        return (
          body.includes("worker_absence_scheduling") && /security_invoker/i.test(body)
        );
      });
    expect(
      offenders,
      "a migration sets security_invoker on worker_absence_scheduling — that re-opens " +
        "the W12 note/absence_type leak unless the column split is solved first; " +
        "read the Fix A doc block in this test before proceeding",
    ).toEqual([]);
  });
});

describe("ledger honesty — new migrations recorded as deferred, never as applied", () => {
  const ledger = readFileSync(join(root, "docs", "APPLIED_LEDGER.md"), "utf8");
  const deferred = ledger.split("## Deferred")[1] ?? "";

  it("all four migrations sit in the Deferred section, marked pending lead-session apply", () => {
    for (const base of Object.values(FILES)) {
      expect(deferred).toContain(`${base}.sql`);
    }
    for (const base of Object.values(FILES)) {
      const entry = deferred.split(`${base}.sql`)[1]?.slice(0, 400) ?? "";
      expect(entry, base).toMatch(/PENDING APPLY BY LEAD SESSION/);
    }
  });

  it("none of them is claimed applied in the applied section", () => {
    const applied = ledger.split("## Deferred")[0];
    for (const base of Object.values(FILES)) {
      expect(applied).not.toContain(base);
    }
  });
});
