import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getModuleRoute,
  moduleAttentionSignalsAreValid,
  type DashboardModuleId,
} from "@/lib/dashboard/dashboard-module-registry";
import {
  getFeatureConfig,
} from "@/lib/config/feature-availability";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "@/lib/config/navigation";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import type { Role } from "@/lib/auth/actions";
import { PRIMARY_ROUTES } from "./primary-route-smoke";

/**
 * Dashboard module registry guard (control-room foundation, PR B).
 *
 * The registry is the ONE descriptor layer behind the role-aware module
 * catalogue. W3 Package 4 deleted the control-room view model, the grid
 * component and the second dashboard that rendered them, so the pins over
 * those consumers left with them. The registry's own contract survives:
 *
 *  1. every module route is REAL — a page that exists on disk, sourced from
 *     the feature catalogue (`primaryRoute`) or registered in the
 *     primary-route smoke inventory; never a removed surface, preview,
 *     redirect stub or /dashboard/hub;
 *  2. role-specificity — the worker set carries no org-only module and the
 *     org set carries no worker-only module;
 *  3. attention is spine-only — badge references trace to SPINE_SIGNALS,
 *     never a parallel number;
 *  4. the registry is the single source — the command registry resolves its
 *     module destinations through getModuleRoute, and nav-flagged modules
 *     mirror the catalogue-derived primary nav.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

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
  // W3 Package 4 deleted the view model that did the role filtering (with
  // its only consumer, the second dashboard's grid) — the registry's own
  // role declarations are now the one truth a future surface will consume,
  // so the role boundaries are pinned on the registry data directly.
  const gridIdsFor = (role: Role): DashboardModuleId[] =>
    DASHBOARD_MODULES.filter(
      (m) => m.surfaces.includes("grid") && m.roles.includes(role),
    ).map((m) => m.id);
  const worker = gridIdsFor("worker");
  const company = gridIdsFor("company");
  const customer = gridIdsFor("customer");

  it("worker grid: person path + shared surfaces, no org workspace", () => {
    for (const id of ["journal", "profile", "opportunities", "bookings", "market_map", "communication", "documents", "services", "service_requests"] as DashboardModuleId[]) {
      expect(worker, `worker grid must carry ${id}`).toContain(id);
    }
    expect(worker).not.toContain("company");
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

// "Module copy resolves in every active locale" left with the grid: the
// only surface that rendered the registry's label/description keys was the
// deleted module grid, and its auth.dashboard.myZone copy was removed from
// the catalogs with it (W3 Package 4).

describe("3. attention is spine-only (real counts, never a parallel number)", () => {
  it("every attention reference points at a real spine signal", () => {
    for (const m of DASHBOARD_MODULES) {
      expect(moduleAttentionSignalsAreValid(m), m.id).toBe(true);
    }
  });
});

describe("4. the registry is the single source (no duplicate hard-coded islands)", () => {
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
