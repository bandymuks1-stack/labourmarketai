/**
 * GUARD — owner P0 security directive (2026-11-21). Pins the LATEST
 * definition (migrations apply in filename order) of each object this
 * directive fixed, so a later migration cannot quietly restore the hole:
 *
 *   handle_new_user()            only self-service roles from sign-up metadata
 *   enforce_admin_grant_guard()  no admin without a user JWT unless service role / superuser
 *   grant_org_manager()          only to an ACTIVE governance member of that organization
 *   journal lineage              a new entry corrects only its own person's entry
 *   journal_entry_metrics_write  a manager's metric is labelled manager_corrected
 *
 * The isolated proof is apps/web/tests/e2e/security-p0-isolated.spec.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIG = resolve(__dirname, "../../../../supabase/migrations");
const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

/** The body of the last migration statement that defines `marker`. */
function latest(marker: RegExp, end: RegExp): { file: string; body: string } {
  let found: { file: string; body: string } | null = null;
  for (const f of files) {
    const sql = strip(readFileSync(resolve(MIG, f), "utf8"));
    let m: RegExpExecArray | null;
    const re = new RegExp(marker.source, "gi");
    while ((m = re.exec(sql)) !== null) {
      const rest = sql.slice(m.index);
      const e = new RegExp(end.source, "i").exec(rest);
      found = { file: f, body: e ? rest.slice(0, e.index + e[0].length) : rest };
    }
  }
  if (!found) throw new Error(`no definition for ${marker}`);
  return found;
}

describe("security P0 — latest database definitions keep the fixes", () => {
  it("sign-up metadata can never carry the admin role", () => {
    const { body } = latest(/create or replace function public\.handle_new_user\(\)/, /end \$\$;/);
    expect(body).toMatch(/when claimed in \('worker', 'company', 'agency', 'customer'\) then claimed else null/);
    expect(body).not.toMatch(/r text := nullif\(new\.raw_user_meta_data->>'role', ''\);/);
  });

  it("the admin grant guard refuses an admin value without a user JWT outside the service role", () => {
    const { body } = latest(/create or replace function public\.enforce_admin_grant_guard\(\)/, /\$\$;/);
    expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(body).toContain("session_user not in ('postgres', 'supabase_admin')");
  });

  it("grant_org_manager needs the person's accepted governance membership", () => {
    const { body } = latest(/create or replace function public\.grant_org_manager\(/, /end \$function\$;/);
    expect(body).toContain("from public.company_memberships m");
    expect(body).toContain("m.status = 'active'");
    expect(body).toContain("'not_a_governance_member'");
  });

  it("a journal entry corrects only an entry of the same person, and is never born superseded", () => {
    const { body } = latest(/create or replace function public\.journal_entries_lineage_guard_v1\(\)/, /\$\$;/);
    expect(body).toContain("o.worker_id = new.worker_id");
    expect(body).toContain("new.superseded_by is not null or new.deleted_at is not null");
    const trig = latest(/create trigger journal_entries_lineage_guard_v1/, /;/);
    expect(trig.body).toMatch(/before insert on public\.journal_entries/);
  });

  it("a manager's metric write is labelled manager_corrected", () => {
    const { body } = latest(/create policy journal_entry_metrics_write/, /\)\)\)\)\)\);|\)\)\)\)\);/);
    expect(body).toContain("journal_entry_metrics.source = 'manager_corrected'");
  });
});
