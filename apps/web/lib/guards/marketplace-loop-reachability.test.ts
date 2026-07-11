import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DASHBOARD_MODULES } from "@/lib/dashboard/dashboard-module-registry";
import { buildControlRoomViewModel } from "@/lib/dashboard/control-room-view-model";
import type { SpineCounts } from "@/lib/notifications/spine-signals";
import type { Role } from "@/lib/auth/actions";

/**
 * P0 Real-Use Hardening — marketplace loop reachability (updated by the
 * control-room foundation PR B).
 *
 * Before the original slice the loop's two halves were UI-orphaned:
 * /dashboard/services (where a provider publishes an offering) had NO link
 * anywhere in the app, and /dashboard/service-requests was only reachable
 * through the count-gated action cards.
 *
 * PR B moved the always-on access from a hard-coded page-level block
 * (marketplaceAccess) into the ONE dashboard module registry: `services` and
 * `service_requests` are grid modules for EVERY role, rendered by the
 * registry-driven DashboardModuleGrid in both branch layouts. This guard
 * pins that reachability at the registry level (stronger than the old
 * source-text pin — the routes cannot drift), plus the page-to-page
 * cross-links between the two halves.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ZERO: SpineCounts = {
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  pendingInvitations: 0,
  openTaskAttention: 0,
};

describe("the control-room grid exposes always-on access to both loop halves", () => {
  it("services + service_requests are registry grid modules with the real routes", () => {
    const services = DASHBOARD_MODULES.find((m) => m.id === "services");
    const requests = DASHBOARD_MODULES.find((m) => m.id === "service_requests");
    expect(services?.surfaces).toContain("grid");
    expect(requests?.surfaces).toContain("grid");
    expect(services?.surfaceRoute).toBe("/dashboard/services");
    expect(requests?.surfaceRoute).toBe("/dashboard/service-requests");
  });

  it("EVERY role's grid carries both halves (worker, company, agency, customer)", () => {
    for (const role of ["worker", "company", "agency", "customer"] as Role[]) {
      const ids = buildControlRoomViewModel({
        role,
        counts: ZERO,
        hasCompany: false,
      }).modules.map((m) => m.id);
      expect(ids, `${role} grid must carry services`).toContain("services");
      expect(ids, `${role} grid must carry service_requests`).toContain(
        "service_requests",
      );
    }
  });

  it("the grid renders in BOTH the org and worker branches", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect((page.match(/<DashboardModuleGrid\b/g) ?? []).length).toBe(2);
  });

  it("access is calm — the loop modules carry no fabricated urgency", () => {
    // `services` has no spine signal at all (no fake count); the request
    // half may badge ONLY from the real spine counts.
    const services = DASHBOARD_MODULES.find((m) => m.id === "services");
    expect(services?.attentionSignalIds ?? []).toEqual([]);
    const vm = buildControlRoomViewModel({
      role: "worker",
      counts: ZERO,
      hasCompany: false,
    });
    for (const m of vm.modules) {
      expect(m.badgeCount, `${m.id} badge at zero counts`).toBe(0);
    }
  });

  it("labels come from i18n keys (no hardcoded UI copy)", () => {
    const services = DASHBOARD_MODULES.find((m) => m.id === "services")!;
    const requests = DASHBOARD_MODULES.find((m) => m.id === "service_requests")!;
    expect(services.labelKey).toBe("marketplace.hubOffer");
    expect(services.descriptionKey).toBe("marketplace.hubOfferNote");
    expect(requests.labelKey).toBe("marketplace.hubFind");
    expect(requests.descriptionKey).toBe("marketplace.hubFindNote");
  });

  it("never the doctrine-killed /discover", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).not.toMatch(/\/dashboard\/discover/);
  });
});

describe("the two halves cross-link to each other", () => {
  it("/dashboard/services links to the request loop", () => {
    const page = read("app/[locale]/dashboard/services/page.tsx");
    expect(page).toMatch(/from "@\/lib\/i18n\/navigation"/);
    expect(page).toMatch(/data-testid="services-to-requests-link"/);
    expect(page).toMatch(/"\/dashboard\/service-requests" as "\/dashboard"/);
    expect(page).toMatch(/t\("linkToRequests"\)/);
  });

  it("/dashboard/service-requests links to manage offerings", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/from "@\/lib\/i18n\/navigation"/);
    expect(page).toMatch(/data-testid="requests-to-services-link"/);
    expect(page).toMatch(/"\/dashboard\/services" as "\/dashboard"/);
    expect(page).toMatch(/t\("linkToServices"\)/);
  });
});

describe("reachability copy exists across active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    const json = JSON.parse(read(`messages/${loc}.json`)) as {
      marketplace?: Record<string, unknown>;
      serviceOfferings?: Record<string, unknown>;
    };
    it(`${loc}: marketplace hub + cross-link keys present + non-empty`, () => {
      const m = json.marketplace ?? {};
      for (const k of [
        "hubTitle",
        "hubOffer",
        "hubOfferNote",
        "hubFind",
        "hubFindNote",
        "linkToServices",
      ]) {
        expect(typeof m[k], `${loc}.marketplace.${k}`).toBe("string");
        expect(String(m[k]).trim().length, `${loc}.marketplace.${k}`).toBeGreaterThan(0);
      }
    });
    it(`${loc}: serviceOfferings.linkToRequests present + non-empty`, () => {
      const v = (json.serviceOfferings ?? {}).linkToRequests;
      expect(typeof v, `${loc}.serviceOfferings.linkToRequests`).toBe("string");
      expect(String(v).trim().length).toBeGreaterThan(0);
    });
  }
});
