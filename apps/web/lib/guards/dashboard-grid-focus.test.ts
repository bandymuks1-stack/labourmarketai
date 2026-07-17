import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  modulePrimaryRolesAreValid,
} from "@/lib/dashboard/dashboard-module-registry";
import {
  buildControlRoomViewModel,
  collapsedGridModules,
} from "@/lib/dashboard/control-room-view-model";
import type { Role } from "@/lib/auth/actions";
import type { SpineCounts } from "@/lib/notifications/spine-signals";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Dashboard grid focus guard (HUMAN-FIRST LAUNCH TRAIN v1, Agent 1).
 *
 * Goal: the /dashboard first screen must be understandable in ~5 seconds by
 * a normal human. The "Veiksmai" grid therefore opens COLLAPSED to a SMALL
 * role-specific primary set; everything else stays one honest tap away
 * behind "show all". This guard pins the contract so the wall of 17+ tiles
 * cannot quietly come back, and so the fold can never hide real work:
 *
 *  1. `primaryRoles` is presentation-only — always a subset of `roles`
 *     (a primary flag can never widen who sees a module);
 *  2. every role's collapsed set is SMALL (3–7 modules) and strictly
 *     smaller than its full grid — the fold has to actually reduce noise;
 *  3. honesty: a module with a REAL attention badge is never folded away,
 *     and an all-hidden edge case falls back to the full list;
 *  4. the grid component consumes the pure helper and renders an honest,
 *     labelled toggle (total count named) with copy in every active locale.
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

const ROLES: readonly Role[] = ["worker", "company", "agency", "customer"];

describe("1. primaryRoles is a presentation rule, never a visibility rule", () => {
  for (const m of DASHBOARD_MODULES) {
    it(`${m.id}: primaryRoles ⊆ roles`, () => {
      expect(modulePrimaryRolesAreValid(m)).toBe(true);
    });
  }
});

describe("2. every role's collapsed set is small (5-second scannable)", () => {
  for (const role of ROLES) {
    it(`${role}: 3–7 primary modules, strictly fewer than the full grid`, () => {
      const vm = buildControlRoomViewModel({
        role,
        counts: ZERO,
        hasCompany: role === "company" || role === "agency",
      });
      const collapsed = collapsedGridModules(vm.modules);
      expect(collapsed.length).toBeGreaterThanOrEqual(3);
      expect(collapsed.length).toBeLessThanOrEqual(7);
      expect(collapsed.length).toBeLessThan(vm.modules.length);
      // With zero counts the collapsed set is exactly the primary set.
      expect(collapsed.every((m) => m.primary)).toBe(true);
    });
  }

  it("worker first screen leads with the person path (journal, opportunities, profile)", () => {
    const vm = buildControlRoomViewModel({
      role: "worker",
      counts: ZERO,
      hasCompany: false,
    });
    const ids = collapsedGridModules(vm.modules).map((m) => m.id);
    for (const id of ["journal", "opportunities", "profile", "communication"]) {
      expect(ids, `worker collapsed set must carry ${id}`).toContain(id);
    }
  });

  it("org first screen leads with the workspace path (company, projects, service_requests)", () => {
    const vm = buildControlRoomViewModel({
      role: "company",
      counts: ZERO,
      hasCompany: true,
    });
    const ids = collapsedGridModules(vm.modules).map((m) => m.id);
    for (const id of ["company", "projects", "service_requests", "communication"]) {
      expect(ids, `org collapsed set must carry ${id}`).toContain(id);
    }
  });
});

describe("3. the fold never hides real work", () => {
  it("a non-primary module with a REAL badge stays visible while collapsed", () => {
    const counts: SpineCounts = { ...ZERO, pendingIncomingBookings: 2 };
    const vm = buildControlRoomViewModel({
      role: "worker",
      counts,
      hasCompany: false,
    });
    const bookings = vm.modules.find((m) => m.id === "bookings")!;
    expect(bookings.primary).toBe(false);
    expect(bookings.badgeCount).toBe(2);
    const ids = collapsedGridModules(vm.modules).map((m) => m.id);
    expect(ids).toContain("bookings");
  });

  it("an empty focused set falls back to the full list (never a blank workspace)", () => {
    const vm = buildControlRoomViewModel({
      role: "worker",
      counts: ZERO,
      hasCompany: false,
    });
    const noPrimary = vm.modules.map((m) => ({ ...m, primary: false }));
    expect(collapsedGridModules(noPrimary)).toEqual(noPrimary);
  });
});

describe("4. the grid renders the honest fold", () => {
  const grid = read("components/app/dashboard/dashboard-module-grid.tsx");

  it("consumes the pure collapsed helper (no second folding truth)", () => {
    expect(grid).toMatch(/collapsedGridModules\(visible\)/);
    expect(grid).toMatch(
      /from "@\/lib\/dashboard\/control-room-view-model"/,
    );
  });

  it("the toggle names the TOTAL action count and exposes its expanded state", () => {
    expect(grid).toMatch(/module-grid-show-all-toggle/);
    expect(grid).toMatch(/aria-expanded=\{showAll\}/);
    expect(grid).toMatch(/tGrid\("showAll", \{ count: visible\.length \}\)/);
    expect(grid).toMatch(/tGrid\("showLess"\)/);
  });

  it("managing always shows the full set (the fold only applies to browsing)", () => {
    // The manage branch maps over `visible`, never over the focused subset.
    expect(grid).toContain("visible.map((m, i)");
  });

  for (const loc of activeLocales) {
    it(`${loc}: showAll / showLess copy is non-empty and count-aware`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        auth: {
          dashboard: { moduleGrid: { showAll?: string; showLess?: string } };
        };
      };
      const mg = msgs.auth.dashboard.moduleGrid;
      expect(mg.showAll?.trim().length).toBeGreaterThan(0);
      expect(mg.showAll).toContain("{count}");
      expect(mg.showLess?.trim().length).toBeGreaterThan(0);
    });
  }
});
