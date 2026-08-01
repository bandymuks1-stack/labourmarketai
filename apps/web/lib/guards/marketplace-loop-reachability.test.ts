import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  moduleAttentionSignalsAreValid,
} from "@/lib/dashboard/dashboard-module-registry";
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
 * PR B moved the always-on access into the ONE dashboard module registry:
 * `services` and `service_requests` are grid modules for EVERY role. W3
 * Package 4 deleted the second dashboard that used to render that grid, but
 * the registry stays the single reachability truth for every surviving
 * consumer — this guard pins the loop at the registry level (the routes
 * cannot drift), plus the page-to-page cross-links between the two halves.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the module registry exposes always-on access to both loop halves", () => {
  it("services + service_requests are registry grid modules with the real routes", () => {
    const services = DASHBOARD_MODULES.find((m) => m.id === "services");
    const requests = DASHBOARD_MODULES.find((m) => m.id === "service_requests");
    expect(services?.surfaces).toContain("grid");
    expect(requests?.surfaces).toContain("grid");
    expect(services?.surfaceRoute).toBe("/dashboard/services");
    expect(requests?.surfaceRoute).toBe("/dashboard/service-requests");
  });

  it("EVERY role sees both halves (worker, company, agency, customer)", () => {
    const services = DASHBOARD_MODULES.find((m) => m.id === "services");
    const requests = DASHBOARD_MODULES.find((m) => m.id === "service_requests");
    for (const role of ["worker", "company", "agency", "customer"] as Role[]) {
      expect(services?.roles, `${role} must reach services`).toContain(role);
      expect(requests?.roles, `${role} must reach service_requests`).toContain(
        role,
      );
    }
  });

  it("access is calm — the loop modules carry no fabricated urgency", () => {
    // `services` has no spine signal at all (no fake count); the request
    // half may badge ONLY from real spine-catalogue signals.
    const services = DASHBOARD_MODULES.find((m) => m.id === "services");
    expect(services?.attentionSignalIds ?? []).toEqual([]);
    const requests = DASHBOARD_MODULES.find((m) => m.id === "service_requests")!;
    expect(moduleAttentionSignalsAreValid(requests)).toBe(true);
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
    // No module may quietly re-route to the removed discovery surface.
    for (const m of DASHBOARD_MODULES) {
      expect(m.surfaceRoute ?? "", m.id).not.toMatch(/\/dashboard\/discover/);
    }
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
