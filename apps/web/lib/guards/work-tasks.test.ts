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
 *   - NO MIGRATION IN THIS PR: no repo migration defines work_tasks or the
 *     three RPC names yet — D2 gets clean names to claim.
 *   - RPC-ONLY writes app-side: the ONLY write paths are
 *     create_work_task_v1 / set_work_task_status_v1 / update_work_task_v1;
 *     no .insert/.update/.delete/.upsert anywhere in the task layer, and no
 *     other module touches work_tasks at all.
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

const ZERO: SpineCounts = {
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  pendingInvitations: 0,
  openTaskAttention: 0,
  newJobMatches: 0,
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

  it("only the D2 migration and its rollback sibling mention work_tasks or the three RPCs", () => {
    for (const dir of ["migrations", "rollbacks"]) {
      const abs = join(REPO, "supabase", dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs).filter((f) => f.endsWith(".sql"))) {
        if (f.startsWith(D2)) continue;
        const src = readFileSync(join(abs, f), "utf8");
        expect(src, `${dir}/${f} must not define work_tasks`).not.toMatch(
          /\bwork_tasks\b/,
        );
        for (const fn of RPC_NAMES) {
          expect(src, `${dir}/${f} must not define ${fn}`).not.toContain(fn);
        }
      }
    }
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
  it("the actions call exactly the three gated RPCs", () => {
    for (const fn of RPC_NAMES) {
      expect(ACTIONS).toMatch(new RegExp(`\\.rpc\\("${fn}"`));
    }
    // No other RPC and no direct write sneaks into the task layer.
    const rpcCalls = [...ACTIONS.matchAll(/\.rpc\("([a-z0-9_]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(rpcCalls)).toEqual(new Set(RPC_NAMES));
  });

  it("no .insert/.update/.delete/.upsert anywhere in the task layer", () => {
    for (const src of TASK_LAYER) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("work_tasks is read ONLY by lib/tasks/tasks.ts across the whole app", () => {
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
    expect(offenders.map((p) => p.split("\\").join("/"))).toEqual(
      expect.arrayContaining([expect.stringContaining("lib/tasks/tasks.ts")]),
    );
    expect(offenders).toHaveLength(1);
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

  it("no people-picker: assignee stays self-assign default / unassigned", () => {
    // v1 deliberately builds NO select over other people's profiles.
    expect(PAGE).toMatch(/name="assignSelf"/);
    expect(PAGE).not.toMatch(/name="assigneeProfileId"|assignee-select/);
    expect(ACTIONS).toMatch(/p_assign_to_self/);
    expect(ACTIONS).not.toMatch(/p_assignee/);
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
