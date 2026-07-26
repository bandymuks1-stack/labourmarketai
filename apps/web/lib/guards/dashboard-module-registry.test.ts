import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getModuleRoute,
  moduleAttentionSignalsAreValid,
  type DashboardModuleId,
} from "@/lib/dashboard/dashboard-module-registry";
import { buildControlRoomViewModel } from "@/lib/dashboard/control-room-view-model";
import {
  getFeatureConfig,
} from "@/lib/config/feature-availability";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "@/lib/config/navigation";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import { SPINE_SIGNALS, type SpineCounts } from "@/lib/notifications/spine-signals";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Dashboard module registry guard (control-room foundation, PR B).
 *
 * The registry is the ONE descriptor layer behind the role-aware control
 * room. This guard pins its contract:
 *
 *  1. every module route is REAL — a page that exists on disk, sourced from
 *     the feature catalogue (`primaryRoute`) or registered in the
 *     primary-route smoke inventory; never a removed surface, preview,
 *     redirect stub or /dashboard/hub;
 *  2. role-specificity — the worker grid carries no org-only module and the
 *     org grid carries no worker-only module;
 *  3. every grid module's label + description i18n keys resolve non-empty in
 *     every ACTIVE locale (the repo's convention for new dashboard keys);
 *  4. attention is spine-only — badge counts trace to SPINE_SIGNALS and
 *     SpineCounts, never a parallel number;
 *  5. the registry is the single source — page.tsx no longer hard-codes the
 *     old marketplaceAccess routes, and the command registry resolves its
 *     module destinations through getModuleRoute.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

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

/** Removed / preview / stub surfaces a module may never target (mirror of
 *  the route-truth-map classes; /dashboard/hub stays deleted). */
const FORBIDDEN_MODULE_TARGETS = [
  "/dashboard/hub",
  "/dashboard/talent",
  "/dashboard/visual-os",
  "/dashboard/learning",
  "/dashboard/marketplace",
  "/dashboard/player-card",
  "/dashboard/agency",
  "/dashboard/search",
];

describe("1. every module routes to a real launch surface", () => {
  it("module ids are unique", () => {
    const ids = DASHBOARD_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const m of DASHBOARD_MODULES) {
    it(`${m.id} → ${getModuleRoute(m.id)} is a real page`, () => {
      const route = getModuleRoute(m.id);
      const rel = join("app", "[locale]", ...route.split("/").filter(Boolean));
      expect(
        existsSync(join(ROOT, rel, "page.tsx")),
        `${route} must be a real page (${rel}/page.tsx)`,
      ).toBe(true);
    });
  }

  it("feature-backed modules derive their route from the catalogue (no drift) and only from ACTIVE features", () => {
    for (const m of DASHBOARD_MODULES) {
      if (!m.featureKey) continue;
      const f = getFeatureConfig(m.featureKey);
      expect(f.availability, `${m.id}: feature ${m.featureKey}`).toBe("active");
      expect(f.primaryRoute, `${m.id}: feature ${m.featureKey} primaryRoute`).toBeTruthy();
      expect(getModuleRoute(m.id)).toBe(f.primaryRoute);
      // A feature-backed module must not ALSO carry a literal route.
      expect(m.surfaceRoute, `${m.id} must not duplicate the catalogue route`).toBeUndefined();
    }
  });

  it("surface modules (no catalogue feature yet) are registered in the primary-route smoke inventory", () => {
    const smokeRoutes = new Set(PRIMARY_ROUTES.map((r) => r.urlPattern));
    for (const m of DASHBOARD_MODULES) {
      if (m.featureKey) continue;
      expect(
        smokeRoutes.has(m.surfaceRoute ?? ""),
        `${m.id}: ${m.surfaceRoute} must be a primary-route smoke entry`,
      ).toBe(true);
    }
  });

  it("no module targets a removed / preview / stub surface", () => {
    for (const m of DASHBOARD_MODULES) {
      const route = getModuleRoute(m.id);
      for (const bad of FORBIDDEN_MODULE_TARGETS) {
        expect(
          route === bad || route.startsWith(bad + "/"),
          `${m.id} must not target ${bad}`,
        ).toBe(false);
      }
    }
  });
});

describe("2. role-specific grids (worker ≠ org)", () => {
  const worker = buildControlRoomViewModel({
    role: "worker",
    counts: ZERO,
    hasCompany: false,
  }).modules.map((m) => m.id);
  const company = buildControlRoomViewModel({
    role: "company",
    counts: ZERO,
    hasCompany: true,
  }).modules.map((m) => m.id);
  const customer = buildControlRoomViewModel({
    role: "customer",
    counts: ZERO,
    hasCompany: false,
  }).modules.map((m) => m.id);

  it("worker grid: person path + shared surfaces, no org workspace without a real company", () => {
    for (const id of ["journal", "profile", "opportunities", "bookings", "market_map", "communication", "documents", "services", "service_requests"] as DashboardModuleId[]) {
      expect(worker, `worker grid must carry ${id}`).toContain(id);
    }
    expect(worker).not.toContain("company");
  });

  it("a worker who really owns a company keeps the company-workspace shortcut (former MyZone behaviour)", () => {
    const withCompany = buildControlRoomViewModel({
      role: "worker",
      counts: ZERO,
      hasCompany: true,
    }).modules.map((m) => m.id);
    expect(withCompany).toContain("company");
  });

  it("org grid: no worker-only modules (journal / profile / opportunities)", () => {
    for (const id of ["journal", "profile", "opportunities"]) {
      expect(company, `org grid must not carry ${id}`).not.toContain(id);
    }
    for (const id of ["company", "services", "service_requests", "bookings", "communication", "market_map", "documents"] as DashboardModuleId[]) {
      expect(company, `org grid must carry ${id}`).toContain(id);
    }
  });

  it("customer grid: shared surfaces only — no org workspace, no worker person path", () => {
    for (const id of ["journal", "profile", "opportunities", "company"]) {
      expect(customer).not.toContain(id);
    }
    expect(customer).toContain("service_requests");
  });

  it("no grid module links the overview to itself", () => {
    for (const ids of [worker, company, customer]) {
      expect(ids).not.toContain("overview");
    }
  });
});

describe("3. module copy resolves in every active locale", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, k) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[k]
          : undefined,
      msgs,
    );

  for (const loc of activeLocales) {
    it(`${loc}: every grid module label + description is non-empty`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const m of DASHBOARD_MODULES) {
        if (!m.surfaces.includes("grid")) continue;
        for (const key of [m.labelKey, m.descriptionKey]) {
          const v = resolve(msgs, key);
          expect(
            typeof v === "string" && v.trim().length > 0,
            `${loc}: ${m.id} key ${key}`,
          ).toBe(true);
        }
      }
    });
  }
});

describe("4. attention is spine-only (real counts, never a parallel number)", () => {
  it("every attention reference points at a real spine signal", () => {
    for (const m of DASHBOARD_MODULES) {
      expect(moduleAttentionSignalsAreValid(m), m.id).toBe(true);
    }
  });

  it("zero counts → zero badges and an empty status strip", () => {
    const vm = buildControlRoomViewModel({
      role: "worker",
      counts: ZERO,
      hasCompany: false,
    });
    expect(vm.modules.every((m) => m.badgeCount === 0)).toBe(true);
    expect(vm.statusEntries).toEqual([]);
  });

  it("badge counts sum the module's spine signals exactly", () => {
    const counts: SpineCounts = {
      unreadConversations: 2,
      pendingIncomingServiceRequests: 3,
      serviceRequestResponsesNew: 4,
      pendingIncomingBookings: 5,
      bookingResponsesNew: 6,
      pendingInvitations: 7,
      openTaskAttention: 8,
      newJobMatches: 9,
    };
    const vm = buildControlRoomViewModel({
      role: "worker",
      counts,
      hasCompany: false,
    });
    const byId = new Map(vm.modules.map((m) => [m.id, m.badgeCount]));
    expect(byId.get("communication")).toBe(2);
    expect(byId.get("service_requests")).toBe(3 + 4);
    expect(byId.get("bookings")).toBe(5 + 6);
    // Job Recommendation surfacing: the board card carries the aggregate
    // unseen-matches count (the SAME number the bell shows).
    expect(byId.get("opportunities")).toBe(9);
    // Modules without a wired signal never fabricate a badge.
    expect(byId.get("journal")).toBe(0);
    expect(byId.get("services")).toBe(0);
  });

  it("the status strip mirrors the bell: one entry per positive signal, same copy leaf, same clearing route", () => {
    const counts: SpineCounts = { ...ZERO, pendingInvitations: 1, unreadConversations: 9 };
    const vm = buildControlRoomViewModel({
      role: "company",
      counts,
      hasCompany: true,
    });
    expect(vm.statusEntries.map((e) => e.id).sort()).toEqual(
      ["pending-invitations", "unread-messages"].sort(),
    );
    for (const e of vm.statusEntries) {
      const signal = SPINE_SIGNALS.find((s) => s.id === e.id)!;
      expect(e.typeKey).toBe(signal.type);
      expect(e.href).toBe(signal.href);
      expect(e.count).toBeGreaterThan(0);
    }
  });
});

describe("5. the registry is the single source (no duplicate hard-coded islands)", () => {
  const page = read("app/[locale]/dashboard/advanced/page.tsx");
  // Strip comments first — honest source comments may NAME the removed
  // pattern ("the former marketplaceAccess cards") without tripping the scan.
  const pageCode = page
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("page.tsx no longer hard-codes the old marketplaceAccess routes", () => {
    expect(pageCode).not.toMatch(/marketplaceAccess/);
    expect(pageCode).not.toContain('href="/dashboard/services"');
    expect(pageCode).not.toContain('"/dashboard/opportunities"');
  });

  it("both role branches render the registry-driven grid + status strip", () => {
    expect((page.match(/<DashboardModuleGrid\b/g) ?? []).length).toBe(2);
    expect((page.match(/<DashboardStatusStrip\b/g) ?? []).length).toBe(2);
    // Fed by the pure view model over the request-cached spine read (awaited
    // inside the page's parallel batch since the P0 latency audit).
    expect(page).toMatch(/buildControlRoomViewModel\(\{/);
    expect(page).toMatch(/getSpineCounts\(\),/);
  });

  it("the grid component renders modules only through the shared ActionCard (no invented links)", () => {
    const grid = read("components/app/dashboard/dashboard-module-grid.tsx");
    expect(grid).toMatch(/<ActionCard\b/);
    // No literal route targets — every href comes from the view model.
    expect(grid).not.toMatch(/href=\{?["']\//);
    expect(grid).toMatch(/href=\{m\.route\}/);
  });

  it("command-registry module destinations resolve through getModuleRoute (route-drift killer)", () => {
    const src = read("lib/navigation/command-registry.ts");
    expect(src).toMatch(/from "@\/lib\/dashboard\/dashboard-module-registry"/);
    const MODULE_BACKED: ReadonlyArray<readonly [string, DashboardModuleId]> = [
      ["work_journal", "journal"],
      ["profile", "profile"],
      ["find_work", "opportunities"],
      ["services", "services"],
      ["service_requests", "service_requests"],
      ["messages", "communication"],
      ["bookings", "bookings"],
      ["market_map", "market_map"],
      ["documents", "documents"],
      ["team_brigade", "company"],
    ];
    for (const [commandId, moduleId] of MODULE_BACKED) {
      const entry = COMMAND_REGISTRY.find((e) => e.id === commandId);
      expect(entry, commandId).toBeTruthy();
      expect(entry!.route, `${commandId} route must equal module ${moduleId}`).toBe(
        getModuleRoute(moduleId),
      );
    }
  });

  it("nav-flagged modules mirror the catalogue-derived primary nav (registry builds ON it, never replaces it)", () => {
    const navModuleFeatures = DASHBOARD_MODULES.filter((m) =>
      m.surfaces.includes("nav"),
    ).map((m) => m.featureKey);
    expect(new Set(navModuleFeatures)).toEqual(
      new Set(VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id)),
    );
  });

  it("the Ctrl/Cmd+K shortcut focuses the EXISTING inline finder (no modal palette)", () => {
    const finder = read("components/app/command-finder.tsx");
    expect(finder).toMatch(/e\.metaKey \|\| e\.ctrlKey/);
    expect(finder).toMatch(/=== "k"/);
    expect(finder).toMatch(/inputRef\.current\?\.focus\(\)/);
    expect(finder).toMatch(/t\("shortcutHint"\)/);
    expect(finder).not.toMatch(/createPortal|dialog|Dialog/);
  });
});
