import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  WORKFLOW_APPROVAL_MODES,
  WORKFLOW_CONTEXT_ENTITY_TYPES,
  WORKFLOW_INSTANCE_STATUSES,
  WORKFLOW_NOTICES,
  WORKFLOW_STEP_STATUSES,
  WORKFLOW_TRANSITION_ACTIONS,
} from "@/lib/approvals/approvals-model";
import {
  NOTIFICATION_ENTITY_HREF,
  notificationEventHref,
} from "@/lib/notifications/events";

/**
 * WORKFLOW & APPROVAL ENGINE guards (canonical engine v1).
 *
 * ONE engine, no feature forks. These pins keep the TS↔SQL contract, the
 * fail-closed authority model and the no-auto-approve doctrine honest:
 *
 *   - exactly ONE migration pair owns the workflow_* names, human-gated,
 *     with paired rollbacks;
 *   - writes are RPC-only at BOTH layers (SQL revoke + zero write policies;
 *     app-side no .insert/.update/.delete anywhere in the approvals layer);
 *   - decisions are row-locked, fill-once and idempotent; the transition
 *     ledger is append-only for every role;
 *   - ESCALATION NEVER APPROVES: the overdue command never touches a
 *     decision column and never writes an approved state;
 *   - honest degradation while unapplied (42P01/42703/42883/PGRST202 →
 *     calm "not enabled yet", nothing faked);
 *   - the four durable notification types are typed, emitted on the right
 *     success paths, and labelled in all 11 catalogues;
 *   - NO new dashboard route: the approvals area expands INSIDE the
 *     declared /dashboard/network surface (constitution precedent).
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(join(REPO, rel), "utf8");

const ENGINE = "20260817130000_workflow_engine_v1";
const TYPES_V3 = "20260817130100_notification_events_v3_workflow_types";

const MIGRATION = readRepo(`supabase/migrations/${ENGINE}.sql`);
const MIGRATION_TYPES = readRepo(`supabase/migrations/${TYPES_V3}.sql`);
const ROLLBACK = readRepo(`supabase/rollbacks/${ENGINE}.down.sql`);
const ROLLBACK_TYPES = readRepo(`supabase/rollbacks/${TYPES_V3}.down.sql`);

const MODEL = read("lib/approvals/approvals-model.ts");
const READS = read("lib/approvals/approvals.ts");
const ACTIONS = read("lib/approvals/approvals-actions.ts");
const SECTION = read("app/[locale]/dashboard/network/approvals-section.tsx");
const NETWORK_PAGE = read("app/[locale]/dashboard/network/page.tsx");
const TIMELINE = read("components/app/workflow-timeline.tsx");
const EVENTS = read("lib/notifications/events.ts");
const EMITTERS = read("lib/notifications/event-emitters.ts");

const APPROVALS_LAYER = [MODEL, READS, ACTIONS, SECTION, TIMELINE];

const TABLES = [
  "workflow_definitions",
  "workflow_definition_versions",
  "workflow_version_steps",
  "workflow_instances",
  "workflow_instance_steps",
  "workflow_instance_approvers",
  "workflow_transitions",
] as const;

const COMMANDS = [
  "create_workflow_definition_v1",
  "publish_workflow_version_v1",
  "start_workflow_instance_v1",
  "decide_workflow_step_v1",
  "delegate_workflow_step_v1",
  "withdraw_workflow_instance_v1",
  "cancel_workflow_instance_v1",
  "mark_overdue_workflow_steps_v1",
] as const;

const HELPERS = [
  "workflow_can_view_definition_v1",
  "workflow_can_view_version_v1",
  "workflow_can_view_instance_v1",
  "workflow_resolve_step_approvers_v1",
] as const;

const WORKFLOW_EVENT_TYPES = [
  "workflow_step_pending",
  "workflow_decided",
  "workflow_delegated",
  "workflow_escalated",
] as const;

const CATALOGUE = [
  "en",
  "lt",
  "lv",
  "et",
  "nl",
  "de",
  "da",
  "no",
  "sv",
  "pl",
  "ru",
] as const;

/** The body of ONE function in the migration (from its create statement to
 *  its first revoke). */
function fnBody(name: string): string {
  const start = MIGRATION.indexOf(
    `create or replace function public.${name}(`,
  );
  expect(start, `${name} missing from the migration`).toBeGreaterThanOrEqual(0);
  const end = MIGRATION.indexOf(`revoke all on function public.${name}(`, start);
  expect(end, `${name} carries no revoke`).toBeGreaterThan(start);
  return MIGRATION.slice(start, end);
}

/** Walk a source dir collecting ts/tsx files (skips tests). */
function walkSource(absDir: string, acc: string[] = []): string[] {
  if (!existsSync(absDir)) return acc;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const p = join(absDir, entry.name);
    if (entry.isDirectory()) walkSource(p, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("1. exactly one human-gated migration pair owns the engine", () => {
  it("no other migration or rollback mentions the engine tables or commands", () => {
    // Known CONSUMERS of the engine (STRENGTHENED, not weakened): a consumer
    // migration may reference the engine's names — assert an existence check
    // or read/comment — but may never CREATE or DROP an engine object. The
    // timesheets module (20260817170000) runs its approval ON the engine
    // (context_entity_type='timesheet'): it asserts workflow_instances
    // exists and its sync command READS workflow_instances; the stronger
    // no-create/no-drop assertions below still apply to it.
    const CONSUMERS = [
      "20260817170000_timesheets_v1",
      // Typed employee requests (train F): create/withdraw run the engine's
      // own start/withdraw commands in-transaction; sync READS
      // workflow_instances; FK to workflow_instances. Never defines,
      // replaces or triggers an engine object (asserted below).
      "20260817180000_employee_requests_v1",
      // The Agreement & Rights Engine (train H, 20260817200000) is the same
      // class of consumer (context_entity_type='agreement'): its submit/sync
      // mirror commands READ workflow_instances and its header cites
      // start_workflow_instance_v1 as the app-layer entry point — the same
      // no-create/no-drop assertions apply.
      "20260817200000_agreements_v1",
    ];
    for (const dir of ["migrations", "rollbacks"]) {
      const abs = join(REPO, "supabase", dir);
      for (const f of readdirSync(abs).filter((f) => f.endsWith(".sql"))) {
        if (f.startsWith(ENGINE) || f.startsWith(TYPES_V3)) continue;
        const src = readFileSync(join(abs, f), "utf8");
        if (CONSUMERS.some((c) => f.startsWith(c))) {
          for (const tbl of TABLES) {
            // The created/dropped table NAME appears before the first "(";
            // an FK `references public.workflow_instances` inside a
            // consumer's OWN create-table body is legitimate consumption.
            expect(
              src,
              `${dir}/${f} may reference but never create/drop ${tbl}`,
            ).not.toMatch(
              new RegExp(`(create table[^(]*\\b${tbl}\\b|drop table[^;]*\\b${tbl}\\b)`, "i"),
            );
          }
          for (const fn of COMMANDS) {
            expect(
              src,
              `${dir}/${f} may call but never create/drop ${fn}`,
            ).not.toMatch(
              new RegExp(`(create (or replace )?function[^(]*\\b${fn}\\b|drop function[^(]*\\b${fn}\\b)`, "i"),
            );
          }
          // A consumer may trigger its OWN tables (timesheets does); the
          // doctrine forbids triggers ON ENGINE tables only.
          expect(
            src,
            `${dir}/${f} must not create a trigger on an engine table`,
          ).not.toMatch(/create\s+trigger[^;]*\bon\s+public\.workflow_/i);
          continue;
        }
        for (const tbl of TABLES) {
          expect(src, `${dir}/${f} must not define ${tbl}`).not.toMatch(
            new RegExp(`\\b${tbl}\\b`),
          );
        }
        for (const fn of COMMANDS) {
          expect(src, `${dir}/${f} must not define ${fn}`).not.toContain(fn);
        }
      }
    }
  });

  it("both files stay human-gated with the owner-mandate citation and rollback pairs", () => {
    for (const src of [MIGRATION, MIGRATION_TYPES]) {
      expect(src).toContain("needs-human-gate");
      expect(src).toContain("@human-gate-approved");
      expect(src).toContain("owner mandate 2026-08-17");
      expect(src).toContain("docs/human-gates/workflow-engine-gate.md");
    }
    for (const tbl of TABLES) {
      expect(MIGRATION).toContain(`create table if not exists public.${tbl}`);
      expect(ROLLBACK).toContain(`drop table if exists public.${tbl}`);
    }
    for (const fn of [...COMMANDS, ...HELPERS]) {
      expect(MIGRATION).toContain(`create or replace function public.${fn}`);
      expect(ROLLBACK).toContain(`drop function if exists public.${fn}`);
    }
    // The v3 widening keeps every previously admitted value admitted.
    for (const kept of [
      "booking_proposed",
      "booking_withdrawn",
      "absence_rejected",
      "engagement_created",
      "engagement_ended",
    ]) {
      expect(MIGRATION_TYPES).toContain(`'${kept}'`);
      expect(ROLLBACK_TYPES).toContain(`'${kept}'`);
    }
    for (const t of WORKFLOW_EVENT_TYPES) {
      expect(MIGRATION_TYPES).toContain(`'${t}'`);
      // The rollback returns to the v2 set — no workflow type survives it.
      expect(ROLLBACK_TYPES).not.toContain(`'${t}'`);
    }
    expect(MIGRATION_TYPES).toContain("'workflow_instance'");
  });
});

describe("2. fail-closed RLS — SELECT-only, writes RPC-only at the SQL layer", () => {
  it("RLS is enabled and a SELECT policy exists for every engine table", () => {
    for (const tbl of TABLES) {
      expect(MIGRATION).toContain(
        `alter table public.${tbl} enable row level security`,
      );
      expect(MIGRATION).toMatch(
        new RegExp(`create policy ${tbl}_select on public\\.${tbl}`),
      );
    }
  });

  it("NO write policy exists — every `create policy` is `for select`", () => {
    const policies = MIGRATION.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(TABLES.length);
    for (const p of policies) {
      expect(p).toMatch(/for select/);
      expect(p).not.toMatch(/for (insert|update|delete|all)/);
      expect(p).not.toMatch(/using \(true\)/);
      expect(p).not.toMatch(/to anon/);
    }
  });

  it("writes are explicitly revoked and only SELECT is granted back", () => {
    expect(MIGRATION).toMatch(/revoke all on public\.workflow_definitions,[\s\S]*?from authenticated;/);
    expect(MIGRATION).toMatch(/grant select on public\.workflow_definitions,[\s\S]*?to authenticated;/);
    // No table-level write grant anywhere.
    expect(MIGRATION).not.toMatch(/grant (insert|update|delete|all) on public\.workflow/);
  });

  it("every function is SECURITY DEFINER with a pinned search_path, anon revoked", () => {
    const definers = MIGRATION.match(/security definer/g) ?? [];
    // 8 commands + 4 helpers = 12 (trigger guards are NOT definer — they run
    // inside whatever wrote the row and only ever raise).
    expect(definers.length).toBe(12);
    const pins = MIGRATION.match(/set search_path = public/g) ?? [];
    // 12 definer functions + 3 trigger guard functions.
    expect(pins.length).toBe(15);
    for (const fn of [...COMMANDS, ...HELPERS]) {
      expect(MIGRATION).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon`),
      );
    }
    // The internal resolver is SQL-internal: authenticated revoked too.
    expect(MIGRATION).toMatch(
      /revoke all on function public\.workflow_resolve_step_approvers_v1\(uuid, uuid, jsonb\) from authenticated/,
    );
    expect(MIGRATION).not.toMatch(/grant execute[^;]*to anon/);
  });
});

describe("3. concurrency, fill-once, immutability", () => {
  it("decide row-locks the instance and fills a decision only where null", () => {
    const decide = fnBody("decide_workflow_step_v1");
    expect(decide).toMatch(/for update;/);
    expect(decide).toMatch(/where id = v_slot\.id and decision is null/);
    expect(decide).toContain("'already_decided'");
  });

  it("delegate/withdraw/cancel also serialize on the instance row", () => {
    for (const fn of [
      "delegate_workflow_step_v1",
      "withdraw_workflow_instance_v1",
      "cancel_workflow_instance_v1",
    ]) {
      expect(fnBody(fn)).toMatch(/for update;/);
    }
  });

  it("the three trigger guards exist and the ledger is append-only", () => {
    expect(MIGRATION).toContain("create trigger workflow_transitions_append_only");
    expect(MIGRATION).toContain("create trigger workflow_approvers_fill_once");
    expect(MIGRATION).toContain("create trigger workflow_version_steps_frozen");
    expect(MIGRATION).toMatch(
      /workflow_transitions is append-only/,
    );
    expect(MIGRATION).toMatch(
      /decision is fill-once/,
    );
    expect(MIGRATION).toMatch(/steps are immutable/);
  });

  it("idempotent starts: unique partial index over the live context entity", () => {
    expect(MIGRATION).toMatch(
      /create unique index if not exists workflow_instances_active_context_uq[\s\S]*?where status = 'pending' and context_entity_id is not null/,
    );
    expect(fnBody("start_workflow_instance_v1")).toContain("'already_pending'");
  });
});

describe("4. ESCALATION NEVER APPROVES (the safe-state doctrine)", () => {
  it("the overdue command never touches a decision and never writes an approved state", () => {
    const overdue = fnBody("mark_overdue_workflow_steps_v1");
    expect(overdue).not.toMatch(/\bdecision\b/);
    expect(overdue).not.toContain("'approved'");
    expect(overdue).toContain("'escalated'");
    // It only flips ACTIVE steps of PENDING instances that passed a real deadline.
    expect(overdue).toMatch(/s\.status = 'active'/);
    expect(overdue).toMatch(/i\.status = 'pending'/);
    expect(overdue).toMatch(/s\.deadline_at < now\(\)/);
  });

  it("an escalated step stays decidable (visibility, not authority transfer)", () => {
    expect(fnBody("decide_workflow_step_v1")).toMatch(
      /s\.status in \('active','escalated'\)/,
    );
  });

  it("the authoring vocabulary admits only mark_escalated — no approve action exists", () => {
    const create = fnBody("create_workflow_definition_v1");
    expect(create).toContain("'mark_escalated'");
    expect(create).not.toContain("'auto_approve'");
    // Comments may legitimately SAY "never auto-approves" — executable SQL
    // is what's pinned.
    // split on \r?\n: on a Windows checkout lines end with \r, and JS `$`
    // does not match before it — the comment strip silently no-ops there.
    const sql = MIGRATION.split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(sql).not.toMatch(/auto[_-]?approv/i);
  });

  it("no AI anywhere in the engine or its app layer", () => {
    // Comments may legitimately SAY "no AI" — executable SQL is what's pinned.
    // split on \r?\n: on a Windows checkout lines end with \r, and JS `$`
    // does not match before it — the comment strip silently no-ops there.
    const sql = MIGRATION.split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(sql).not.toMatch(/\bAI\b|\bLLM\b|openai|anthropic/i);
    for (const src of APPROVALS_LAYER) {
      expect(src).not.toMatch(/from "@\/lib\/ai\//);
    }
  });
});

describe("5. authority matrix (static SQL pins per caller class)", () => {
  it("anon: raises 42501 before anything else in every command", () => {
    for (const fn of COMMANDS) {
      expect(fnBody(fn), fn).toMatch(
        /if uid is null then\s+raise exception 'Not authenticated' using errcode = '42501';/,
      );
    }
  });

  it("requester: sees own instances; only the requester withdraws", () => {
    expect(fnBody("workflow_can_view_instance_v1")).toMatch(
      /i\.requester_profile_id = auth\.uid\(\)/,
    );
    expect(fnBody("withdraw_workflow_instance_v1")).toMatch(
      /v_inst\.requester_profile_id <> uid/,
    );
  });

  it("approver/delegate: visibility and decide-eligibility come from the slot rows", () => {
    expect(fnBody("workflow_can_view_instance_v1")).toMatch(
      /a\.approver_profile_id = auth\.uid\(\) or a\.delegated_to_profile_id = auth\.uid\(\)/,
    );
    expect(fnBody("decide_workflow_step_v1")).toMatch(
      /a\.approver_profile_id = uid or a\.delegated_to_profile_id = uid/,
    );
    // Delegation authority: only the ORIGINAL approver's own slot.
    const delegate = fnBody("delegate_workflow_step_v1");
    expect(delegate).toMatch(/a\.approver_profile_id = uid\s+limit 1/);
  });

  it("governance owner/admin: authoring, cancel and escalation run on the memberships truth", () => {
    for (const fn of [
      "create_workflow_definition_v1",
      "publish_workflow_version_v1",
      "cancel_workflow_instance_v1",
      "mark_overdue_workflow_steps_v1",
    ]) {
      const body = fnBody(fn);
      expect(body, fn).toMatch(/membership_actor_role_v1/);
      expect(body, fn).toMatch(/\('owner','admin'\)/);
    }
  });

  it("org boundary honours BOTH membership truths (memberships OR engagement contexts)", () => {
    // Reads + requester eligibility go through the shared dual-truth helper.
    expect(MIGRATION).toMatch(
      /public\.belongs_to_organization\(organization_id\)/,
    );
    expect(fnBody("start_workflow_instance_v1")).toMatch(
      /belongs_to_organization/,
    );
    // Named approvers and delegates are checked against BOTH truths inline.
    const resolver = fnBody("workflow_resolve_step_approvers_v1");
    expect(resolver).toMatch(/company_memberships/);
    expect(resolver).toMatch(/engagement_contexts/);
    const delegate = fnBody("delegate_workflow_step_v1");
    expect(delegate).toMatch(/company_memberships/);
    expect(delegate).toMatch(/engagement_contexts/);
  });

  it("revoked members are outside the boundary: every membership read demands ACTIVE", () => {
    const statuses = MIGRATION.match(/m\.status = 'active'/g) ?? [];
    expect(statuses.length).toBeGreaterThanOrEqual(4);
    expect(MIGRATION).toMatch(/ec\.status = 'active'/);
  });

  it("attacker/wrong-org: merged anti-oracle outcomes, no existence leak", () => {
    // Missing row and unauthorized caller answer the same.
    expect(fnBody("decide_workflow_step_v1")).toMatch(
      /if v_slot\.id is null then return 'not_found'/,
    );
    expect(fnBody("publish_workflow_version_v1")).toMatch(
      /return 'not_found';\s+-- merged with missing/,
    );
    // Delegation by address never reveals whether an account exists.
    const delegate = fnBody("delegate_workflow_step_v1");
    expect(delegate).toContain("'invalid_delegate'");
    expect(delegate).not.toContain("'no_such_user'");
  });
});

describe("6. TS layer — RPC-only writes, honest degradation, bounded reads", () => {
  it("the actions call exactly the eight gated commands", () => {
    const rpcCalls = [...ACTIONS.matchAll(/\.rpc\(\s*\n?\s*"([a-z0-9_]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(rpcCalls)).toEqual(new Set(COMMANDS));
  });

  it("no .insert/.update/.delete/.upsert anywhere in the approvals layer", () => {
    for (const src of APPROVALS_LAYER) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("workflow_* tables are read only by the approvals read service and the notification emitters", () => {
    const files = [
      ...walkSource(join(ROOT, "app")),
      ...walkSource(join(ROOT, "components")),
      ...walkSource(join(ROOT, "lib")),
    ];
    const offenders = new Set<string>();
    for (const abs of files) {
      const src = readFileSync(abs, "utf8");
      if (/\.from\("workflow_[a-z_]+"\)/.test(src)) {
        offenders.add(abs.split("\\").join("/"));
      }
    }
    const allowed = [
      "lib/approvals/approvals.ts",
      "lib/notifications/event-emitters.ts",
      // Timesheets (functional completion train V2) run their approval ON
      // the engine: the read service reads instance state to render the ONE
      // WorkflowTimeline and detect terminal outcomes (sync copies, never
      // decides); the actions read workflow_definitions to find the org's
      // published timesheet template before calling the engine's own start
      // RPC. Reads only — the no-direct-write rule is pinned by
      // lib/guards/timesheets.test.ts.
      "lib/timesheets/timesheets.ts",
      "lib/timesheets/timesheets-actions.ts",
      // Typed employee requests (v1): the register reads its instances'
      // engine rows (status overlay + timeline) with the SAME discipline —
      // RLS-scoped server client, bounded, read-only; writes stay engine
      // commands. Guarded in lib/guards/employee-requests.test.ts.
      "lib/requests/requests.ts",
      // Declared CONSUMER (Agreement & Rights Engine, train H): the
      // agreements read service lists the org's PUBLISHED 'agreement'
      // workflow definitions for its submit form (RLS-scoped SELECT of
      // workflow_definitions / workflow_definition_versions only) and never
      // writes an engine table — the no-insert/update/delete pin below
      // covers the approvals layer, and lib/guards/agreements.test.ts pins
      // the agreements layer to its own eight gated commands.
      "lib/agreements/agreements.ts",
    ];
    expect(offenders.size).toBe(allowed.length);
    for (const a of allowed) {
      expect(
        [...offenders].some((o) => o.endsWith(a)),
        `${a} should be a reader`,
      ).toBe(true);
    }
  });

  it("reads are RLS-scoped (server client, never the admin client) and bounded", () => {
    expect(READS).toMatch(/from "@\/lib\/supabase\/server"/);
    expect(READS).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    expect(READS).toMatch(/WORKFLOW_READ_LIMIT/);
  });

  it("all four missing-migration codes map to the honest not-enabled state", () => {
    expect(MODEL).toContain('"42P01"');
    expect(MODEL).toContain('"42703"');
    expect(MODEL).toContain('"42883"');
    expect(MODEL).toContain('"PGRST202"');
    expect(READS).toMatch(/"needs-migration"/);
    expect(ACTIONS).toMatch(/needs_migration/);
    expect(SECTION).toMatch(/needs-migration/);
    expect(SECTION).toMatch(/approvals-unavailable/);
  });

  it("no external transport — deciding contacts nobody", () => {
    for (const src of APPROVALS_LAYER) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });
});

describe("7. no new route — the constitution-compliant expansion", () => {
  it("no /dashboard/approvals page exists; the area lives on the network page", () => {
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "approvals")),
    ).toBe(false);
    expect(NETWORK_PAGE).toMatch(/<ApprovalsSection/);
    expect(NETWORK_PAGE).toMatch(/isWorkflowNotice/);
    expect(SECTION).toMatch(/id="approvals"/);
  });

  it("the section and timeline are server components with native-nav forms only", () => {
    for (const src of [SECTION, TIMELINE]) {
      expect(src).not.toMatch(/"use client"/);
      expect(src).not.toMatch(/useTransition|startTransition|useState/);
    }
    expect(SECTION).toMatch(/action=\{decideWorkflowStepAction\}/);
    expect(SECTION).toMatch(/action=\{delegateWorkflowStepAction\}/);
    expect(SECTION).toMatch(/action=\{withdrawWorkflowInstanceAction\}/);
    expect(SECTION).toMatch(/action=\{cancelWorkflowInstanceAction\}/);
    expect(SECTION).toMatch(/action=\{startWorkflowRequestAction\}/);
    expect(SECTION).toMatch(/action=\{createWorkflowDefinitionAction\}/);
    expect(SECTION).toMatch(/action=\{publishWorkflowVersionAction\}/);
    expect(SECTION).toMatch(/action=\{markOverdueWorkflowStepsAction\}/);
    expect(SECTION).toMatch(/role="status"/);
  });

  it("the timeline component is reused (not re-implemented) by the section", () => {
    expect(SECTION).toMatch(
      /import \{ WorkflowTimeline \} from "@\/components\/app\/workflow-timeline"/,
    );
    expect(TIMELINE).toMatch(/deriveStepProgress/);
  });
});

describe("8. durable notifications — typed, emitted, labelled, reachable", () => {
  it("the union admits exactly what the v3 constraint admits", () => {
    for (const t of WORKFLOW_EVENT_TYPES) {
      expect(EVENTS).toContain(`"${t}"`);
    }
    expect(EVENTS).toContain('"workflow_instance"');
    expect(NOTIFICATION_ENTITY_HREF.workflow_instance).toBe(
      "/dashboard/network",
    );
    expect(notificationEventHref("workflow_instance")).toBe(
      "/dashboard/network",
    );
  });

  it("emitters exist, resolve recipients from engine rows, and are called on the right success paths", () => {
    for (const fn of [
      "emitWorkflowStepPendingNotifications",
      "emitWorkflowDecidedNotification",
      "emitWorkflowDelegatedNotification",
      "emitWorkflowEscalatedNotifications",
    ]) {
      expect(EMITTERS).toContain(`export async function ${fn}`);
      expect(ACTIONS).toContain(fn);
    }
    // Start success → step-1 approvers; step handover → next approvers.
    expect(ACTIONS).toMatch(
      /UUID_RX\.test\(outcome\)[\s\S]{0,200}emitWorkflowStepPendingNotifications/,
    );
    expect(ACTIONS).toMatch(
      /outcome === "step_approved"[\s\S]{0,200}emitWorkflowStepPendingNotifications/,
    );
    // Terminal outcomes → the requester hears.
    expect(ACTIONS).toMatch(
      /outcome === "approved" \|\| outcome === "rejected"[\s\S]{0,200}emitWorkflowDecidedNotification/,
    );
    // Recipients come from engine rows, never client ids.
    expect(EMITTERS).toMatch(/readWorkflowInstanceLite/);
  });

  for (const l of CATALOGUE) {
    it(`${l} labels all four workflow event types (and never claims auto-approval)`, () => {
      const m = JSON.parse(read(`messages/${l}.json`));
      const types = m.auth.notifications.types;
      for (const t of WORKFLOW_EVENT_TYPES) {
        expect(typeof types[`event_${t}`], `${l}: event_${t}`).toBe("string");
        expect(types[`event_${t}`].length, `${l}: event_${t}`).toBeGreaterThan(
          10,
        );
      }
      // The escalated label states a deadline fact only.
      expect(types.event_workflow_escalated.toLowerCase()).not.toMatch(
        /automat/,
      );
    });
  }
});

describe("9. copy resolves in every catalogue (all 11 — no [EN] debt added)", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (node, k) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[k]
            : undefined,
        msgs,
      );

  const STATIC_KEYS = [
    "approvals.title",
    "approvals.intro",
    "approvals.unavailable",
    "approvals.honestNote",
    "approvals.loadError",
    "approvals.inbox.title",
    "approvals.inbox.empty",
    "approvals.inbox.stepLabel",
    "approvals.start.title",
    "approvals.start.definitionLabel",
    "approvals.start.titleLabel",
    "approvals.start.detailsLabel",
    "approvals.start.submit",
    "approvals.myRequests.title",
    "approvals.myRequests.empty",
    "approvals.admin.title",
    "approvals.admin.noPending",
    "approvals.admin.overdueHint",
    "approvals.templates.title",
    "approvals.templates.empty",
    "approvals.templates.createTitle",
    "approvals.templates.orgLabel",
    "approvals.templates.nameLabel",
    "approvals.templates.contextLabel",
    "approvals.templates.stepLegend",
    "approvals.templates.optional",
    "approvals.templates.stepNameLabel",
    "approvals.templates.modeLabel",
    "approvals.templates.ruleLabel",
    "approvals.templates.deadlineLabel",
    "approvals.templates.escalationHint",
    "approvals.templates.createSubmit",
    "approvals.templates.stepCount",
    "approvals.templates.published",
    "approvals.actions.approve",
    "approvals.actions.reject",
    "approvals.actions.delegate",
    "approvals.actions.delegateSubmit",
    "approvals.actions.withdraw",
    "approvals.actions.cancel",
    "approvals.actions.markOverdue",
    "approvals.actions.publish",
    "approvals.form.reasonLabel",
    "approvals.form.reasonOptional",
    "approvals.form.delegateEmailLabel",
    "approvals.form.delegateHint",
    "approvals.rule.owner_admin",
    "approvals.rule.requester_manager",
    "approvals.timeline.open",
    "approvals.timeline.progress",
    "approvals.timeline.deadline",
    "approvals.timeline.historyTitle",
    "approvals.timeline.stepLabel",
    "approvals.decision.approved",
    "approvals.decision.rejected",
  ];

  for (const loc of CATALOGUE) {
    it(`${loc}: full approvals catalogue with no [EN] marker`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      const keys = [
        ...STATIC_KEYS,
        ...WORKFLOW_INSTANCE_STATUSES.map((s) => `approvals.status.${s}`),
        ...WORKFLOW_STEP_STATUSES.map((s) => `approvals.stepStatus.${s}`),
        ...WORKFLOW_APPROVAL_MODES.map((m) => `approvals.mode.${m}`),
        ...WORKFLOW_CONTEXT_ENTITY_TYPES.map(
          (c) => `approvals.contextType.${c}`,
        ),
        ...WORKFLOW_TRANSITION_ACTIONS.map((a) => `approvals.transition.${a}`),
        ...WORKFLOW_NOTICES.map((n) => `approvals.notice.${n}`),
      ];
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
        expect(
          typeof v === "string" && !v.startsWith("[EN]"),
          `${loc}: ${key} carries an [EN] debt marker`,
        ).toBe(true);
      }
    });
  }

  it("copy stays honest: internal-only note, escalation never claims auto-approval", () => {
    const en = JSON.parse(read("messages/en.json")).approvals;
    expect(en.honestNote.toLowerCase()).toMatch(/nothing is emailed/);
    expect(en.admin.overdueHint.toLowerCase()).toContain(
      "nothing is ever approved automatically",
    );
    expect(en.templates.escalationHint.toLowerCase()).toContain(
      "never approved automatically",
    );
  });
});
