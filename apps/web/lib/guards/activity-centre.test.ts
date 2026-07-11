import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACTIVITY_SOURCE_MODULE_IDS,
  buildActivityRows,
  filterActivityRows,
  moduleForSignal,
} from "@/lib/dashboard/activity-centre";
import {
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import {
  SPINE_SIGNALS,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Unified activity centre guard (control room PR C).
 *
 * /dashboard/activity is the ONE cross-module attention surface. This guard
 * pins its honesty contract:
 *
 *  1. the notification spine is the SINGLE source — the page issues exactly
 *     one request-cached getSpineCounts() read and never imports a supabase
 *     client or a per-surface count helper of its own;
 *  2. every rendered signal links its REAL clearing surface (the catalogue
 *     href) and carries the spine's real count — never a parallel number;
 *  3. there is NO fake "mark read" control — visiting the surface is the
 *     read event, so the page is links-only by design;
 *  4. the route is registered (module registry + command registry +
 *     primary-route smoke inventory) and every copy key resolves in every
 *     ACTIVE locale.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const PAGE_REL = "app/[locale]/dashboard/activity/page.tsx";
const PAGE = read(PAGE_REL);

const ZERO: SpineCounts = {
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  pendingInvitations: 0,
};

describe("1. the spine is the page's ONLY data source", () => {
  it("the page exists and is a server component", () => {
    expect(existsSync(join(ROOT, PAGE_REL))).toBe(true);
    expect(PAGE).not.toMatch(/"use client"/);
  });

  it("exactly one request-cached spine read — no extra count queries", () => {
    // Strip comments first — the honest doc comment NAMES the helper without
    // being a call site (same convention as the module-registry guard).
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(
      /(^|[^:])\/\/[^\n]*/g,
      "$1",
    );
    expect((code.match(/getSpineCounts\(\)/g) ?? []).length).toBe(1);
    expect(code).toMatch(/await getSpineCounts\(\)/);
  });

  it("no supabase client and no per-surface count helper in the page", () => {
    expect(PAGE).not.toMatch(/@\/lib\/supabase/);
    expect(PAGE).not.toMatch(
      /getUnreadConversationCount|getPendingIncoming|getServiceRequestsNewCounts|getBookingResponsesNewCount|listMyPendingWorkerInvitations/,
    );
  });

  it("rows are built and filtered through the pure view model only", () => {
    expect(PAGE).toMatch(/buildActivityRows\(counts\)/);
    expect(PAGE).toMatch(/filterActivityRows\(/);
    expect(PAGE).toMatch(/href=\{row\.href as "\/dashboard"\}/);
  });

  it("the view model covers the WHOLE spine catalogue and nothing else", () => {
    const rows = buildActivityRows(ZERO);
    expect(rows.map((r) => r.id)).toEqual(SPINE_SIGNALS.map((s) => s.id));
  });

  it("deliberately unlisted: demand/verification events have no seen-model (gap map §2)", () => {
    // The activity centre must not invent signals the spine cannot clear.
    expect(PAGE).not.toMatch(/demand_interest|verification_event|not yet wired/i);
    const model = read("lib/dashboard/activity-centre.ts");
    expect(model).not.toMatch(/demand_interest_signals/);
  });
});

describe("2. every rendered signal links its real clearing surface", () => {
  it("row href / type / count come 1:1 from the spine catalogue", () => {
    const counts: SpineCounts = {
      unreadConversations: 1,
      pendingIncomingServiceRequests: 2,
      serviceRequestResponsesNew: 3,
      pendingIncomingBookings: 4,
      bookingResponsesNew: 5,
      pendingInvitations: 6,
    };
    const rows = buildActivityRows(counts);
    for (const row of rows) {
      const signal = SPINE_SIGNALS.find((s) => s.id === row.id)!;
      expect(row.href, row.id).toBe(signal.href);
      expect(row.typeKey, row.id).toBe(signal.type);
      expect(row.count, row.id).toBe(signal.count(counts));
    }
  });

  it("every spine signal resolves to a registry source module (label reuse, no duplicate copy)", () => {
    for (const s of SPINE_SIGNALS) {
      const m = moduleForSignal(s.id);
      expect(m, `signal ${s.id} must map to a source module`).toBeTruthy();
      expect(m!.labelKey.trim().length).toBeGreaterThan(0);
    }
  });

  it("the module filter chips cover every source module the spine references", () => {
    const expected = new Set(
      SPINE_SIGNALS.map((s) => moduleForSignal(s.id)!.id),
    );
    expect(new Set(ACTIVITY_SOURCE_MODULE_IDS)).toEqual(expected);
  });

  it("attention filter is count-gated exactly like the bell; 'all' keeps honest zeros", () => {
    const rows = buildActivityRows({ ...ZERO, pendingInvitations: 2 });
    const attention = filterActivityRows(rows, {
      moduleId: null,
      state: "attention",
    });
    expect(attention.map((r) => r.id)).toEqual(["pending-invitations"]);
    const all = filterActivityRows(rows, { moduleId: null, state: "all" });
    expect(all).toHaveLength(SPINE_SIGNALS.length);
    const booking = filterActivityRows(rows, {
      moduleId: "bookings",
      state: "all",
    });
    expect(booking.every((r) => r.moduleId === "bookings")).toBe(true);
    expect(booking.length).toBeGreaterThan(0);
  });
});

describe("3. no fake mark-read control", () => {
  it("the page renders links only — no button, no mark-read claim", () => {
    // Visiting the clearing surface IS the read event (spine doctrine). A
    // control claiming to mark signals read here would be a lie the next
    // page-load reverts — so the page may not render ANY button.
    expect(PAGE).not.toMatch(/<button/i);
    expect(PAGE).not.toMatch(/markAllRead|markRead|mark_read|markSeen/);
  });

  it("the honest read-model note is part of the page", () => {
    expect(PAGE).toMatch(/activity-read-model-note/);
    expect(PAGE).toMatch(/tA\("readModel"\)/);
  });

  it("a calm all-clear state exists for the nothing-pending case", () => {
    expect(PAGE).toMatch(/activity-all-clear/);
    expect(PAGE).toMatch(/tA\("allClear"\)/);
  });
});

describe("4. the route is registered everywhere it must be", () => {
  it("primary-route smoke inventory carries /dashboard/activity", () => {
    const entry = PRIMARY_ROUTES.find(
      (r) => r.urlPattern === "/dashboard/activity",
    );
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe(PAGE_REL);
    expect(entry!.requiresAuth).toBe(true);
  });

  it("module registry: activity resolves to the real route, grid+command, all roles, NO double badge", () => {
    const m = getDashboardModule("activity");
    expect(getModuleRoute("activity")).toBe("/dashboard/activity");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    // Never a nav tab — the primary nav stays catalogue-derived.
    expect(m.surfaces).not.toContain("nav");
    expect([...m.roles].sort()).toEqual(
      ["agency", "company", "customer", "worker"].sort(),
    );
    // The page aggregates the whole spine itself; a module badge would
    // double-count the same numbers the bell already shows.
    expect(m.attentionSignalIds ?? []).toEqual([]);
  });

  it("command registry: the activity entry resolves through getModuleRoute (route-drift killer)", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "activity");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe(getModuleRoute("activity"));
    expect(entry!.audience).toBe("public");
    for (const loc of activeLocales) {
      expect(entry!.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(0);
      expect(entry!.synonyms[loc]?.length, `synonyms ${loc}`).toBeGreaterThan(0);
    }
  });

  it("the status strip links the activity centre as its full view", () => {
    const strip = read("components/app/dashboard/dashboard-status-strip.tsx");
    expect(strip).toMatch(/\/dashboard\/activity/);
    expect(strip).toMatch(/status-strip-view-all/);
    expect(strip).toMatch(/t\("viewAll"\)/);
  });

  it("the bell panel carries the view-all footer link", () => {
    const panel = read("components/app/notification-panel.tsx");
    expect(panel).toMatch(/\/dashboard\/activity/);
    expect(panel).toMatch(/notification-panel-view-all/);
    expect(panel).toMatch(/tPanel\("viewAll"\)/);
  });
});

describe("5. copy resolves in every ACTIVE locale (frozen-subset convention)", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, k) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[k]
          : undefined,
      msgs,
    );

  const STATIC_KEYS = [
    "activityCentre.eyebrow",
    "activityCentre.title",
    "activityCentre.intro",
    "activityCentre.readModel",
    "activityCentre.filters.stateLabel",
    "activityCentre.filters.attention",
    "activityCentre.filters.all",
    "activityCentre.filters.moduleLabel",
    "activityCentre.filters.allModules",
    "activityCentre.allClear",
    "activityCentre.rowClear",
    "auth.notifications.viewAll",
    "auth.dashboard.statusStrip.viewAll",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: static keys + a read-semantics line for every spine signal`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of STATIC_KEYS) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
      for (const s of SPINE_SIGNALS) {
        const v = resolve(msgs, `activityCentre.readSemantics.${s.type}`);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: activityCentre.readSemantics.${s.type}`,
        ).toBe(true);
        // Signal NAMES are reused from the bell's catalogue copy — the
        // activity centre must never grow a duplicate name source.
        const name = resolve(msgs, `auth.notifications.types.${s.type}`);
        expect(
          typeof name === "string" && name.trim().length > 0,
          `${loc}: auth.notifications.types.${s.type}`,
        ).toBe(true);
      }
    });
  }
});
