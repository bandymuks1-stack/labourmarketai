import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * FOLLOW-UP TASK QUEUE guards (product-tree branch 24, train §8.13 — the
 * last RED branch).
 *
 * The wagon rule (reality-map 2026-07-05 row 7): "follow_up_tasks +
 * owner/operator queues (additive apply)" — an INTERNAL follow-up engine
 * only. These pins keep that true:
 *
 *   - ADDITIVE-ONLY migration: ONE new table + TWO new gated write RPCs;
 *     NO existing table/policy/grant/constraint is altered.
 *   - ONLY NEW names: follow_up_tasks, create_follow_up_task_v1 and
 *     set_follow_up_task_status_v1 are brand-new — the migration recreates
 *     NO existing RPC/trigger/table, so the ROLLBACK-CHAIN RULE is satisfied
 *     structurally: the down file restores no function body (there is none
 *     to restore) and must contain no create-function at all.
 *   - ADMIN-ONLY read: the select policy is is_admin() — operator notes
 *     never reach any non-admin user class (the six-point privacy gate),
 *     and the read service never selects created_by.
 *   - RPC-ONLY writes: direct insert/update/delete REVOKEd, no write
 *     policies; the ONLY update path is the status RPC touching status +
 *     resolved_at on the new table.
 *   - HONEST lifecycle: pending/done/dismissed only — no priority column,
 *     no urgency score, no fake 'contacted' state.
 *   - NO EXTERNAL TRANSPORT: the follow-up layer performs no outbound
 *     call of any kind (no fetch, no mail/SMS/push/Telegram provider),
 *     and no such dependency enters package.json.
 *   - NO FAKE NOTIFICATION FEED: the header NotificationPanel has no real
 *     data feed today; this wagon does NOT fake one.
 *   - Honest degradation pre-apply (42P01 → applied:false → "not yet
 *     available" state, nothing faked).
 *   - i18n en/lt/ru presence for the new namespace.
 */

const APP = join(process.cwd());
const REPO = join(APP, "..", "..");
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");
const MIGRATION_FILE = "20260705235000_follow_up_tasks.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_FILE}`;
const ROLLBACK = "supabase/rollbacks/20260705235000_follow_up_tasks.down.sql";

const NEW_TABLE = "follow_up_tasks";
const NEW_CREATE_FN = "create_follow_up_task_v1";
const NEW_STATUS_FN = "set_follow_up_task_status_v1";

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const readWeb = (rel: string) => readFileSync(join(APP, rel), "utf8");
// CRLF-safe comment strip — prose comments may legitimately DISCUSS banned
// shapes; only executable SQL is checked.
const stripSql = (src: string) =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

describe("follow-up migration — one new table + two new gated RPCs, additive only", () => {
  const migration = read(MIGRATION);
  const code = stripSql(migration);

  it("creates ONLY the new follow_up_tasks table (no existing table/column touched)", () => {
    const created = [
      ...code.matchAll(/create table if not exists public\.([a-z_]+)/gi),
    ].map((m) => m[1]);
    expect(created).toEqual([NEW_TABLE]);
    expect(code).not.toMatch(/alter table(?! public\.follow_up_tasks)/i);
    expect(code).not.toMatch(/add column/i);
    expect(code).not.toMatch(/drop table/i);
    expect(code).not.toMatch(/drop column/i);
    expect(code).not.toMatch(/drop constraint/i);
  });

  it("creates ONLY the two brand-new functions (no existing RPC recreated, no trigger)", () => {
    const created = [
      ...code.matchAll(/create (?:or replace )?function public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect(created).toEqual([NEW_CREATE_FN, NEW_STATUS_FN]);
    expect(code).not.toMatch(/create (or replace )?trigger/i);
  });

  it("all three new names are NEW to the repo — never defined by a prior migration", () => {
    const others = readdirSync(MIGRATIONS_DIR).filter(
      (f) => f.endsWith(".sql") && f !== MIGRATION_FILE,
    );
    expect(others.length).toBeGreaterThan(100);
    for (const f of others) {
      const src = read(`supabase/migrations/${f}`);
      expect(src, `${f} must not define ${NEW_CREATE_FN}`).not.toContain(NEW_CREATE_FN);
      expect(src, `${f} must not define ${NEW_STATUS_FN}`).not.toContain(NEW_STATUS_FN);
      // NB: word-boundary check — "follow_up_tasks" must not appear as a
      // relation anywhere else (customer_requests.needs_followup is a
      // different, existing status string and does not collide).
      expect(src, `${f} must not define ${NEW_TABLE}`).not.toMatch(
        /\bfollow_up_tasks\b/,
      );
    }
  });

  it("SELECT policy is ADMIN-ONLY — operator notes never reach a non-admin user class", () => {
    const policies = [
      ...code.matchAll(/create policy ([a-z_]+) on public\.([a-z_]+)/gi),
    ];
    expect(policies.length).toBe(1);
    expect(policies[0][2]).toBe(NEW_TABLE);
    expect(code).toMatch(
      /for select to authenticated\s+using \(public\.is_admin\(\)\)/i,
    );
    // Never a worker/company/anon read of the operator free text.
    expect(code).not.toMatch(/auth\.uid\(\)\s*=\s*subject_profile_id/i);
    expect(code).not.toMatch(/\bto anon\b|\bto public\b(?!\.)/i);
  });

  it("writes are RPC-ONLY: direct writes revoked, no write policies, DML only on the new table", () => {
    const inserts = [...code.matchAll(/insert into public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect(inserts).toEqual([NEW_TABLE]);
    // The ONLY update is the status RPC touching the new table.
    const updates = [...code.matchAll(/update public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect(updates).toEqual([NEW_TABLE]);
    expect(code).not.toMatch(/\bdelete from\b/i);
    expect(code).not.toMatch(/on conflict/i);
    expect(code).toMatch(
      /revoke insert, update, delete on public\.follow_up_tasks from authenticated/i,
    );
    expect(code).toMatch(
      /grant select on public\.follow_up_tasks to authenticated/i,
    );
    expect(code).not.toMatch(/for (insert|update|delete)/i);
  });

  it("the status RPC changes ONLY status + resolved_at (no note edit, no subject rewrite)", () => {
    const updateStmt = /update public\.follow_up_tasks ft\s+set status\s+=\s+v_status,\s+resolved_at = case when v_status = 'pending' then null else now\(\) end\s+where ft\.id = v_task/i;
    expect(code).toMatch(updateStmt);
    // The set-list must never touch note or the subject pointers.
    expect(code).not.toMatch(/set[^;]*\bnote\s*=/i);
    expect(code).not.toMatch(/set[^;]*subject_profile_id\s*=/i);
    expect(code).not.toMatch(/set[^;]*subject_company_id\s*=/i);
  });

  it("both RPCs re-check the admin gate, validate honestly and are capped", () => {
    const adminChecks = [...code.matchAll(/if not public\.is_admin\(\) then/gi)];
    expect(adminChecks.length).toBe(2);
    expect(code).toMatch(/'not_allowed'/);
    expect(code).toMatch(/'invalid_task'/);
    expect(code).toMatch(/'task_limit_reached'/);
    expect(code).toMatch(/'not_found'/);
    expect(code).toMatch(/>= 500/);
    expect(code).toMatch(/char_length\(v_note\) > 500/i);
  });

  it("statuses are the HONEST lifecycle — no urgency score, no priority, no fake contact claim", () => {
    expect(code).toMatch(/\('pending','done','dismissed'\)/);
    // Never a claim-shaped or urgency-shaped column/value.
    expect(code).not.toMatch(/'contacted'|'sent'|'notified'/);
    expect(code).not.toMatch(/priority|urgency|\bscore\b/i);
    // Subject pointers are ids only — the row carries no copied PII columns.
    expect(code).not.toMatch(/subject_name|subject_email|subject_phone/i);
    // At most one subject per task, and the note is bounded.
    expect(code).toMatch(/subject_profile_id is null or subject_company_id is null/i);
    expect(code).toMatch(/char_length\(note\) <= 500/i);
  });

  it("performs NO external transport — no outbound call shape in the SQL", () => {
    expect(code).not.toMatch(/http|smtp|webhook|telegram|twilio|sendgrid|mailgun/i);
    expect(code).not.toMatch(/pg_net|net\.http/i);
  });

  it("is a human-gated DRAFT (owner-gated prod apply, never db push)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toMatch(/needs-human-gate/);
    expect(migration).toMatch(/DO NOT APPLY automatically/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = public/i);
    expect(migration).toMatch(/revoke all on function/i);
    // The no-external-sending boundary is stated in the migration itself.
    expect(migration).toMatch(/NO EXTERNAL SENDING/);
  });
});

describe("follow-up rollback chain — nothing recreated, nothing stale to restore", () => {
  const down = read(ROLLBACK);
  const downCode = stripSql(down);

  it("the down file exists and drops ONLY the two new functions and the new table", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const fnDrops = [
      ...downCode.matchAll(/drop function if exists public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect(fnDrops).toEqual([NEW_CREATE_FN, NEW_STATUS_FN]);
    const tableDrops = [
      ...downCode.matchAll(/drop table if exists public\.([a-z_]+)/gi),
    ].map((m) => m[1]);
    expect(tableDrops).toEqual([NEW_TABLE]);
  });

  it("ROLLBACK-CHAIN RULE: no existing RPC was recreated, so the down file restores NO function body", () => {
    expect(downCode).not.toMatch(/create (or replace )?function/i);
    expect(downCode).not.toMatch(/create (or replace )?trigger/i);
    expect(downCode).not.toMatch(/create table/i);
    // Feature rows live ONLY in the dropped table: no delete touches any
    // existing table.
    expect(downCode).not.toMatch(/delete from/i);
    // Existing spine functions are untouched in both directions.
    for (const untouched of [
      "is_admin_grant",
      "add_project_handover_entry_v1",
      "can_manage_project",
    ]) {
      expect(downCode, `down must not touch ${untouched}`).not.toContain(untouched);
    }
  });
});

describe("app surface — operator queue on the EXISTING admin control room only", () => {
  const lib = readWeb("lib/followup/follow-up-tasks.ts");
  const actions = readWeb("lib/followup/follow-up-actions.ts");
  const panel = readWeb("components/app/follow-up-queue-panel.tsx");
  const adminPage = readWeb("app/[locale]/dashboard/admin/page.tsx");

  it("reads ONLY the new follow_up_tasks table and never selects created_by", () => {
    expect(lib).toMatch(/\.from\("follow_up_tasks"\)/);
    expect(lib).toMatch(
      /"id, subject_profile_id, subject_company_id, note, status, created_at, resolved_at"/,
    );
    expect(lib).not.toMatch(/created_by/);
    // No parallel read model — the follow-up service reads no other table.
    const fromCalls = [...lib.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(fromCalls)).toEqual(new Set(["follow_up_tasks"]));
  });

  it("writes ONLY through the two gated RPCs — no direct table writes app-side", () => {
    expect(actions).toMatch(/create_follow_up_task_v1/);
    expect(actions).toMatch(/set_follow_up_task_status_v1/);
    for (const src of [lib, actions, panel]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("performs NO external transport anywhere in the follow-up layer", () => {
    for (const src of [lib, actions, panel]) {
      // No outbound call and no transport-provider import (comments may
      // legitimately SAY "no SMS/Telegram" — imports are what's pinned).
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid)/i,
      );
    }
    // And no mail/SMS/push provider dependency enters the app.
    const pkg = readWeb("package.json");
    expect(pkg).not.toMatch(
      /nodemailer|twilio|sendgrid|mailgun|postmark|telegram|web-push/i,
    );
  });

  it("the queue is surfaced on the EXISTING admin control room (no new dashboard/route)", () => {
    expect(adminPage).toMatch(/getFollowUpQueue\(\)/);
    expect(adminPage).toMatch(/<FollowUpQueuePanel/);
    // The admin page (and therefore the queue) stays behind requireSuperadmin.
    expect(adminPage).toMatch(/await requireSuperadmin\(locale\)/);
    // No new follow-up page/route exists anywhere.
    expect(
      existsSync(join(APP, "app", "[locale]", "dashboard", "admin", "follow-up")),
    ).toBe(false);
    expect(
      existsSync(join(APP, "app", "[locale]", "dashboard", "follow-up")),
    ).toBe(false);
  });

  it("degrades honestly pre-apply: 42P01 probe → applied:false → 'not yet available' state", () => {
    expect(lib).toMatch(/RELATION_NOT_FOUND_CODE = "42P01"/);
    expect(lib).toMatch(/applied: false/);
    expect(panel).toMatch(/!data\.applied/);
    expect(panel).toMatch(/follow-up-preapply/);
    expect(panel).toMatch(/t\("preApply"\)/);
  });

  it("does NOT fake a user-facing notification feed — the follow-up layer never touches the bell", () => {
    // The header bell carries ONLY real derived signals since audit PR5
    // (count-gated, each linking the surface that clears it) — the follow-up
    // layer must not inject its admin-only queue into it.
    const layout = readWeb("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(/count > 0/); // signals are count-gated, never fabricated
    expect(layout).not.toMatch(/follow_up|followUp/);
    const notificationPanel = readWeb("components/app/notification-panel.tsx");
    expect(notificationPanel).not.toMatch(/follow_up|followUp|FollowUp/);
    for (const src of [lib, actions, panel]) {
      expect(src).not.toMatch(/NotificationPanel|notification-panel/);
    }
  });

  it("copy stays honest: internal-only note present, no urgency/contact claims", () => {
    expect(panel).toMatch(/t\("honestNote"\)/);
    const en = JSON.parse(readWeb("messages/en.json")).followUp;
    expect(en.honestNote).toMatch(/sends nothing/i);
    const blob = JSON.stringify(en).toLowerCase();
    expect(blob).not.toMatch(/urgent|contacted them|we contacted|message sent|email sent/);
  });
});

describe("i18n — followUp namespace present in en/lt/ru", () => {
  for (const locale of ["en", "lt", "ru"]) {
    it(`${locale} carries the full followUp catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      const ns = messages.followUp;
      expect(ns, `${locale} followUp namespace`).toBeTruthy();
      for (const key of [
        "title",
        "intro",
        "honestNote",
        "preApply",
        "queueHeading",
        "queueEmpty",
        "resolvedHeading",
        "subjectPerson",
        "subjectCompany",
        "subjectNone",
        "openSubject",
        "createdLabel",
      ]) {
        expect(
          String(ns[key] ?? "").length,
          `${locale} followUp.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["pending", "done", "dismissed"]) {
        expect(
          String(ns.statuses?.[key] ?? "").length,
          `${locale} followUp.statuses.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of ["markDone", "dismiss", "reopen"]) {
        expect(
          String(ns.actions?.[key] ?? "").length,
          `${locale} followUp.actions.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of [
        "noteLabel",
        "notePlaceholder",
        "subjectProfileLabel",
        "subjectCompanyLabel",
        "subjectHint",
        "saving",
        "submit",
      ]) {
        expect(
          String(ns.form?.[key] ?? "").length,
          `${locale} followUp.form.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of [
        "created",
        "updated",
        "needsMigration",
        "notAuthorized",
        "limitReached",
        "notFound",
        "invalid",
        "error",
      ]) {
        expect(
          String(ns.outcome?.[key] ?? "").length,
          `${locale} followUp.outcome.${key}`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
