import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { buildControlRoomViewModel } from "@/lib/dashboard/control-room-view-model";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import {
  OPS_BOARD_ANCHOR,
  OPS_CENTRE_ATTENTION_MAX,
  OPS_CENTRE_BOOKING_READ_LIMIT,
  OPS_CENTRE_TASK_LIST_MAX,
  bookingOverlapsBand,
  deriveAttention,
  deriveProjectReadinessRatio,
  deriveReadinessRatio,
  deriveWorkerResources,
  openProjectTasks,
  projectDateBand,
  type WorkerBookingRange,
} from "@/lib/projects/operations-centre-model";
import type { ReadinessItem, WorkerOps } from "@/lib/projects/operations-derive";
import type { WorkTask } from "@/lib/tasks/task-model";
import type { SpineCounts } from "@/lib/notifications/spine-signals";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * PROJECT OPERATIONS CENTRE guards (control room PR G, gap map §6 + §7).
 *
 * The centre is an AGGREGATION over models that already exist — never a new
 * store and never a simulation of an absent model. These pins keep it honest:
 *
 *   - COMPOSITION-ONLY: the centre reuses the existing RLS-scoped services
 *     (operations board read, handover passport, project tasks, gallery
 *     summary); its only direct table reads are tables the existing libs
 *     already read (projects / workers / booking_requests), bounded; never
 *     the admin client, never a write, never an RPC, never outbound.
 *   - NO FAKE MODELS: no milestone / issue / risk model is rendered or claimed
 *     — where a real model is absent, nothing renders. (Defects became a REAL
 *     applied model in Wagon 11 — `defects`/`defect_corrections` with real RLS
 *     and honest degradation — so the defects panel is a genuine composed model,
 *     not a fake one, and is no longer forbidden here.)
 *   - REAL RATIOS ONLY: readiness ratios are raw counts of real checklist
 *     rows; attention items each trace to one real record; booking overlaps
 *     reuse the planning-model's inclusive accept-guard semantics and count
 *     ONLY accepted rows.
 *   - HONEST DEGRADATION: tasks and handover keep their needs-migration
 *     states; evidence/availability/bookings degrade to zero/empty.
 *   - REAL LINKS ONLY + registered module wiring + active-locale copy.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const MODEL = read("lib/projects/operations-centre-model.ts");
const COMPOSE = read("lib/projects/operations-centre.ts");
const GALLERY = read("lib/journal/project-gallery.ts");
const PAGE_REL = "app/[locale]/dashboard/projects/[id]/operations/page.tsx";
const PAGE = read(PAGE_REL);
const CENTRE_LAYER = [MODEL, COMPOSE, PAGE];

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const NOW = new Date("2026-07-11T10:00:00Z"); // today = 2026-07-11 (UTC)

/* ------------------------------------------------------------------ */
/* Fixtures — real-shaped rows for the pure-function tests             */
/* ------------------------------------------------------------------ */

function readinessItem(over: Partial<ReadinessItem>): ReadinessItem {
  return {
    itemKey: "identity_document",
    label: "Identity document",
    status: "needed",
    note: null,
    ...over,
  };
}

function workerOps(over: Partial<WorkerOps> & { workerId: string }): WorkerOps {
  return {
    workerProfileId: `profile-${over.workerId}`,
    name: `Worker ${over.workerId}`,
    assignedAt: "2026-07-01T00:00:00Z",
    journalEntries: 1,
    declaredSkills: 1,
    confirmedSkills: 0,
    openReviewItems: 0,
    lastActivity: "2026-07-10T00:00:00Z",
    ready: true,
    missing: [],
    needsFollowUp: false,
    operationalStatus: null,
    readinessItems: [],
    docsMissing: 0,
    docsReceived: 0,
    docsChecked: 0,
    docsBlocked: 0,
    ...over,
  };
}

function task(over: Partial<WorkTask> & { id: string }): WorkTask {
  return {
    projectId: "p1",
    title: `Task ${over.id}`,
    description: null,
    status: "todo",
    priority: "normal",
    assigneeProfileId: null,
    createdBy: "creator",
    dueAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    resolvedAt: null,
    ...over,
  };
}

function booking(
  over: Partial<WorkerBookingRange> & { bookingId: string; workerId: string },
): WorkerBookingRange {
  return {
    status: "accepted",
    startDate: null,
    endDate: null,
    ...over,
  };
}

describe("1. composition-only: existing RLS-scoped reads, nothing new", () => {
  it("reuses the existing degrading services (no duplicated source queries)", () => {
    expect(COMPOSE).toMatch(/from "@\/lib\/projects\/operations"/);
    expect(COMPOSE).toMatch(/getProjectOperations/);
    expect(COMPOSE).toMatch(/from "@\/lib\/projects\/handover-passport"/);
    expect(COMPOSE).toMatch(/getHandoverPassport\(projectId\)/);
    expect(COMPOSE).toMatch(/from "@\/lib\/tasks\/tasks"/);
    expect(COMPOSE).toMatch(/listProjectTasks\(projectId\)/);
    expect(COMPOSE).toMatch(/from "@\/lib\/journal\/project-gallery"/);
    expect(COMPOSE).toMatch(/getProjectGallerySummary\(projectId\)/);
  });

  it("direct table reads only on tables the existing libs already read, bounded", () => {
    const froms = [...COMPOSE.matchAll(/\.from\("([a-z0-9_-]+)"\)/g)].map(
      (m) => m[1],
    );
    // projects        — read by lib/projects/{operations,projects,map}.ts
    // workers         — read via the assignment join in lib/projects/operations.ts
    // booking_requests— read by lib/booking/booking-actions.ts
    expect(new Set(froms)).toEqual(
      new Set(["projects", "workers", "booking_requests"]),
    );
    expect(COMPOSE).toMatch(/\.limit\(OPS_CENTRE_BOOKING_READ_LIMIT\)/);
    expect(OPS_CENTRE_BOOKING_READ_LIMIT).toBeLessThanOrEqual(200);
    // The pure model and the page touch no table at all.
    expect(MODEL).not.toMatch(/\.from\(/);
    expect(PAGE).not.toMatch(/\.from\("(?!profiles")/); // page keeps only its role read
  });

  it("the gallery summary reads the SAME journal tables the gallery already reads (head counts)", () => {
    const froms = [...GALLERY.matchAll(/\.from\("([a-z0-9_-]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(new Set(froms)).toEqual(
      new Set(["journal_entries", "journal_entry_photos", "journal-entry-photos"]),
    );
    expect(GALLERY).toMatch(/head: true/);
  });

  it("uses the caller-scoped server client, never the admin client", () => {
    expect(COMPOSE).toMatch(/from "@\/lib\/supabase\/server"/);
    // Comments may honestly SAY "no service_role" — strip them first.
    for (const src of CENTRE_LAYER.map(stripComments)) {
      expect(src).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    }
  });

  it("read-only: no write verb and no RPC in the centre layer", () => {
    for (const src of [MODEL, COMPOSE]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
    // The page's only actions remain the board's existing gated action paths.
    expect(PAGE).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });

  it("no external transport — the centre contacts nobody", () => {
    for (const src of CENTRE_LAYER) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });
});

describe("2. no fake models — absent models render NOTHING", () => {
  it("no milestone / issue / risk / equipment model in the centre code", () => {
    // `defect` dropped in Wagon 11 — defects are now a real applied model
    // (defects/defect_corrections) rendered via the ProjectDefectsPanel with
    // honest degradation, exactly like stages/gantt/economics/assets.
    for (const src of CENTRE_LAYER.map(stripComments)) {
      expect(src).not.toMatch(/milestone|issueRegister|equipment|riskScore/i);
    }
  });

  it("the unapplied worker preference columns are never read (needs_accommodation / has_transport)", () => {
    // Comments may honestly NAME the columns that are NOT read — strip them.
    for (const src of CENTRE_LAYER.map(stripComments)) {
      expect(src).not.toMatch(/needs_accommodation|has_transport|willing_to_relocate|max_trip_days/);
    }
    // housing_provided is the ONLY applied accommodation field — shown verbatim.
    expect(COMPOSE).toMatch(/housing_provided/);
  });

  it("the copy says composition-of-existing, never claims absent models or verification", () => {
    const en = JSON.parse(read("messages/en.json")).projectOps.centre;
    expect(en.honestNote).toMatch(/not built yet and are not simulated/i);
    const blob = JSON.stringify(en).toLowerCase();
    expect(blob).not.toMatch(/\bverified\b|\bguaranteed\b|forecast|predicted score/);
  });
});

describe("3. real ratios only — raw counts of real checklist rows", () => {
  it("x/y over the real item rows; empty → 0/0, never a fake 100%", () => {
    expect(deriveReadinessRatio([])).toEqual({ checked: 0, total: 0 });
    expect(
      deriveReadinessRatio([
        readinessItem({ status: "checked" }),
        readinessItem({ itemKey: "a1", status: "needed" }),
        readinessItem({ itemKey: "b2", status: "received" }),
      ]),
    ).toEqual({ checked: 1, total: 3 });
  });

  it("the project ratio is the sum of every worker's real rows", () => {
    const workers = [
      workerOps({
        workerId: "w1",
        readinessItems: [readinessItem({ status: "checked" })],
      }),
      workerOps({
        workerId: "w2",
        readinessItems: [
          readinessItem({ status: "missing" }),
          readinessItem({ itemKey: "x", status: "checked" }),
        ],
      }),
    ];
    expect(deriveProjectReadinessRatio(workers)).toEqual({
      checked: 2,
      total: 3,
    });
  });
});

describe("4. booking overlaps mirror the accept guard (inclusive '[]' &&, accepted only)", () => {
  const band = { start: "2026-07-10", end: "2026-07-20" };

  it("the project band uses coalesce(end, start); no start date → no band", () => {
    expect(projectDateBand({ startDate: "2026-07-10", endDate: null })).toEqual(
      { start: "2026-07-10", end: "2026-07-10" },
    );
    expect(
      projectDateBand({ startDate: "2026-07-10", endDate: "2026-07-20" }),
    ).toEqual({ start: "2026-07-10", end: "2026-07-20" });
    expect(projectDateBand({ startDate: null, endDate: "2026-07-20" })).toBeNull();
  });

  it("touching edges IS an overlap; only ACCEPTED rows count; no start date never overlaps", () => {
    expect(
      bookingOverlapsBand(
        booking({ bookingId: "b1", workerId: "w1", startDate: "2026-07-20", endDate: "2026-07-25" }),
        band,
      ),
    ).toBe(true); // starts the day the band ends
    expect(
      bookingOverlapsBand(
        booking({ bookingId: "b2", workerId: "w1", startDate: "2026-07-21" }),
        band,
      ),
    ).toBe(false);
    expect(
      bookingOverlapsBand(
        booking({ bookingId: "b3", workerId: "w1", status: "proposed", startDate: "2026-07-12" }),
        band,
      ),
    ).toBe(false); // a proposal is not a commitment
    expect(
      bookingOverlapsBand(booking({ bookingId: "b4", workerId: "w1" }), band),
    ).toBe(false);
  });

  it("resource rows count overlaps per worker; no project window → 0 claims", () => {
    const workers = [workerOps({ workerId: "w1" }), workerOps({ workerId: "w2" })];
    const bookings = [
      booking({ bookingId: "b1", workerId: "w1", startDate: "2026-07-12", endDate: "2026-07-14" }),
      booking({ bookingId: "b2", workerId: "w1", startDate: "2026-08-01" }),
      booking({ bookingId: "b3", workerId: "w2", status: "proposed", startDate: "2026-07-12" }),
    ];
    const rows = deriveWorkerResources({
      workers,
      availability: new Map([
        ["w1", { availabilityStatus: "available", availableFrom: "2026-08-01" }],
      ]),
      bookings,
      project: { startDate: "2026-07-10", endDate: "2026-07-20" },
    });
    expect(rows[0].overlappingBookings).toBe(1);
    expect(rows[0].availability.availabilityStatus).toBe("available");
    // Availability never invented — missing read → nulls.
    expect(rows[1].availability).toEqual({
      availabilityStatus: null,
      availableFrom: null,
    });
    expect(rows[1].overlappingBookings).toBe(0);

    const noWindow = deriveWorkerResources({
      workers,
      availability: new Map(),
      bookings,
      project: { startDate: null, endDate: null },
    });
    expect(noWindow.every((r) => r.overlappingBookings === 0)).toBe(true);
  });
});

describe("5. attention items each trace to ONE real record", () => {
  const tasksHref = "/dashboard/tasks?project=p1";

  it("documents_needed workers, open checklist rows, overdue/blocked open tasks — nothing else", () => {
    const items = deriveAttention({
      workers: [
        workerOps({ workerId: "w1", operationalStatus: "documents_needed" }),
        workerOps({
          workerId: "w2",
          operationalStatus: "ready",
          readinessItems: [
            readinessItem({ status: "missing", label: "A1 form" }),
            readinessItem({ itemKey: "ok", status: "checked" }),
          ],
        }),
      ],
      tasks: [
        task({ id: "t1", status: "blocked" }),
        task({ id: "t2", status: "todo", dueAt: "2026-07-01T00:00:00Z" }),
        task({ id: "t3", status: "done", dueAt: "2026-07-01T00:00:00Z" }), // resolved → calm
        task({ id: "t4", status: "todo", dueAt: "2026-07-11T00:00:00Z" }), // due today ≠ overdue
      ],
      tasksHref,
      now: NOW,
    });
    expect(items.map((i) => i.kind).sort()).toEqual(
      [
        "readiness_item_open",
        "task_blocked",
        "task_overdue",
        "worker_documents_needed",
      ].sort(),
    );
    // Board-owned state anchors into the board; task state links the tasks page.
    for (const i of items) {
      expect(i.href === OPS_BOARD_ANCHOR || i.href === tasksHref).toBe(true);
    }
    const open = items.find((i) => i.kind === "readiness_item_open")!;
    expect(open.subject).toContain("A1 form");
    expect(open.href).toBe(OPS_BOARD_ANCHOR);
    expect(items.find((i) => i.kind === "task_overdue")!.href).toBe(tasksHref);
  });

  it("no records → no attention (nothing is ever invented)", () => {
    expect(
      deriveAttention({ workers: [], tasks: [], tasksHref, now: NOW }),
    ).toEqual([]);
    expect(
      deriveAttention({
        workers: [workerOps({ workerId: "w1", operationalStatus: "ready" })],
        tasks: [task({ id: "t1", status: "todo" })],
        tasksHref,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("open task list is bounded and nearest-due-first", () => {
    const tasks = [
      task({ id: "later", dueAt: "2026-08-01T00:00:00Z" }),
      task({ id: "soon", dueAt: "2026-07-12T00:00:00Z" }),
      task({ id: "undated" }),
      task({ id: "closed", status: "done", dueAt: "2026-07-01T00:00:00Z" }),
    ];
    expect(openProjectTasks(tasks).map((t) => t.id)).toEqual([
      "soon",
      "later",
      "undated",
    ]);
    expect(openProjectTasks(tasks, 1).map((t) => t.id)).toEqual(["soon"]);
    expect(OPS_CENTRE_TASK_LIST_MAX).toBeLessThanOrEqual(20);
    expect(OPS_CENTRE_ATTENTION_MAX).toBeLessThanOrEqual(50);
  });
});

describe("6. the page keeps the board AND renders the composed sections honestly", () => {
  it("keeps everything the operations page rendered before (no regression)", () => {
    expect(PAGE).toMatch(/<ConfirmPulse \/>/);
    expect(PAGE).toMatch(/<ProjectOperationsBoard\b/);
    expect(PAGE).toMatch(/<HandoverPassportPanel\b/);
    expect(PAGE).toMatch(/ops-project-tasks-link/);
    expect(PAGE).toMatch(/tTasks\("projectSection\.link"\)/);
    expect(PAGE).toMatch(/MANAGER_ROLES = new Set<Role>\(\["company", "agency"\]\)/);
  });

  it("renders the PR G sections from the composed read", () => {
    expect(PAGE).toMatch(/getOperationsCentre\(id\)/);
    expect(PAGE).toMatch(/ops-centre-header/);
    expect(PAGE).toMatch(/ops-centre-attention/);
    expect(PAGE).toMatch(/ops-centre-resources/);
    expect(PAGE).toMatch(/ops-centre-tasks/);
    expect(PAGE).toMatch(/ops-centre-evidence/);
    expect(PAGE).toMatch(/ops-centre-honest-note/);
  });

  it("status enum renders VERBATIM and counts come from the composed reads", () => {
    expect(PAGE).toMatch(/\{ops\.project\.status \?\? t\("notSet"\)\}/);
    expect(PAGE).toMatch(/ops\.counters\.totalAssigned/);
    expect(PAGE).toMatch(/readiness\.checked\}\/\{readiness\.total/);
    expect(PAGE).toMatch(/evidence\.entryCount/);
    expect(PAGE).toMatch(/evidence\.photoCount/);
  });

  it("degrades honestly while the work_tasks migration is unapplied", () => {
    expect(PAGE).toMatch(/tasks\.status === "needs-migration"/);
    expect(PAGE).toMatch(/ops-tasks-preparing/);
    expect(PAGE).toMatch(/tTasks\("unavailable"\)/);
    expect(PAGE).toMatch(/ops-centre-tasks-preparing/);
  });

  it("attention rows link where the state is resolved; the board carries the anchor", () => {
    expect(PAGE).toMatch(/ops-attention-empty/);
    expect(PAGE).toMatch(/OPS_BOARD_ANCHOR\.slice\(1\)/);
    expect(PAGE).toMatch(/\/dashboard\/tasks\?project=\$\{id\}/);
    expect(MODEL).toMatch(/OPS_BOARD_ANCHOR = "#ops-workers"/);
  });

  it("evidence links the real gallery surface (project page), which exists on disk", () => {
    expect(PAGE).toMatch(/ops-evidence-gallery-link/);
    expect(PAGE).toMatch(/\/dashboard\/projects\/\$\{id\}/);
    expect(
      existsSync(
        join(ROOT, "app", "[locale]", "dashboard", "projects", "[id]", "page.tsx"),
      ),
    ).toBe(true);
  });

  it("server component — no client state, no drag, no fetch", () => {
    const code = stripComments(PAGE);
    expect(code).not.toMatch(/"use client"/);
    expect(code).not.toMatch(/useState|useTransition|useEffect/);
    expect(code).not.toMatch(/draggable|onDragStart|onDrop/);
  });
});

describe("7. registered everywhere a module must be", () => {
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

  it("module registry: projects → /dashboard/projects, grid+command, ORG roles, briefcase icon", () => {
    const m = getDashboardModule("projects");
    expect(getModuleRoute("projects")).toBe("/dashboard/projects");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    // Never a nav tab — the primary nav stays catalogue-derived.
    expect(m.surfaces).not.toContain("nav");
    expect([...m.roles].sort()).toEqual(["agency", "company"].sort());
    expect(m.iconKey).toBe("briefcase");
    // No attention signal exists for projects — no badge is fabricated.
    expect(m.attentionSignalIds).toBeUndefined();
    // Labels reuse the projects page's own copy (no parallel copy source).
    expect(m.labelKey).toBe("projects.title");
    expect(m.descriptionKey).toBe("projects.intro");
  });

  it("org grids carry the projects module; worker/customer grids do not", () => {
    const grid = (role: "worker" | "company" | "agency" | "customer") =>
      buildControlRoomViewModel({ role, counts: ZERO, hasCompany: role !== "worker" })
        .modules.map((m) => m.id);
    expect(grid("company")).toContain("projects");
    expect(grid("agency")).toContain("projects");
    expect(grid("worker")).not.toContain("projects");
    expect(grid("customer")).not.toContain("projects");
  });

  it("primary-route smoke inventory carries /dashboard/projects (id-routes stay excluded)", () => {
    const entry = PRIMARY_ROUTES.find(
      (r) => r.urlPattern === "/dashboard/projects",
    );
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe("app/[locale]/dashboard/projects/page.tsx");
    expect(entry!.requiresAuth).toBe(true);
    expect(
      PRIMARY_ROUTES.some((r) => r.urlPattern.startsWith("/dashboard/projects/")),
    ).toBe(false);
  });

  it("every command entry destined for projects resolves through getModuleRoute (route-drift killer)", () => {
    for (const id of ["objects_projects", "work_gallery", "follow_up"]) {
      const entry = COMMAND_REGISTRY.find((e) => e.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry!.route, id).toBe(getModuleRoute("projects"));
      for (const loc of activeLocales) {
        expect(entry!.labels[loc]?.trim().length, `${id} label ${loc}`).toBeGreaterThan(0);
      }
    }
  });

  it("the grid icon map carries the briefcase icon", () => {
    const grid = read("components/app/dashboard/dashboard-module-grid.tsx");
    expect(grid).toMatch(/briefcase: Briefcase/);
  });

  it("exactly one module owns each surface route (no duplicate doors)", () => {
    const surfaceRoutes = DASHBOARD_MODULES.filter((m) => m.surfaceRoute).map(
      (m) => m.surfaceRoute,
    );
    expect(new Set(surfaceRoutes).size).toBe(surfaceRoutes.length);
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

  const KEYS = [
    "projectOps.centre.summaryTitle",
    "projectOps.centre.datesLabel",
    "projectOps.centre.openTasksLabel",
    "projectOps.centre.tasksPreparingShort",
    "projectOps.centre.readinessLabel",
    "projectOps.centre.readinessNone",
    "projectOps.centre.housingLabel",
    "projectOps.centre.housingYes",
    "projectOps.centre.housingNo",
    "projectOps.centre.housingUnknown",
    "projectOps.centre.attention.title",
    "projectOps.centre.attention.empty",
    "projectOps.centre.attention.note",
    "projectOps.centre.attention.kind.worker_documents_needed",
    "projectOps.centre.attention.kind.readiness_item_open",
    "projectOps.centre.attention.kind.task_overdue",
    "projectOps.centre.attention.kind.task_blocked",
    "projectOps.centre.resources.title",
    "projectOps.centre.resources.checklistLabel",
    "projectOps.centre.resources.availabilityLabel",
    "projectOps.centre.resources.availableFromLabel",
    "projectOps.centre.resources.notRecorded",
    "projectOps.centre.resources.noWindow",
    "projectOps.centre.resources.bookingConflict",
    "projectOps.centre.resources.noConflict",
    "projectOps.centre.resources.note",
    "projectOps.centre.tasksTitle",
    "projectOps.centre.tasksEmpty",
    "projectOps.centre.evidence.title",
    "projectOps.centre.evidence.entriesLabel",
    "projectOps.centre.evidence.photosLabel",
    "projectOps.centre.evidence.note",
    "projectOps.centre.evidence.link",
    "projectOps.centre.honestNote",
    // The module card's reused copy.
    "projects.title",
    "projects.intro",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: full operations-centre catalogue`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of KEYS) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
    });
  }

  it("the booking-conflict copy is an ICU plural over the real count in every active locale", () => {
    for (const loc of activeLocales) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        projectOps: { centre: { resources: { bookingConflict: string } } };
      };
      expect(msgs.projectOps.centre.resources.bookingConflict).toMatch(
        /\{n, plural,/,
      );
    }
  });
});
