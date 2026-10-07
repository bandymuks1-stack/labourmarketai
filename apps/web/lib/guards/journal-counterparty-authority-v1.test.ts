import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * EVID-2 REDESIGN - confirmation authority derives from the REAL WORK
 * RELATIONSHIP (replaces the rejected blanket `author != confirmer` design of
 * PR #2143).
 *
 * Owner principle (locked): who may accept this work is the legitimate
 * counterparty of the work relationship (employer / client / customer /
 * contracting party), and the security objective is that THE SUBJECT MUST NOT
 * IMPERSONATE THE COUNTERPARTY. Another login the worker controls, or any
 * manager of the worker's OWN organization, is not the counterparty.
 *
 * This is a STATIC guard over the migration, its rollback, the proof harness
 * and the app wiring. The behavioural proof is the scratch-PostgreSQL run of
 * scripts/db-proof/journal-counterparty-authority.sh (146 assertions at the
 * time of writing; NOT part of CI - it needs a database).
 */

const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const NAME = "20261003150500_journal_counterparty_review_authority_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const down = read(`supabase/rollbacks/${NAME}.down.sql`);
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
const body = code(sql);

describe("migration shape", () => {
  it("carries the human-gate marker; the rollback carries none", () => {
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(down).not.toContain("@human-gate-approved");
  });

  it("uses the reserved section-16 timestamp name and the superseded name is gone", () => {
    expect(NAME).toMatch(/^\d{14}_[a-z0-9_]+$/);
    expect(
      existsSync(
        join(ROOT, "supabase/migrations/20261003150000_journal_confirmation_self_review_block_v1.sql"),
      ),
    ).toBe(false);
  });

  it("replaces exactly three existing functions and never touches the skill/auto-confirm writers", () => {
    const replaced = [...body.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(replaced.sort()).toEqual(
      ["journal_entry_confirmations_guard", "review_journal_entry", "reviewable_journal_entry_ids"].sort(),
    );
    expect(body).not.toContain("confirm_entry_and_verify_skills");
    expect(body).not.toContain("apply_learning_auto_confirmation");
  });

  it("creates exactly the two new tables, both append-only with RLS and read-only grants", () => {
    const tables = [...body.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(["journal_entry_review_submissions", "work_counterparty_links"]);
    expect(body).toMatch(/alter table public\.work_counterparty_links enable row level security/);
    expect(body).toMatch(/alter table public\.journal_entry_review_submissions enable row level security/);
    expect(body).toMatch(/grant select on public\.work_counterparty_links, public\.journal_entry_review_submissions to authenticated/);
    expect(body).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*work_counterparty_links/i);
    expect(body).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*journal_entry_review_submissions/i);
    expect(body).toContain("work_counterparty_links_append_only");
    expect(body).toContain("journal_entry_review_submissions_append_only");
  });

  it("does not loosen RLS or grant anything to anon/public", () => {
    expect(body).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(body).not.toMatch(/to\s+anon\b/i);
    expect(body).not.toMatch(/grant[^;]*\bto\s+(anon|public)\b/i);
  });

  it("touches no existing row: no DML outside the two SECURITY DEFINER command bodies on the new tables", () => {
    expect(body).not.toMatch(/\bdelete\s+from\b/i);
    expect(body).not.toMatch(/\bupdate\s+public\.(?!work_counterparty_links\b)/i);
    expect(body).not.toMatch(/\balter\s+table\s+public\.(journal_entries|journal_entry_confirmations|engagement_contexts|worker_skills|organization_evidence)/i);
    expect(body).not.toMatch(/\bdrop\s+(table|policy|constraint)\b/i);
  });

  it("every SECURITY DEFINER function pins search_path", () => {
    const defs = body.split(/create or replace function/i).slice(1);
    for (const d of defs) {
      const head = d.split(/\$\$|\$function\$/)[0];
      if (/security definer/i.test(head)) expect(head).toMatch(/set search_path to 'public'/i);
    }
  });

  it("internal helpers and the resolver are not executable by authenticated or anon", () => {
    for (const fn of [
      "profile_manages_organization_v1",
      "profiles_share_organization_v1",
      "profiles_co_manage_organization_v1",
      "profile_is_member_of_organization_v1",
      "work_counterparty_link_valid_v1",
      "journal_entry_review_authority_v1",
    ]) {
      expect(body).toMatch(new RegExp(`public\\.${fn}\\(`));
    }
    expect(body).toMatch(/revoke all on function[\s\S]*journal_entry_review_authority_v1\(uuid, uuid\)[\s\S]*from public, anon, authenticated/);
    expect(body).toMatch(/grant execute on function[\s\S]*register_work_counterparty_link_v1[\s\S]*to authenticated/);
    expect(body).toMatch(/revoke all on function[\s\S]*register_work_counterparty_link_v1[\s\S]*from public, anon/);
  });
});

describe("the authority model (the principle, pinned)", () => {
  it("the choke point asks the resolver and refuses when there is no relationship authority", () => {
    const guard = body.slice(body.indexOf("journal_entry_confirmations_guard()"));
    expect(guard).toContain("journal_entry_review_authority_v1(new.entry_id, new.confirmer_id)");
    expect(guard).toContain("raise exception 'self_review_not_allowed'");
    expect(guard).toContain("raise exception 'review_authority_not_established'");
    expect(guard).toContain("authority_basis_mismatch");
    expect(guard).toContain("RECONSTRUCTED%");
    expect(guard).toContain("historical_confirmation_not_a_platform_action");
    // the rev12 lock strength is preserved
    expect(guard).toMatch(/for update;/);
  });

  it("the resolver never grants the subject authority and separates actor from party", () => {
    const resolver = body.slice(body.indexOf("journal_entry_review_authority_v1(p_entry_id"));
    expect(resolver).toMatch(/v_subject = p_actor then return null/);
    expect(resolver).toContain("profiles_co_manage_organization_v1(v_subject, p_actor)");
    expect(resolver).toContain("profiles_share_organization_v1(v_subject, p_actor)");
    expect(resolver).toContain("work_counterparty_link_valid_v1(l.id)");
    expect(resolver).toContain("l.counterparty_organization_id is distinct from v_org");
    expect(resolver).toContain("profile_manages_organization_v1(p_actor, l.counterparty_organization_id)");
    // counterparty authority needs an EXPLICIT submission
    expect(resolver).toContain("journal_entry_review_submissions s");
  });

  it("a link is only created by the counterparty side, from a real assignment, never by the subject", () => {
    const reg = body.slice(body.indexOf("register_work_counterparty_link_v1("));
    expect(reg).toContain("profile_manages_organization_v1(uid, v_org)");
    expect(reg).toContain("subject_cannot_register_own_counterparty");
    expect(reg).toContain("project_worker_assignments");
    expect(reg).toContain("subject_is_member_of_counterparty");
    expect(reg).toContain("counterparty_not_independent");
    // nothing is manufactured: no INSERT outside the command body
    const inserts = [...body.matchAll(/insert into public\.work_counterparty_links/g)];
    expect(inserts.length).toBe(1);
  });

  it("reuses the evidence-side party vocabulary instead of inventing a second one", () => {
    const evidence = read("supabase/migrations/20260907114500_organization_evidence_import_v1.sql");
    for (const role of ["client", "end_client", "project_owner"]) {
      expect(evidence).toContain(`'${role}'`);
      expect(body).toContain(`'${role}'`);
    }
  });

  it("counterparty rows never reuse the employer action vocabulary (no inflated 'confirm')", () => {
    for (const a of ["client_accept", "client_dispute", "client_request_correction"]) {
      expect(body).toContain(`'${a}'`);
    }
    expect(body).toMatch(/when 'approved' then 'client_accept'/);
  });

  it("acceptance is final, repeating is idempotent, a dispute is resolvable only by acceptance", () => {
    expect(body).toContain("'already_accepted'");
    expect(body).toMatch(/if v_last = p_decision then return p_decision/);
  });

  it("two simultaneous decisions cannot both write: the counterparty path takes a per-entry advisory lock BEFORE its idempotency read", () => {
    // Found by the integrated local QA (2026-10-05): the idempotency check is read-then-insert, so a parallel double
    // decision wrote TWO client_accept rows. The lock makes the second caller wait and then see the first one's row.
    const fnBody = body.split("CREATE OR REPLACE FUNCTION public.review_journal_entry")[1] ?? "";
    const lock = fnBody.indexOf("pg_advisory_xact_lock(hashtextextended('counterparty-review:' || p_entry_id::text, 0))");
    const read = fnBody.indexOf("select c.confirmation_scope ->> 'decision' into v_last");
    expect(lock).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(lock);
  });

  it("the EMPLOYER path is serialised too: repeating the reviewer's own latest decision is a no-op (no duplicate 'confirm' row)", () => {
    const fnBody = body.split("CREATE OR REPLACE FUNCTION public.review_journal_entry")[1] ?? "";
    expect(fnBody).toContain("pg_advisory_xact_lock(hashtextextended('employer-review:' || p_entry_id::text, 0))");
    expect(fnBody).toMatch(/c\.confirmer_id = uid/);
    expect(fnBody).toMatch(/if v_last is not null and v_last = p_decision then return p_decision; end if;/);
  });

  it("reviewability is no longer the universal relationship_types rule", () => {
    expect(body).not.toContain("journal_reviewable");
    expect(body).not.toMatch(/relationship_types/);
  });

  it("uses the canonical correction model (correction_of / superseded_by) and an explicit submission", () => {
    expect(body).toContain("correction_of");
    expect(body).toContain("resubmission_of_entry_id");
    expect(body).toContain("superseded_by is null");
    expect(body).not.toMatch(/create table[^;]*status/i);
  });
});

describe("provenance contract (never 'attested'; importer is never the confirmer)", () => {
  it("records every provenance field separately", () => {
    for (const k of [
      "'effective_event_time'",
      "'recorded_at'",
      "'imported_at'",
      "'origin'",
      "'recorded_by'",
      "'imported_by'",
      "'confirmed_by_profile_id'",
      "'confirmed_by_party_organization_id'",
    ]) {
      expect(body).toContain(k);
    }
    expect(body).toContain("NATIVE_PLATFORM_EMPLOYER_CONFIRMATION");
    expect(body).toContain("NATIVE_PLATFORM_CLIENT_CONFIRMATION");
  });

  it("never builds on the word 'attested' and carries no demo/game vocabulary", () => {
    for (const s of [body, code(down)]) {
      expect(s).not.toMatch(/attest/i);
      expect(s).not.toMatch(/\bdemo\b/i);
      expect(s).not.toMatch(/\bplayer\b|\bgame\b/i);
    }
  });
});

describe("rollback", () => {
  it("restores the three prior bodies, drops everything new, and refuses to destroy legal proof", () => {
    for (const fn of ["journal_entry_confirmations_guard", "review_journal_entry", "reviewable_journal_entry_ids"]) {
      expect(down).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    expect(down).toContain("rollback_refused");
    expect(down).toContain("drop table if exists public.journal_entry_review_submissions");
    expect(down).toContain("drop table if exists public.work_counterparty_links");
    // the restored bodies are the PRIOR ones: no relationship authority in them
    expect(code(down)).not.toContain("journal_entry_review_authority_v1(new.entry_id");
    expect(down).not.toContain("self_review_not_allowed");
  });
});

describe("proof harness + app wiring", () => {
  it("the runtime proof, prelude and seed exist and the proof checks production hashes", () => {
    const sh = read("scripts/db-proof/journal-counterparty-authority.sh");
    for (const f of ["sh", "prelude.sql", "seed.sql"]) {
      expect(existsSync(join(ROOT, `scripts/db-proof/journal-counterparty-authority.${f}`))).toBe(true);
    }
    expect(sh).toContain("6170a75faffae6b7988b313f1301d49b"); // production review_journal_entry
    expect(sh).toContain("62cda164da5548c7c592b6c121f75b0c"); // production guard
    expect((sh.match(/^check |^  check |\bcheck "/gm) ?? []).length).toBeGreaterThan(100);
  });

  it("i18n: both new block messages exist in every locale that has the journal namespace", () => {
    for (const loc of ["de", "en", "lt", "nl", "pl", "ru"]) {
      const json = JSON.parse(read(`apps/web/messages/${loc}/journal.json`));
      for (const k of ["selfReviewNotAllowed", "reviewAuthorityNotEstablished", "alreadyAccepted"]) {
        expect(typeof json.inbox.result[k]).toBe("string");
        expect(json.inbox.result[k].length).toBeGreaterThan(10);
      }
    }
  });

  it("the review actions map the new statuses; the cards render them", () => {
    const actions = read("apps/web/lib/journal/review-actions.ts");
    expect(actions).toContain('"review_authority_not_established"');
    expect(actions).toContain('"already_accepted"');
    const membership = read("apps/web/lib/operations/org-membership.ts");
    expect(membership).toContain("review_authority_not_established");
    const inbox = read("apps/web/components/app/journal-inbox-entry.tsx");
    expect(inbox.match(/reviewAuthorityNotEstablished/g)?.length).toBe(2);
    expect(read("apps/web/components/app/quick-confirm-card.tsx")).toContain("reviewAuthorityNotEstablished");
  });

  it("provenance never lets a client acceptance reach EMPLOYER_CONFIRMED", () => {
    const prov = read("apps/web/lib/evidence/provenance.ts");
    expect(prov).toContain("isCounterpartyRow");
    expect(prov).toContain("clientAccepted");
  });
});
