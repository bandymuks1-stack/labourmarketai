import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { moduleForSignal } from "@/lib/dashboard/activity-centre";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import {
  SPINE_SIGNALS,
  buildSpineNotifications,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";
import {
  MIGRATION_MISSING_ERROR_CODES,
  OPEN_WORK_TASK_STATUSES,
  WORK_TASK_PRIORITIES,
  WORK_TASK_READ_LIMIT,
  WORK_TASK_STATUSES,
  deriveTaskAttention,
  isOpen,
  isOverdue,
  taskNeedsAttention,
} from "@/lib/tasks/task-model";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * WORK TASK guards (control room PR D, capability gap map §3).
 *
 * This PR ships the complete REPO-SAFE layer over the `work_tasks` contract
 * a SEPARATE, human-gated migration PR (D2) will propose. These pins keep
 * the layer honest:
 *
 *   - EXACTLY TWO migration pairs own the contract: the applied D2 v1 pair
 *     (20260711210000) and the train-D v2 collaboration pair
 *     (20260817151000 — object link, assign-to-other, dependencies, gated
 *     reopen, append-only history). Nothing else may (re)define them.
 *   - RPC-ONLY writes app-side: the ONLY write paths are the gated v1/v2
 *     RPCs; no .insert/.update/.delete/.upsert anywhere in the task layer.
 *   - HONEST lifecycle: exactly todo/in_progress/blocked/done/cancelled.
 *   - HONEST degradation: missing-relation/RPC codes (42P01/42703/42883/
 *     PGRST202) map to the calm "needs-migration" state — never a crash,
 *     never fake rows, and the spine count is 0 in that state.
 *   - NO EXTERNAL TRANSPORT: creating a task contacts nobody.
 *   - Registered everywhere a module must be: module registry, command
 *     registry, primary-route smoke, spine signal + activity centre, i18n
 *     in every ACTIVE locale.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const MODEL = read("lib/tasks/task-model.ts");
const READS = read("lib/tasks/tasks.ts");
const ACTIONS = read("lib/tasks/task-actions.ts");
const PAGE_REL = "app/[locale]/dashboard/tasks/page.tsx";
const PAGE = read(PAGE_REL);
const SPINE = read("lib/notifications/spine.ts");

const TASK_LAYER = [MODEL, READS, ACTIONS, PAGE];

const RPC_NAMES = [
  "create_work_task_v1",
  "set_work_task_status_v1",
  "update_work_task_v1",
] as const;

/** Train-D v2 collaboration RPCs (20260817151000). The actions call v2 and
 *  fall back to the APPLIED v1 names pre-apply (booking precedent). */
const RPC_NAMES_V2 = [
  "create_work_task_v2",
  "set_work_task_status_v2",
  "update_work_task_v2",
  "assign_work_task_v1",
  "reopen_work_task_v1",
  "add_work_task_dependency_v1",
  "remove_work_task_dependency_v1",
] as const;

const ZERO: SpineCounts = {
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  pendingInvitations: 0,
  openTaskAttention: 0,
  newJobMatches: 0,
  pendingAbsenceReviews: 0,
};

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

describe("1. exactly one migration owns work_tasks — the human-gated D2 pair", () => {
  // D1 shipped the consumer layer with NO migration; D2 added the single
  // human-gated draft (20260711210000_work_tasks_v1.sql) plus its rollback
  // sibling. Nothing else in the repo may (re)define the table or the RPCs.
  const D2 = "20260711210000_work_tasks_v1";
  const TRAIN_D = "20260817151000_work_tasks_v2_collaboration";
  // Train G (employee lifecycle) is a sanctioned READER, not a definer: its
  // onboarding item link-verification SELECTs from work_tasks (assignee +
  // status='done') and never creates/alters/drops the table or touches the
  // task RPCs — asserted below, so the exemption cannot rot into a fork.
  const LIFECYCLE_READER = "20260817190000_employee_lifecycle_v1";

  /**
   * Declared CONSUMERS: migrations that may REFERENCE work_tasks (an FK to it,
   * or a read of it) but never define, recreate, alter or drop the table or
   * any task RPC. This is a UNION — add a prefix here together with the
   * narrower assertions below, never by relaxing the rule for everyone.
   *
   *   20260817190000 — Employee Lifecycle v1 (train G), the LIFECYCLE_READER
   *   above: its onboarding item link-verification SELECTs from work_tasks.
   *   20260817232000 — Management Decisions v1 (train K): `decision_task_links`
   *   holds an FK to public.work_tasks and `link_decision_task_v1` reads it to
   *   verify the caller genuinely owns the task. No task field is copied and
   *   no task is ever created; the existing task RPCs stay the only writers.
   */
  /**
   *   20260819190000 — Work Journal ↔ work_task evidence link v1 (field-work
   *   audit v1 P0): `journal_entry_tasks` holds an FK to public.work_tasks and
   *   the two link RPCs SELECT it to re-check that the caller may see the task
   *   under the existing wt_select predicate. No task field is copied, no task
   *   is created, updated or deleted, and no task RPC is redefined — the
   *   existing task RPCs stay the only writers.
   */
  const CONSUMERS = [
    LIFECYCLE_READER,
    "20260817232000_management_decisions_v1",
    "20260819190000_journal_task_evidence_link_v1",
    /**
     *   20260819220000 — task attribution of canonical work-time (chain step
     *   A): timesheet_compute_lines_v1 LEFT JOINs public.work_tasks purely to
     *   read a task's title for an already-attributed line. It creates,
     *   alters, drops, writes and policies nothing on work_tasks, and defines
     *   no task RPC — the existing task RPCs stay the only writers.
     */
    "20260819220000_timesheet_task_attribution_v1",
    /**
     *   20260820070000 — chain step B on-ramp: start_workflow_instance_v1
     *   SELECTs public.work_tasks to check that a task sent for approval is
     *   VISIBLE to the caller and belongs to the flow's organization, and to
     *   read its title so approvers never see caller-supplied text. It
     *   creates, alters, drops, writes and policies nothing on work_tasks and
     *   defines no task RPC — the existing task RPCs stay the only writers.
     */
    "20260820070000_workflow_work_task_definition_v1",
    /**
     *   20260831170000 — M3 compute wiring (owner 2026-08-31 closure-session
     *   sequence): re-issues timesheet_compute_lines_v1 with the 20260819220000
     *   journal half copied VERBATIM — so it inherits, unchanged, that body's
     *   task_link CTE (a read of public.work_tasks for attribution + title,
     *   tenant-scoped) — and adds only the work_hour_allocations source. Its
     *   rollback restores the 20260819220000 body verbatim, with the same
     *   read. It creates, alters, drops, writes and policies nothing on
     *   work_tasks, and defines no task RPC — the existing task RPCs stay the
     *   only writers.
     */
    "20260831170000_timesheet_compute_allocations_v1",
  ];

  it("only the D2 + train-D migration pairs DEFINE work_tasks or the task RPCs", () => {
    for (const dir of ["migrations", "rollbacks"]) {
      const abs = join(REPO, "supabase", dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs).filter((f) => f.endsWith(".sql"))) {
        if (f.startsWith(D2) || f.startsWith(TRAIN_D)) continue;
        const src = readFileSync(join(abs, f), "utf8");
        if (CONSUMERS.some((c) => f.startsWith(c))) {
          // A consumer may reference the table, and NOTHING more.
          expect(src, `${dir}/${f} must not create/alter/drop work_tasks`).not.toMatch(
            /(create|alter|drop)\s+table\s+(if (not )?exists\s+)?public\.work_tasks\b/i,
          );
          expect(src, `${dir}/${f} must not write work_tasks`).not.toMatch(
            /(insert\s+into|update|delete\s+from)\s+public\.work_tasks\b/i,
          );
          expect(src, `${dir}/${f} must not policy work_tasks`).not.toMatch(
            /(create|drop)\s+policy[\s\S]{0,80}on public\.work_tasks\b/i,
          );
          for (const fn of [...RPC_NAMES, ...RPC_NAMES_V2]) {
            expect(src, `${dir}/${f} must not define ${fn}`).not.toContain(
              `function public.${fn}(`,
            );
          }
          continue;
        }
        expect(src, `${dir}/${f} must not define work_tasks`).not.toMatch(
          /\bwork_tasks\b/,
        );
        for (const fn of [...RPC_NAMES, ...RPC_NAMES_V2]) {
          expect(src, `${dir}/${f} must not define ${fn}`).not.toContain(fn);
        }
      }
    }
  });

  it("the train-D v2 pair exists, stays gated, and claims exactly the v2 names", () => {
    const up = readFileSync(
      join(REPO, "supabase", "migrations", `${TRAIN_D}.sql`),
      "utf8",
    );
    const down = readFileSync(
      join(REPO, "supabase", "rollbacks", `${TRAIN_D}.down.sql`),
      "utf8",
    );
    expect(up).toContain("needs-human-gate");
    expect(up).toContain("@human-gate-approved");
    // The v1 RPCs are NOT recreated — v2 are new names (rollback-chain rule).
    for (const fn of RPC_NAMES) {
      expect(up).not.toContain(`create or replace function public.${fn}(`);
    }
    for (const fn of RPC_NAMES_V2) {
      expect(up).toContain(`create or replace function public.${fn}`);
      expect(down).toContain(`drop function if exists public.${fn}`);
    }
    // Append-only history + dependencies stay client-unwritable.
    expect(up).toMatch(
      /revoke insert, update, delete on public\.work_task_events from authenticated/,
    );
    expect(up).toMatch(
      /revoke insert, update, delete on public\.task_dependencies from authenticated/,
    );
    // Cycle rejection is a real recursive walk, not a comment.
    expect(up).toMatch(/with recursive up as \(/);
    expect(up).toContain("return 'cycle';");
    // Reopen is its own gated act; terminal states do not move in status v2.
    expect(up).toMatch(/if t\.status in \('done','cancelled'\) then\s*\n\s*return 'invalid_transition';/);
  });

  it("the D2 pair exists, stays human-gated, and defines the exact contract", () => {
    const up = readFileSync(
      join(REPO, "supabase", "migrations", `${D2}.sql`),
      "utf8",
    );
    const down = readFileSync(
      join(REPO, "supabase", "rollbacks", `${D2}.down.sql`),
      "utf8",
    );
    // Human gate + no-auto-apply doctrine stays visible in the file itself.
    expect(up).toContain("needs-human-gate");
    expect(up).toContain("@human-gate-approved");
    expect(up).toMatch(/create table if not exists public\.work_tasks/);
    for (const fn of RPC_NAMES) {
      expect(up).toContain(`create or replace function public.${fn}`);
      expect(down).toContain(`drop function if exists public.${fn}`);
    }
    expect(down).toMatch(/drop table if exists public\.work_tasks/);
    // Writes stay RPC-only at the SQL layer too.
    expect(up).toMatch(
      /revoke insert, update, delete on public\.work_tasks from authenticated/,
    );
    // The five honest statuses, verbatim.
    expect(up).toContain(
      "check (status in ('todo','in_progress','blocked','done','cancelled'))",
    );
  });
});

describe("2. writes are RPC-only, and only the task layer touches work_tasks", () => {
  it("the actions call exactly the gated v2 RPCs plus the v1 fallbacks", () => {
    // `\s*` because prettier wraps long rpc calls onto the next line.
    for (const fn of [...RPC_NAMES, ...RPC_NAMES_V2]) {
      expect(ACTIONS).toMatch(new RegExp(`\\.rpc\\(\\s*"${fn}"`));
    }
    // No other RPC and no direct write sneaks into the task layer.
    const rpcCalls = [...ACTIONS.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(rpcCalls)).toEqual(new Set([...RPC_NAMES, ...RPC_NAMES_V2]));
  });

  it("no .insert/.update/.delete/.upsert anywhere in the task layer", () => {
    for (const src of TASK_LAYER) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("work_tasks is read by exactly the three declared modules", () => {
    const files = [
      ...walkSource(join(ROOT, "app")),
      ...walkSource(join(ROOT, "components")),
      ...walkSource(join(ROOT, "lib")),
    ];
    const offenders: string[] = [];
    for (const abs of files) {
      const src = readFileSync(abs, "utf8");
      if (/\.from\("work_tasks"\)/.test(src)) offenders.push(abs);
    }
    // Train D widened this from one reader to exactly three:
    //   - lib/tasks/tasks.ts             — the canonical RLS-scoped read;
    //   - lib/projects/progress.ts       — derived progress (status only);
    //   - lib/notifications/event-emitters.ts — the assignment emitter's
    //     recipient resolution (admin client, AFTER the domain write).
    //
    // Chain step B adds two, both READ-ONLY and both there to keep an
    // approval inside the task's OWN organization:
    //   - lib/approvals/task-approvals.ts — `getTaskOrganizations` resolves a
    //     task's organization through its project/object spine so the UI can
    //     offer only that organization's flows. Copies no task field.
    //   - lib/tasks/task-approval-actions.ts — reads the task's own title
    //     under the caller's RLS instead of trusting a posted one. The engine
    //     overrides the title anyway; this is defence in depth and an honest
    //     early error.
    const normalized = offenders
      .map((p) => p.split("\\").join("/"))
      .map((p) => p.slice(p.indexOf("lib/")))
      .sort();
    expect(normalized).toEqual([
      "lib/approvals/task-approvals.ts",
      "lib/notifications/event-emitters.ts",
      "lib/projects/progress.ts",
      "lib/tasks/task-approval-actions.ts",
      "lib/tasks/tasks.ts",
    ]);
    // Neither new reader may WRITE, and neither may escape RLS.
    for (const rel of [
      "lib/approvals/task-approvals.ts",
      "lib/tasks/task-approval-actions.ts",
    ]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, `${rel} must not write work_tasks`).not.toMatch(
        /from\("work_tasks"\)[\s\S]{0,120}\.(insert|update|delete|upsert)\(/,
      );
      expect(src, `${rel} must not use the admin client`).not.toMatch(
        /supabase\/admin|createAdminClient|service_role/,
      );
    }
  });

  it("reads are bounded and RLS-scoped (server client, never the admin client)", () => {
    expect(READS).toMatch(/from "@\/lib\/supabase\/server"/);
    expect(READS).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    expect(READS).toMatch(/\.limit\(WORK_TASK_READ_LIMIT\)/);
    expect(WORK_TASK_READ_LIMIT).toBeLessThanOrEqual(200);
    // Deterministic order: due date first (nulls last), then created.
    expect(READS).toMatch(
      /\.order\("due_at", \{ ascending: true, nullsFirst: false \}\)/,
    );
    expect(READS).toMatch(/\.order\("created_at", \{ ascending: false \}\)/);
  });
});

describe("3. honest lifecycle — exactly the five allowed statuses", () => {
  it("status and priority enums are pinned", () => {
    expect([...WORK_TASK_STATUSES]).toEqual([
      "todo",
      "in_progress",
      "blocked",
      "done",
      "cancelled",
    ]);
    expect([...OPEN_WORK_TASK_STATUSES]).toEqual([
      "todo",
      "in_progress",
      "blocked",
    ]);
    expect([...WORK_TASK_PRIORITIES]).toEqual(["low", "normal", "high"]);
  });

  it("attention derivation is pure and honest: open + (overdue or blocked)", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    expect(isOpen("todo")).toBe(true);
    expect(isOpen("done")).toBe(false);
    expect(isOverdue("2026-07-10T00:00:00Z", now)).toBe(true);
    // Due today is NOT overdue yet.
    expect(isOverdue("2026-07-11T00:00:00Z", now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
    // A finished task never demands attention — the signal self-clears.
    expect(
      taskNeedsAttention({ status: "done", dueAt: "2020-01-01" }, now),
    ).toBe(false);
    expect(
      taskNeedsAttention({ status: "blocked", dueAt: null }, now),
    ).toBe(true);
    const counts = deriveTaskAttention(
      [
        { status: "todo", dueAt: "2026-07-01" }, // overdue
        { status: "blocked", dueAt: "2026-07-01" }, // overdue AND blocked → once
        { status: "blocked", dueAt: null }, // blocked
        { status: "in_progress", dueAt: "2026-08-01" }, // fine
        { status: "done", dueAt: "2026-07-01" }, // finished — never counted
      ],
      now,
    );
    expect(counts).toEqual({ overdue: 2, blocked: 2, total: 3 });
  });
});

describe("4. honest degradation while the D2 migration is unapplied", () => {
  it("all four missing-migration codes are handled in one shared place", () => {
    expect([...MIGRATION_MISSING_ERROR_CODES]).toEqual([
      "42P01",
      "42703",
      "42883",
      "PGRST202",
    ]);
    expect(READS).toMatch(/isMigrationMissingCode/);
    expect(READS).toMatch(/"needs-migration"/);
    expect(ACTIONS).toMatch(/isMigrationMissingCode/);
    expect(ACTIONS).toMatch(/needs_migration/);
  });

  it("the page renders the calm not-available state (no fake UI)", () => {
    expect(PAGE).toMatch(/"needs-migration"/);
    expect(PAGE).toMatch(/tasks-unavailable/);
    expect(PAGE).toMatch(/t\("unavailable"\)/);
  });

  it("the spine count degrades to zero, never a throw into the layout", () => {
    expect(READS).toMatch(/ZERO_TASK_ATTENTION/);
    expect(READS).toMatch(/if \(res\.error\) return ZERO_TASK_ATTENTION;/);
  });
});

describe("5. no external transport — a task contacts nobody", () => {
  it("no outbound call and no transport-provider import in the task layer", () => {
    for (const src of TASK_LAYER) {
      // No outbound call and no transport-provider import (comments may
      // legitimately SAY "no Telegram" — imports/calls are what's pinned).
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });
});

describe("6. registered everywhere a module must be", () => {
  it("module registry: tasks → /dashboard/tasks, grid+command, ALL roles, spine-linked badge", () => {
    const m = getDashboardModule("tasks");
    expect(getModuleRoute("tasks")).toBe("/dashboard/tasks");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    // Never a nav tab — the primary nav stays catalogue-derived.
    expect(m.surfaces).not.toContain("nav");
    expect([...m.roles].sort()).toEqual(
      ["agency", "company", "customer", "worker"].sort(),
    );
    expect(m.attentionSignalIds).toEqual(["open-task-attention"]);
    expect(m.iconKey).toBe("checklist");
  });

  // The grid icon-map pin died with the module grid (W3 Package 4 deleted
  // the second dashboard); the registry's iconKey stays pinned above.
  it("primary-route smoke inventory carries /dashboard/tasks", () => {
    const entry = PRIMARY_ROUTES.find((r) => r.urlPattern === "/dashboard/tasks");
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe(PAGE_REL);
    expect(entry!.requiresAuth).toBe(true);
    expect(existsSync(join(ROOT, PAGE_REL))).toBe(true);
  });

  it("command registry: the tasks entry resolves through getModuleRoute with 5-locale copy", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "tasks");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe(getModuleRoute("tasks"));
    expect(entry!.audience).toBe("public");
    for (const loc of activeLocales) {
      expect(entry!.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(0);
      expect(entry!.synonyms[loc]?.length, `synonyms ${loc}`).toBeGreaterThan(0);
    }
  });

  it("spine: the open-task-attention signal exists, clears on the tasks page and is count-gated", () => {
    const signal = SPINE_SIGNALS.find((s) => s.id === "open-task-attention");
    expect(signal).toBeTruthy();
    expect(signal!.type).toBe("open_task_attention");
    expect(signal!.href).toBe("/dashboard/tasks");
    // State-derived (like pending-bookings) — never a nav-tab badge.
    expect(signal!.featureKey).toBeUndefined();
    expect(buildSpineNotifications(ZERO, "worker")).toEqual([]);
    const rows = buildSpineNotifications(
      { ...ZERO, openTaskAttention: 3 },
      "worker",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "open-task-attention",
      count: 3,
      href: "/dashboard/tasks",
    });
  });

  it("spine IO half loads the task attention count in the one parallel pass", () => {
    expect(SPINE).toMatch(
      /import \{ getTaskAttentionCounts \} from "@\/lib\/tasks\/tasks"/,
    );
    expect(SPINE).toMatch(/getTaskAttentionCounts\(\)/);
    expect(SPINE).toMatch(/openTaskAttention: taskAttention\.total/);
  });

  it("activity centre picks the signal up through the registry linkage", () => {
    const m = moduleForSignal("open-task-attention");
    expect(m?.id).toBe("tasks");
  });

  it("exactly one module declares the signal (no double-badged count)", () => {
    const declaring = DASHBOARD_MODULES.filter((m) =>
      (m.attentionSignalIds ?? []).includes("open-task-attention"),
    );
    expect(declaring.map((m) => m.id)).toEqual(["tasks"]);
  });

  it("project operations bridges to the project-scoped task view (navigation only)", () => {
    const ops = read("app/[locale]/dashboard/projects/[id]/operations/page.tsx");
    expect(ops).toMatch(/\/dashboard\/tasks\?project=\$\{id\}/);
    expect(ops).toMatch(/tTasks\("projectSection\.link"\)/);
  });
});

describe("7. accessible controls — real actions, no drag-and-drop dependency", () => {
  it("status transitions and create/edit are NATIVE-NAV server-action forms", () => {
    expect(PAGE).toMatch(/action=\{setWorkTaskStatusAction\}/);
    expect(PAGE).toMatch(/action=\{createWorkTaskAction\}/);
    expect(PAGE).toMatch(/action=\{updateWorkTaskAction\}/);
    // Server component with plain links/forms — no client drag state.
    // (Comments may legitimately SAY "no drag-and-drop" — strip them first.)
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(
      /(^|[^:])\/\/[^\n]*/g,
      "$1",
    );
    expect(code).not.toMatch(/"use client"/);
    expect(code).not.toMatch(/useTransition|startTransition/);
    expect(code).not.toMatch(/draggable|onDragStart|onDrop/);
  });

  it("no drag-and-drop / calendar dependency entered the app", () => {
    const pkg = read("package.json");
    expect(pkg).not.toMatch(
      /dnd-kit|react-beautiful-dnd|react-dnd|sortablejs|fullcalendar|react-big-calendar/i,
    );
  });

  it("assign-to-other is gated: picker is org-members-only, server re-checks", () => {
    // Train D replaced v1's self-assign-only rule with the GATED people
    // picker: options come ONLY from the active workspace's live members
    // (listOrganizationMembers), the RPC re-checks managing authority +
    // target eligibility server-side, and the durable notification recipient
    // is resolved from the task row (never caller input).
    expect(PAGE).toMatch(/name="assigneeProfileId"/);
    expect(PAGE).toMatch(/listOrganizationMembers/);
    expect(PAGE).toMatch(/name="assignSelf"/); // workers keep the v1 checkbox
    expect(ACTIONS).toMatch(/p_assignee_profile_id/);
    expect(ACTIONS).toMatch(/p_assign_to_self/); // the v1 fallback path
    expect(ACTIONS).toMatch(/emitWorkTaskAssignedNotification/);
    // The emitter never trusts the caller for the recipient.
    const EMITTERS = read("lib/notifications/event-emitters.ts");
    expect(EMITTERS).toMatch(/from\("work_tasks"\)/);
    expect(EMITTERS).toMatch(/assignee === actorProfileId\) return/);
  });
});

describe("8. copy resolves in every ACTIVE locale (frozen-subset convention)", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, k) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[k]
          : undefined,
      msgs,
    );

  const STATIC_KEYS = [
    "tasks.eyebrow",
    "tasks.title",
    "tasks.intro",
    "tasks.honestNote",
    "tasks.notAuthed",
    "tasks.unavailable",
    "tasks.loadError",
    "tasks.myEmpty",
    "tasks.views.label",
    "tasks.views.my",
    "tasks.views.board",
    "tasks.flags.overdue",
    "tasks.flags.blocked",
    "tasks.dueLabel",
    "tasks.projectLinked",
    "tasks.closed.show",
    "tasks.closed.hide",
    "tasks.closed.empty",
    "tasks.board.columnEmpty",
    "tasks.form.title",
    "tasks.form.titleLabel",
    "tasks.form.titlePlaceholder",
    "tasks.form.descriptionLabel",
    "tasks.form.priorityLabel",
    "tasks.form.dueLabel",
    "tasks.form.projectLabel",
    "tasks.form.projectNone",
    "tasks.form.assignSelfLabel",
    "tasks.form.assignSelfHint",
    "tasks.form.submit",
    "tasks.projectTasks.title",
    "tasks.projectTasks.empty",
    "tasks.projectTasks.back",
    "tasks.projectSection.link",
    // Train D — collaboration copy.
    "tasks.objectLabel",
    "tasks.assignee.label",
    "tasks.assignee.you",
    "tasks.assignee.member",
    "tasks.assignee.unassigned",
    "tasks.assignForm.label",
    "tasks.assignForm.save",
    "tasks.dependencies.waitingOn",
    "tasks.dependencies.blockedBy",
    "tasks.dependencies.hidden",
    "tasks.dependencies.remove",
    "tasks.dependencies.addLabel",
    "tasks.dependencies.add",
    "tasks.history.title",
    "tasks.history.byYou",
    "tasks.history.byMember",
    "tasks.history.actions.created",
    "tasks.history.actions.status_changed",
    "tasks.history.actions.reopened",
    "tasks.history.actions.assigned",
    "tasks.history.actions.unassigned",
    "tasks.history.actions.priority_changed",
    "tasks.history.actions.due_changed",
    "tasks.history.actions.object_changed",
    "tasks.history.actions.dependency_added",
    "tasks.history.actions.dependency_removed",
    "tasks.form.objectLabel",
    "tasks.form.objectNone",
    "tasks.form.assigneeLabel",
    "tasks.form.assigneeHint",
    // Train D — the v4 durable assignment notification label.
    "auth.notifications.types.event_work_task_assigned",
  ];

  const ACTION_KEYS = [
    "start",
    "complete",
    "block",
    "unblock",
    "cancel",
    "reopen",
    "details",
    "save",
  ];

  const NOTICE_KEYS = [
    "created",
    "updated",
    "invalid",
    "needs_migration",
    "not_authorized",
    "not_found",
    "limit_reached",
    "cycle",
    "error",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: full tasks catalogue + the new signal copy`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      const keys = [
        ...STATIC_KEYS,
        ...WORK_TASK_STATUSES.map((s) => `tasks.status.${s}`),
        ...WORK_TASK_PRIORITIES.map((p) => `tasks.priority.${p}`),
        ...ACTION_KEYS.map((a) => `tasks.actions.${a}`),
        ...NOTICE_KEYS.map((n) => `tasks.notice.${n}`),
        // The new spine signal reuses the bell's naming convention and the
        // activity centre's read-semantics convention.
        "auth.notifications.types.open_task_attention",
        "activityCentre.readSemantics.open_task_attention",
      ];
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
    });
  }

  it("copy stays honest: internal-only note, no contact/urgency claims", () => {
    const en = JSON.parse(read("messages/en.json")).tasks;
    expect(en.honestNote).toMatch(/sends nothing/i);
    const blob = JSON.stringify(en).toLowerCase();
    expect(blob).not.toMatch(/we contacted|message sent|email sent|notified them/);
  });
});
