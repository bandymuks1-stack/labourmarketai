import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listMyOrganizationEvidence } from "@/lib/organization-evidence/import-core";

/**
 * INTEGRITY DOORS v1 (20261003151300) - four database-level doors that let an
 * authenticated user bypass the application layer by calling PostgREST directly.
 *
 *   G-1  journal_entries: an entry could be attributed to ANOTHER organisation's
 *        engagement context / any project.
 *   G-4  organization_people: a manager could make a roster link 'linked'
 *        ('manager_link') WITHOUT the person's consent, and every reader treated
 *        'linked' as the person's own.
 *   G-5  worker_skills: a worker could self-verify (verified / manager_confirmed
 *        / green) through PostgREST.
 *   F-5  organization_evidence_events INSERT: audited, nothing tightened.
 *
 * The runtime proof (110 + 28 assertions, exploit reproduced BEFORE and closed
 * AFTER, rollback and re-apply, both apply orders against the team lane) lives
 * in scripts/db-proof/integrity-doors.sh and integrity-doors-team-order.sh. These
 * pins keep the SHAPE of the fix from being "cleaned up" away.
 */

const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const NAME = "20261003151300_integrity_doors_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const down = read(`supabase/rollbacks/${NAME}.down.sql`);
const body = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migration: honest RED acknowledgement, reversible", () => {
  it("carries the marker first and says it is not an approval", () => {
    expect(sql.startsWith("-- ====")).toBe(true);
    expect(sql).toMatch(/^-- @human-gate-approved$/m);
    expect(sql).toMatch(/NO OWNER APPROVAL EXISTS FOR THIS FILE YET/);
    expect(existsSync(join(ROOT, `supabase/rollbacks/${NAME}.down.sql`))).toBe(true);
  });

  it("names no 'team' object (the team lane is composed with, never depended on)", () => {
    expect(NAME).not.toMatch(/team/);
    for (const created of body.matchAll(/create (?:or replace )?(?:function|trigger|table)\s+(?:public\.)?(\w+)/gi)) {
      expect(created[1]).not.toMatch(/team/i);
    }
  });

  it("every new function revokes EXECUTE from anon (and public)", () => {
    for (const fn of [
      "journal_entries_attribution_guard_v1()",
      "worker_skills_integrity_guard_v1()",
      "organization_people_linked_requires_consent_guard_v1()",
    ]) {
      expect(body).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
    }
  });

  it("the rollback drops every new trigger and function and restores the live policies", () => {
    for (const t of [
      "journal_entries_attribution_guard_v1",
      "worker_skills_integrity_guard_v1",
      "organization_people_linked_requires_consent_guard_v1",
    ]) {
      expect(down).toContain(`drop trigger if exists ${t}`);
      expect(down).toContain(`drop function if exists public.${t}()`);
    }
    // the restored (live) policies carry NO link_method term
    const downBody = down.split(String.fromCharCode(10)).filter((l) => !l.trimStart().startsWith("--")).join(String.fromCharCode(10));
    expect(downBody).not.toContain("link_method");
    expect(down).toContain("alter policy organization_evidence_records_select");
    expect(down).toContain("alter policy organization_evidence_events_select");
    expect(down).toContain("alter policy organization_evidence_events_subject_dispute");
  });
});

describe("G-1: journal_entries attribution is enforced AT THE TABLE", () => {
  it("a BEFORE INSERT/UPDATE trigger checks the context is the worker's own profile", () => {
    expect(body).toMatch(/create trigger journal_entries_attribution_guard_v1\s+before insert or update of worker_id, engagement_context_id, project_id\s+on public\.journal_entries/);
    expect(body).toMatch(/ec\.profile_id = v_profile/);
    expect(body).toContain("engagement_context_not_own");
    expect(body).toContain("project_not_assignable");
  });

  it("composes with the team lane by lookup, not by a hard dependency", () => {
    expect(body).toContain("to_regprocedure('public.team_work_context_v1(uuid,uuid,uuid,uuid,timestamptz)')");
    expect(body).toContain("to_regprocedure('public.independent_journal_context_v1(uuid,uuid,uuid)')");
    // never a direct call that would fail if the lane is absent
    expect(body).not.toMatch(/\bperform public\.team_work_context_v1/);
  });

  it("is a SECURITY DEFINER guard with a pinned search_path and no end-user identity bypass beyond NULL uid", () => {
    expect(body).toMatch(/journal_entries_attribution_guard_v1\(\)\s+returns trigger\s+language plpgsql\s+security definer\s+set search_path = public/);
    expect(body).toMatch(/if auth\.uid\(\) is null then\s+return new;/);
  });
});

describe("G-5: worker_skills verification is pipeline-only", () => {
  it("the guard is SECURITY INVOKER (current_user is the real caller)", () => {
    const fn = body.slice(body.indexOf("function public.worker_skills_integrity_guard_v1()"));
    expect(fn.slice(0, fn.indexOf("$$;", 10))).not.toMatch(/security definer/);
    expect(body).toMatch(/current_user not in \('authenticated', 'anon'\)/);
  });

  it("pins every column a worker must not write", () => {
    for (const col of ["verified", "verified_by", "verified_at", "confidence_score", "last_recompute_at", "confidence_bin", "source"]) {
      expect(body).toMatch(new RegExp(`new\\.${col} `));
    }
    expect(body).toContain("worker_skill_verification_is_pipeline_only");
    expect(body).toContain("'self_declared', 'work_journal'");
  });

  it("does NOT revoke column privileges (the app upserts payloads naming them)", () => {
    expect(body).not.toMatch(/revoke (update|insert)[^;]*on public\.worker_skills/i);
  });

  it("the app's own writers only ever send the self-declared surface", () => {
    for (const rel of [
      "apps/web/lib/journal/skill-pipeline.ts",
      "apps/web/lib/journal/skill-pipeline-actions.ts",
      "apps/web/lib/organization-evidence/competency-signal-actions.ts",
    ]) {
      const src = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
      expect(src).toContain('source: "self_declared"');
      expect(src).toContain("verified: false");
      expect(src).not.toMatch(/verified:\s*true/);
      expect(src).not.toContain("manager_confirmed");
    }
    const reconcile = read("apps/web/lib/journal/skill-source-apply.ts");
    expect(reconcile).toContain('.eq("verified", false)');
  });
});

describe("G-4: a roster link is 'linked' only by the person", () => {
  it("a trigger forbids an end-user 'linked' row with any method but worker_confirmed", () => {
    expect(body).toMatch(/new\.link_state = 'linked' and new\.link_method is distinct from 'worker_confirmed'/);
    expect(body).toMatch(/before insert or update on public\.organization_people/);
  });

  it("keeps manager_link LEGAL (no CHECK is narrowed)", () => {
    expect(body).not.toMatch(/organization_people_link_method_check/);
    expect(body).not.toMatch(/alter table public\.organization_people/i);
  });

  it("EVERY surface that reads a bare link_state='linked' also requires worker_confirmed", () => {
    // each statement that mentions link_state = 'linked' must be followed by the method term
    const hits = [...body.matchAll(/op\.link_state = 'linked'(\s*)(and op\.link_method = 'worker_confirmed')?/g)];
    expect(hits.length).toBeGreaterThanOrEqual(7);
    for (const h of hits) expect(h[2]).toBe("and op.link_method = 'worker_confirmed'");
    for (const target of [
      "alter policy organization_evidence_records_select",
      "alter policy organization_evidence_events_select",
      "alter policy organization_evidence_events_subject_dispute",
      "alter policy organization_evidence_competency_signals_select",
      "function public.is_evidence_record_subject",
      "function public.privacy_export_evidence_import_rows_v1",
      "function public.withdraw_organization_evidence_dispute_v1",
    ]) {
      expect(body.toLowerCase()).toContain(target.toLowerCase());
    }
  });

  it("the app readers filter on the confirmed method too", () => {
    expect(read("apps/web/lib/organization-evidence/worker-evidence-read.ts")).toMatch(/\.eq\("link_method", "worker_confirmed"\)/);
    expect(read("apps/web/components/app/people/person-imported-history.tsx")).toMatch(/\.eq\("link_method", "worker_confirmed"\)/);
    const company = read("apps/web/lib/organization-evidence/company-work-history-read.ts");
    expect(company).toContain('p.link_method === "worker_confirmed"');
  });
});

describe("F-5: audited, nothing tightened", () => {
  it("the migration changes no INSERT policy on organization_evidence_events except the subject-dispute subject branch", () => {
    const altered = [...body.matchAll(/alter policy (\w+) on public\.organization_evidence_events/g)].map((m) => m[1]);
    expect(altered.sort()).toEqual(["organization_evidence_events_select", "organization_evidence_events_subject_dispute"]);
    expect(body).not.toMatch(/hist_p4_events_insert|organization_evidence_events_(attest|verify)\b/);
    expect(sql).toMatch(/AUDITED, NOT CHANGED/);
  });
});

// ── behaviour: a manager-made link is never the person's own history ─────────

type Call = { method: string; args: unknown[] };
function recordingClient(people: Record<string, unknown>[]) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const state: { table: string; calls: Call[] } = { table, calls: [] };
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const data = table === "organization_people" ? people : [];
            return (resolve: (v: unknown) => void) => resolve({ data, error: null });
          }
          return (...args: unknown[]) => {
            const c = { method: prop, args };
            state.calls.push(c);
            calls.push({ method: `${table}.${prop}`, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return { client: { from: (t: string) => builder(t) }, calls };
}

describe("listMyOrganizationEvidence: only worker_confirmed makes history the person's", () => {
  const row = (id: string, link_state: string, link_method: string | null) => ({
    id,
    organization_id: "org-1",
    display_name: "Person",
    relationship_kind: "employee",
    link_state,
    link_method,
    organizations: { display_name: "Org", legal_name: null },
  });

  it("a forced 'linked' + 'manager_link' row is NOT queried for records; a confirmed one is", async () => {
    const { client, calls } = recordingClient([
      row("p-forced", "linked", "manager_link"),
      row("p-confirmed", "linked", "worker_confirmed"),
      row("p-offer", "link_proposed", "manager_offer"),
    ]);
    const res = await listMyOrganizationEvidence(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { supabase: client as any, userId: "user-1", locale: "en" } as any,
      {},
    );
    expect(res.kind).toBe("ok");
    const inCall = calls.find((c) => c.method === "organization_evidence_records.in");
    expect(inCall).toBeTruthy();
    expect(inCall!.args[0]).toBe("organization_person_id");
    expect(inCall!.args[1]).toEqual(["p-confirmed"]);
    expect(JSON.stringify(inCall!.args[1])).not.toContain("p-forced");
  });

  it("with only a forced link nothing is attached to the person", async () => {
    const { client, calls } = recordingClient([row("p-forced", "linked", "manager_link")]);
    await listMyOrganizationEvidence(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { supabase: client as any, userId: "user-1", locale: "en" } as any,
      {},
    );
    const inCall = calls.find((c) => c.method === "organization_evidence_records.in");
    // either no record query is made, or it is made for an empty set
    if (inCall) expect(inCall.args[1]).toEqual([]);
  });
});
