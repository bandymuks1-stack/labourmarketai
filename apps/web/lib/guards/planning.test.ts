import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import {
  PLANNING_PROJECT_READ_LIMIT,
  PLANNING_SOURCE_TYPES,
  PLANNING_WEEK_STRIP_DAYS,
  addDays,
  addMonths,
  buildAgenda,
  buildMonthGrid,
  buildWeekView,
  buildYearOverview,
  conflictItemIds,
  detectConflicts,
  effectiveEndDay,
  hrefForSource,
  isConflictEligible,
  itemsForDay,
  navAnchors,
  parseIsoDay,
  rangesOverlapInclusive,
  startOfWeekMonday,
  statusKeyForSource,
  toIsoDay,
  visibleRange,
  type PlanningItem,
} from "@/lib/planning/planning-model";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * UNIFIED PLANNING guards (control room PR E, capability gap map §4).
 *
 * The planning surface is an AGGREGATION, not a new data store. These pins
 * keep it honest:
 *
 *   - READ-ONLY COMPOSITION of existing RLS-scoped reads: the only direct
 *     table read in the planning layer is the `projects` table the project
 *     libs already read (bookings/tasks arrive through their own services);
 *     never the admin client, never a write, never an RPC.
 *   - REAL SOURCES ONLY: exactly booking / project / task. Availability
 *     windows, milestones and CRM follow-ups do not exist in the product
 *     yet and must not be simulated here.
 *   - REAL LINKS ONLY: every item href goes to a registered launch surface
 *     (bookings page, project detail page, tasks page).
 *   - REAL CONFLICTS ONLY: the overlap logic mirrors the booking accept
 *     guard (inclusive daterange '[]' && — touching edges overlap) and only
 *     the caller's own accepted bookings / own project assignments compete.
 *   - HONEST degradation per source, calm empty state, no calendar
 *     dependency, no external-calendar claim.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const MODEL = read("lib/planning/planning-model.ts");
const COMPOSE = read("lib/planning/planning.ts");
const PAGE_REL = "app/[locale]/dashboard/planning/page.tsx";
const PAGE = read(PAGE_REL);
const PLANNING_LAYER = [MODEL, COMPOSE, PAGE];

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Minimal real-shaped item factory for the pure-function tests. */
function item(
  over: Partial<PlanningItem> & { readonly id: string },
): PlanningItem {
  return {
    sourceType: "booking",
    sourceId: over.id,
    label: null,
    detail: null,
    startDate: null,
    endDate: null,
    status: "accepted",
    statusKey: "bookings.status.accepted",
    href: "/dashboard/bookings",
    roleContext: "incoming",
    ...over,
  };
}

const NOW = new Date("2026-07-11T10:00:00Z"); // today = 2026-07-11 (UTC)

describe("1. read-only composition of existing RLS-scoped reads", () => {
  it("uses the caller-scoped server client, never the admin client", () => {
    expect(COMPOSE).toMatch(/from "@\/lib\/supabase\/server"/);
    for (const src of PLANNING_LAYER) {
      expect(src).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    }
  });

  it("reuses the existing source services (no duplicated source queries)", () => {
    expect(COMPOSE).toMatch(
      /import \{ listMyBookings \} from "@\/lib\/booking\/booking-actions"/,
    );
    expect(COMPOSE).toMatch(
      /import \{ callerCompanyId \} from "@\/lib\/projects\/projects"/,
    );
    expect(COMPOSE).toMatch(/import \{ listMyTasks \} from "@\/lib\/tasks\/tasks"/);
  });

  it("direct table reads are the known bounded set (projects/orgs/workers/journal)", () => {
    const froms = [...COMPOSE.matchAll(/\.from\("([a-z0-9_]+)"\)/g)].map(
      (m) => m[1],
    );
    // projects (the table the project libs already read), organizations
    // (owned-org scope), workers (own worker id) and journal_entries (own
    // dated facts) — every read RLS-scoped and bounded.
    expect(new Set(froms)).toEqual(
      new Set(["projects", "organizations", "workers", "journal_entries"]),
    );
    expect(COMPOSE).toMatch(/\.limit\(PLANNING_PROJECT_READ_LIMIT\)/);
    expect(COMPOSE).toMatch(/\.limit\(PLANNING_JOURNAL_READ_LIMIT\)/);
    expect(PLANNING_PROJECT_READ_LIMIT).toBeLessThanOrEqual(200);
    // Journal facts: own worker only, soft-deleted and superseded excluded.
    expect(COMPOSE).toMatch(/\.is\("deleted_at", null\)/);
    expect(COMPOSE).toMatch(/\.is\("superseded_by", null\)/);
    expect(COMPOSE).toMatch(/\.eq\("worker_id", workerRes\.data\.id\)/);
    // The model and the page touch no table at all.
    expect(MODEL).not.toMatch(/\.from\(/);
    expect(PAGE).not.toMatch(/\.from\(/);
  });

  it("read-only: no write verb and no RPC anywhere in the planning layer", () => {
    for (const src of PLANNING_LAYER) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
  });

  it("no external transport — planning contacts nobody", () => {
    for (const src of PLANNING_LAYER) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });
});

describe("2. every item href is a real registered route", () => {
  it("booking and task items link their registered list surfaces", () => {
    const smokeRoutes = new Set(PRIMARY_ROUTES.map((r) => r.urlPattern));
    expect(hrefForSource("booking", "x")).toBe("/dashboard/bookings");
    expect(smokeRoutes.has("/dashboard/bookings")).toBe(true);
    expect(hrefForSource("task", "x")).toBe("/dashboard/tasks");
    expect(smokeRoutes.has("/dashboard/tasks")).toBe(true);
  });

  it("project items link the real project detail route (page exists on disk)", () => {
    expect(hrefForSource("project", "abc")).toBe("/dashboard/projects/abc");
    expect(
      existsSync(
        join(ROOT, "app", "[locale]", "dashboard", "projects", "[id]", "page.tsx"),
      ),
    ).toBe(true);
  });

  it("status labels reuse each source's own copy (one naming source)", () => {
    expect(statusKeyForSource("booking", "accepted")).toBe(
      "bookings.status.accepted",
    );
    expect(statusKeyForSource("task", "todo")).toBe("tasks.status.todo");
    expect(statusKeyForSource("project", "live")).toBe(
      "planning.projectStatus.live",
    );
  });
});

describe("3. conflict semantics mirror the booking accept guard (inclusive '[]' &&)", () => {
  it("touching edges IS an overlap; disjoint days are not", () => {
    // daterange(a, coalesce(aEnd, a), '[]') && daterange(b, ..., '[]')
    expect(
      rangesOverlapInclusive("2026-07-01", "2026-07-10", "2026-07-10", "2026-07-20"),
    ).toBe(true); // one ends the day the other starts
    expect(
      rangesOverlapInclusive("2026-07-01", "2026-07-09", "2026-07-10", "2026-07-20"),
    ).toBe(false);
    expect(
      rangesOverlapInclusive("2026-07-05", "2026-07-05", "2026-07-01", "2026-07-31"),
    ).toBe(true); // single-day range inside a band
  });

  it("a missing end collapses to the start day — coalesce(end, start)", () => {
    expect(
      effectiveEndDay({ startDate: "2026-07-10", endDate: null }),
    ).toBe("2026-07-10");
    expect(
      effectiveEndDay({ startDate: "2026-07-10", endDate: "2026-07-12" }),
    ).toBe("2026-07-12");
    expect(effectiveEndDay({ startDate: null, endDate: "2026-07-12" })).toBeNull();
  });

  it("only the caller's own commitments are eligible: accepted incoming bookings + assigned projects", () => {
    expect(
      isConflictEligible(
        item({ id: "b1", startDate: "2026-07-10", status: "accepted", roleContext: "incoming" }),
      ),
    ).toBe(true);
    expect(
      isConflictEligible(
        item({
          id: "p1",
          sourceType: "project",
          startDate: "2026-07-10",
          status: "live",
          roleContext: "assigned",
        }),
      ),
    ).toBe(true);
    // Proposals are not commitments yet.
    expect(
      isConflictEligible(item({ id: "b2", startDate: "2026-07-10", status: "proposed" })),
    ).toBe(false);
    // Outgoing accepted rows belong to DIFFERENT workers — no shared axis.
    expect(
      isConflictEligible(
        item({ id: "b3", startDate: "2026-07-10", status: "accepted", roleContext: "outgoing" }),
      ),
    ).toBe(false);
    // Managed date bands are org context, not a personal schedule.
    expect(
      isConflictEligible(
        item({
          id: "p2",
          sourceType: "project",
          startDate: "2026-07-10",
          status: "live",
          roleContext: "managed",
        }),
      ),
    ).toBe(false);
    // Tasks and undated records never conflict.
    expect(
      isConflictEligible(
        item({ id: "t1", sourceType: "task", startDate: "2026-07-10", status: "todo", roleContext: "mine" }),
      ),
    ).toBe(false);
    expect(
      isConflictEligible(item({ id: "b4", startDate: null, status: "accepted" })),
    ).toBe(false);
  });

  it("detectConflicts flags only REAL overlapping records, each pair once", () => {
    const a = item({ id: "booking:a", startDate: "2026-07-10", endDate: "2026-07-15" });
    const b = item({ id: "booking:b", startDate: "2026-07-15", endDate: "2026-07-20" }); // touches a
    const c = item({ id: "booking:c", startDate: "2026-08-01", endDate: null }); // disjoint
    const d = item({ id: "booking:d", startDate: "2026-07-12", status: "proposed" }); // ineligible
    const conflicts = detectConflicts([a, b, c, d]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      aId: "booking:a",
      bId: "booking:b",
      overlapStart: "2026-07-15",
    });
    expect([...conflictItemIds(conflicts)].sort()).toEqual([
      "booking:a",
      "booking:b",
    ]);
    // No records → no conflicts. Nothing is ever invented.
    expect(detectConflicts([])).toEqual([]);
    expect(detectConflicts([c, d])).toEqual([]);
  });
});

describe("4. the agenda is pure, forward-looking date math", () => {
  const ongoing = item({ id: "booking:ongoing", startDate: "2026-07-01", endDate: "2026-07-20" });
  const future = item({ id: "booking:future", startDate: "2026-07-14", status: "proposed" });
  const far = item({ id: "booking:far", startDate: "2026-09-01", status: "proposed" });
  const undated = item({ id: "booking:undated", status: "proposed" });
  const past = item({ id: "booking:past", startDate: "2026-06-01", endDate: "2026-06-10" });

  const agenda = buildAgenda([ongoing, future, far, undated, past], NOW);

  it("ongoing → today; future → its start day; beyond the window → later; no date → undated; finished → counted, not listed", () => {
    expect(agenda.days.map((d) => d.day)).toEqual(["2026-07-11", "2026-07-14"]);
    expect(agenda.days[0].isToday).toBe(true);
    expect(agenda.days[0].items.map((i) => i.id)).toEqual(["booking:ongoing"]);
    expect(agenda.days[1].items.map((i) => i.id)).toEqual(["booking:future"]);
    expect(agenda.later.map((i) => i.id)).toEqual(["booking:far"]);
    expect(agenda.undated.map((i) => i.id)).toEqual(["booking:undated"]);
    expect(agenda.pastCount).toBe(1);
  });

  it("the week strip is seven cells of real coverage counts", () => {
    expect(agenda.weekStrip).toHaveLength(PLANNING_WEEK_STRIP_DAYS);
    expect(agenda.weekStrip[0]).toMatchObject({ day: "2026-07-11", isToday: true, count: 1 });
    // 2026-07-14: the ongoing band AND the future single-day proposal.
    const d14 = agenda.weekStrip.find((d) => d.day === "2026-07-14");
    expect(d14?.count).toBe(2);
    expect(addDays("2026-07-11", 3)).toBe("2026-07-14");
  });

  it("toIsoDay normalizes dates and never yields NaN", () => {
    expect(toIsoDay("2026-07-11")).toBe("2026-07-11");
    expect(toIsoDay("2026-07-11T15:30:00Z")).toBe("2026-07-11");
    expect(toIsoDay("not-a-date")).toBeNull();
    expect(toIsoDay(null)).toBeNull();
  });

  it("conflicts are computed across the whole non-past set (window cannot hide them)", () => {
    const lateA = item({ id: "booking:lateA", startDate: "2026-09-01", endDate: "2026-09-10" });
    const lateB = item({ id: "booking:lateB", startDate: "2026-09-05", endDate: "2026-09-15" });
    const a2 = buildAgenda([lateA, lateB], NOW);
    expect(a2.later).toHaveLength(2);
    expect(a2.conflicts).toHaveLength(1);
    expect(a2.conflictIds.has("booking:lateA")).toBe(true);
  });
});

describe("5. real sources only — nothing that does not exist is simulated", () => {
  it("exactly booking / project / task / journal (plan sources + the fact source)", () => {
    expect([...PLANNING_SOURCE_TYPES]).toEqual([
      "booking",
      "project",
      "task",
      "journal",
    ]);
  });

  it("no availability/milestone/CRM source is faked in the planning layer", () => {
    for (const src of PLANNING_LAYER.map(stripComments)) {
      expect(src).not.toMatch(/availability|milestone|crm|follow[_-]?up/i);
    }
  });

  it("the copy claims no external calendar or sync", () => {
    const en = JSON.parse(read("messages/en.json")).planning;
    const blob = JSON.stringify(en).toLowerCase();
    expect(blob).not.toMatch(/\bsynced\b|\bsyncs\b|google|outlook|\bical\b/);
    expect(blob).not.toMatch(/milestone|availability window/);
  });

  it("no calendar / drag-and-drop dependency entered the app", () => {
    const pkg = read("package.json");
    expect(pkg).not.toMatch(
      /fullcalendar|react-big-calendar|react-day-picker|dnd-kit|react-beautiful-dnd|sortablejs|\bdayjs\b|date-fns|luxon|moment/i,
    );
  });
});

describe("6. registered everywhere a module must be", () => {
  it("module registry: planning → /dashboard/planning, grid+command, ALL roles, calendar icon", () => {
    const m = getDashboardModule("planning");
    expect(getModuleRoute("planning")).toBe("/dashboard/planning");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    // Never a nav tab — the primary nav stays catalogue-derived.
    expect(m.surfaces).not.toContain("nav");
    expect([...m.roles].sort()).toEqual(
      ["agency", "company", "customer", "worker"].sort(),
    );
    expect(m.iconKey).toBe("calendar");
    // NO attention signals: the booking/task signals already badge their own
    // modules — a planning badge would double-count the same numbers.
    expect(m.attentionSignalIds).toBeUndefined();
  });

  it("bookings hands the planning label to the planning module and speaks its own name", () => {
    const bookings = getDashboardModule("bookings");
    const planning = getDashboardModule("planning");
    expect(planning.labelKey).toBe("auth.dashboard.myZone.actions.planning.title");
    expect(bookings.labelKey).toBe("auth.dashboard.myZone.actions.bookings.title");
    expect(bookings.labelKey).not.toBe(planning.labelKey);
    expect(bookings.iconKey).not.toBe(planning.iconKey);
  });

  it("the grid icon map carries both icons", () => {
    const grid = read("components/app/dashboard/dashboard-module-grid.tsx");
    expect(grid).toMatch(/calendar: CalendarDays/);
    expect(grid).toMatch(/handshake: Handshake/);
  });

  it("primary-route smoke inventory carries /dashboard/planning", () => {
    const entry = PRIMARY_ROUTES.find(
      (r) => r.urlPattern === "/dashboard/planning",
    );
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe(PAGE_REL);
    expect(entry!.requiresAuth).toBe(true);
    expect(existsSync(join(ROOT, PAGE_REL))).toBe(true);
  });

  it("command registry: planning + bookings entries resolve through getModuleRoute with 5-locale copy", () => {
    const planning = COMMAND_REGISTRY.find((e) => e.id === "planning");
    expect(planning).toBeTruthy();
    expect(planning!.route).toBe(getModuleRoute("planning"));
    expect(planning!.audience).toBe("public");
    const bookings = COMMAND_REGISTRY.find((e) => e.id === "bookings");
    expect(bookings!.route).toBe(getModuleRoute("bookings"));
    for (const entry of [planning!, bookings!]) {
      for (const loc of activeLocales) {
        expect(entry.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(0);
        expect(entry.synonyms[loc]?.length, `synonyms ${loc}`).toBeGreaterThan(0);
      }
    }
  });

  it("exactly one module owns each surface route (no duplicate doors)", () => {
    const surfaceRoutes = DASHBOARD_MODULES.filter((m) => m.surfaceRoute).map(
      (m) => m.surfaceRoute,
    );
    expect(new Set(surfaceRoutes).size).toBe(surfaceRoutes.length);
  });

  it("the bookings page bridges to planning (navigation only)", () => {
    const bookingsPage = read("app/[locale]/dashboard/bookings/page.tsx");
    expect(bookingsPage).toContain('"/dashboard/planning"');
    expect(bookingsPage).toMatch(/connections\.planning/);
  });
});

describe("7. the page is an honest server-rendered agenda", () => {
  it("server component with searchParams filter links (no client state, no drag)", () => {
    const code = stripComments(PAGE);
    expect(code).not.toMatch(/"use client"/);
    expect(code).not.toMatch(/useTransition|startTransition|useState/);
    expect(code).not.toMatch(/draggable|onDragStart|onDrop/);
    expect(PAGE).toMatch(/searchParams/);
    expect(PAGE).toMatch(/planning-filter-all/);
    expect(PAGE).toMatch(/isPlanningSourceType/);
  });

  it("renders the per-source honest degradation notes", () => {
    expect(PAGE).toMatch(/planning-source-note-booking/);
    expect(PAGE).toMatch(/planning-source-note-task/);
    expect(PAGE).toMatch(/planning-source-note-project/);
    expect(PAGE).toMatch(/sourceNotes\./);
    // The composition maps each source to an independent honest state.
    expect(COMPOSE).toMatch(/"unavailable"/);
    expect(COMPOSE).toMatch(/"managers-only"/);
    expect(COMPOSE).toMatch(/"error"/);
  });

  it("renders the calm empty state with REAL next actions and the conflict flag", () => {
    expect(PAGE).toMatch(/planning-empty/);
    expect(PAGE).toMatch(/t\("empty"\)/);
    expect(PAGE).toMatch(/planning-conflict-/);
    expect(PAGE).toMatch(/conflict\.flag/);
    // Empty-state CTAs are live routes, not dead ends.
    expect(PAGE).toMatch(/planning-empty-cta-bookings/);
    expect(PAGE).toMatch(/planning-empty-cta-tasks/);
    expect(PAGE).toMatch(/planning-empty-cta-journal/);
    // The technical honest-scope explainer was removed (area E): the page
    // shows records, not a paragraph about what the page is built from.
    expect(PAGE).not.toMatch(/honestNote/);
  });

  it("every row links its real source object through the shared Link", () => {
    expect(PAGE).toMatch(/href=\{item\.href as "\/dashboard"\}/);
    expect(PAGE).toMatch(/from "@\/lib\/i18n\/navigation"/);
  });
});

describe("9. calendar views are pure UTC date math (area C)", () => {
  it("parseIsoDay accepts only real calendar days", () => {
    expect(parseIsoDay("2026-07-12")).toBe("2026-07-12");
    expect(parseIsoDay("2026-02-31")).toBeNull(); // impossible date
    expect(parseIsoDay("2026-7-1")).toBeNull();
    expect(parseIsoDay("junk")).toBeNull();
    expect(parseIsoDay(undefined)).toBeNull();
  });

  it("weeks start Monday; month math clamps to real month ends", () => {
    expect(startOfWeekMonday("2026-07-12")).toBe("2026-07-06"); // Sunday → its Monday
    expect(startOfWeekMonday("2026-07-06")).toBe("2026-07-06"); // Monday stays
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"); // clamped
    expect(addMonths("2026-03-15", -1)).toBe("2026-02-15");
    expect(addMonths("2026-12-05", 1)).toBe("2027-01-05"); // year rollover
  });

  it("the month grid covers the whole month in full Mon–Sun rows", () => {
    const grid = buildMonthGrid("2026-07-12", [], "2026-07-12");
    expect(grid.month).toBe("2026-07");
    expect(grid.weeks.length).toBeGreaterThanOrEqual(4);
    expect(grid.weeks.length).toBeLessThanOrEqual(6);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    const days = grid.weeks.flat();
    // Every July day is present exactly once and marked inMonth.
    const july = days.filter((c) => c.inMonth);
    expect(july).toHaveLength(31);
    expect(days[0].day <= "2026-07-01").toBe(true);
    expect(days[days.length - 1].day >= "2026-07-31").toBe(true);
    // Today flag lands on the anchor's real day only.
    expect(days.filter((c) => c.isToday).map((c) => c.day)).toEqual(["2026-07-12"]);
  });

  it("month cells carry real coverage counts (bands span days)", () => {
    const band = item({ id: "booking:band", startDate: "2026-07-10", endDate: "2026-07-12" });
    const grid = buildMonthGrid("2026-07-01", [band], "2026-07-01");
    const byDay = new Map(grid.weeks.flat().map((c) => [c.day, c.count]));
    expect(byDay.get("2026-07-09")).toBe(0);
    expect(byDay.get("2026-07-10")).toBe(1);
    expect(byDay.get("2026-07-11")).toBe(1);
    expect(byDay.get("2026-07-12")).toBe(1);
    expect(byDay.get("2026-07-13")).toBe(0);
  });

  it("week view = 7 Monday-started days; day items are deterministic", () => {
    const single = item({ id: "booking:one", startDate: "2026-07-08" });
    const week = buildWeekView("2026-07-12", [single], "2026-07-12");
    expect(week).toHaveLength(7);
    expect(week[0].day).toBe("2026-07-06");
    expect(week[6].day).toBe("2026-07-12");
    expect(week.find((d) => d.day === "2026-07-08")?.items.map((i) => i.id)).toEqual([
      "booking:one",
    ]);
    expect(itemsForDay([single], "2026-07-08").map((i) => i.id)).toEqual(["booking:one"]);
    expect(itemsForDay([single], "2026-07-09")).toEqual([]);
  });

  it("year overview counts month intersections once per item", () => {
    const spanning = item({
      id: "project:span",
      sourceType: "project",
      startDate: "2026-06-20",
      endDate: "2026-08-05",
      status: "live",
      roleContext: "managed",
    });
    const year = buildYearOverview(2026, [spanning], "2026-07-12");
    expect(year).toHaveLength(12);
    const counts = new Map(year.map((m) => [m.month, m.count]));
    expect(counts.get("2026-05")).toBe(0);
    expect(counts.get("2026-06")).toBe(1);
    expect(counts.get("2026-07")).toBe(1);
    expect(counts.get("2026-08")).toBe(1);
    expect(counts.get("2026-09")).toBe(0);
    expect(year.find((m) => m.isCurrent)?.month).toBe("2026-07");
  });

  it("prev/next anchors move by the view's own period", () => {
    expect(navAnchors("day", "2026-07-12")).toEqual({ prev: "2026-07-11", next: "2026-07-13" });
    expect(navAnchors("week", "2026-07-12")).toEqual({ prev: "2026-07-05", next: "2026-07-19" });
    expect(navAnchors("month", "2026-07-12")).toEqual({ prev: "2026-06-12", next: "2026-08-12" });
    expect(navAnchors("year", "2026-07-12")).toEqual({ prev: "2025-07-12", next: "2027-07-12" });
  });

  it("visibleRange drives the bounded fact read per view", () => {
    expect(visibleRange("day", "2026-07-12")).toEqual({ start: "2026-07-12", end: "2026-07-12" });
    expect(visibleRange("week", "2026-07-12")).toEqual({ start: "2026-07-06", end: "2026-07-12" });
    expect(visibleRange("year", "2026-07-12")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    const month = visibleRange("month", "2026-07-12");
    expect(month.start).toBe("2026-06-29"); // Monday before July 1
    expect(month.end >= "2026-07-31").toBe(true);
  });

  it("journal events deep-link to the entry's own editor (source stays canonical)", () => {
    expect(hrefForSource("journal", "e1")).toBe(
      "/dashboard/journal?editing=e1#journal-composer",
    );
    expect(statusKeyForSource("journal", "recorded")).toBe(
      "planning.journalStatus.recorded",
    );
    // Journal facts never join conflict detection (facts don't conflict).
    expect(
      isConflictEligible(
        item({ id: "journal:x", sourceType: "journal", startDate: "2026-07-10", status: "recorded", roleContext: "mine" }),
      ),
    ).toBe(false);
  });

  it("the page renders every view shell + the date navigation", () => {
    for (const marker of [
      "planning-views",
      "planning-view-${v}", // per-view switcher chips (template literal)
      "planning-date-nav",
      "planning-nav-today",
      "planning-date-picker",
      "planning-month",
      "planning-week-view",
      "planning-day-view",
      "planning-year-view",
      "planning-period-label",
    ]) {
      expect(PAGE).toContain(marker);
    }
    expect(PAGE).toMatch(/type="date"/);
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
    "planning.eyebrow",
    "planning.title",
    "planning.intro",
    "planning.notAuthed",
    "planning.filters.label",
    "planning.filters.all",
    "planning.source.booking",
    "planning.source.project",
    "planning.source.task",
    "planning.source.journal",
    "planning.sourceNotes.bookingUnavailable",
    "planning.sourceNotes.taskUnavailable",
    "planning.sourceNotes.taskError",
    "planning.sourceNotes.projectManagersOnly",
    "planning.sourceNotes.projectError",
    "planning.sourceNotes.journalError",
    "planning.week.label",
    "planning.today",
    "planning.later.title",
    "planning.undated.title",
    "planning.undated.hint",
    "planning.empty",
    "planning.emptyFiltered",
    "planning.emptyActions.bookings",
    "planning.emptyActions.tasks",
    "planning.emptyActions.journal",
    "planning.pastHidden",
    "planning.conflict.flag",
    "planning.context.incoming",
    "planning.context.outgoing",
    "planning.context.managed",
    "planning.context.assigned",
    "planning.context.mine",
    "planning.fallback.booking",
    "planning.fallback.project",
    "planning.fallback.task",
    "planning.fallback.journal",
    "planning.projectStatus.draft",
    "planning.projectStatus.live",
    "planning.projectStatus.paused",
    "planning.journalStatus.recorded",
    "planning.views.label",
    "planning.views.agenda",
    "planning.views.day",
    "planning.views.week",
    "planning.views.month",
    "planning.views.year",
    "planning.nav.today",
    "planning.nav.prev",
    "planning.nav.next",
    "planning.nav.dateLabel",
    "planning.nav.go",
    "planning.month.hint",
    "planning.day.empty",
    "planning.year.count",
    // The re-pointed module labels.
    "auth.dashboard.myZone.actions.planning.title",
    "auth.dashboard.myZone.actions.planning.desc",
    "auth.dashboard.myZone.actions.bookings.title",
    "auth.dashboard.myZone.actions.bookings.desc",
    // The bookings-page bridge copy.
    "bookings.connections.planning",
    "bookings.connections.planningNote",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: full planning catalogue`, () => {
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
});
