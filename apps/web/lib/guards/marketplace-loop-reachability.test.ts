import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getModuleRoute,
  moduleAttentionSignalsAreValid,
} from "@/lib/dashboard/dashboard-module-registry";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "@/lib/config/navigation";
import { activeLocales } from "@/lib/i18n/config";
import type { Role } from "@/lib/auth/actions";

/**
 * Marketplace loop reachability — HONEST version (M7, capability inventory
 * §5.2).
 *
 * History of the defect this guard now refuses to repeat: the original test
 * asserted that `services` / `service_requests` carry `surfaces: ["grid"]`
 * in the dashboard module registry — but W3 Package 4 deleted the second
 * dashboard that rendered that grid, so "grid" became a surface NOBODY
 * renders. The guard kept passing while the reachability it is named after
 * did not exist (a test that can never fail is worse than one that fails).
 *
 * What reachability actually is today — a click path a normal user can walk,
 * inside the owner-frozen IA (map-first, six primary tabs, utility-only
 * account menu):
 *
 *   Žemėlapis primary tab → /dashboard/market-map
 *     → connections bridge → /dashboard/service-requests  (FIND half)
 *     → connections bridge → /dashboard/services          (OFFER half)
 *   plus the halves cross-link each other, the command palette carries both,
 *   and the chat's need-service intent routes to the same canonical route.
 *
 * Every assertion below is anchored to a surface that really renders, and
 * each one can fail: remove a link, demote the map tab, retire a route file,
 * or fork the chat onto a different route, and this guard goes red.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ALL_ROLES: readonly Role[] = ["worker", "company", "agency", "customer"];

describe("the door: the loop hangs off a primary nav tab that really exists", () => {
  it("Žemėlapis (market_map) is a primary nav tab at /dashboard/market-map", () => {
    // The map is the marketplace's owner-designated primary surface
    // (map-first correction). If the map tab is ever demoted, the loop
    // loses its door and this guard must fail.
    const tab = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === "market_map");
    expect(tab?.href).toBe("/dashboard/market-map");
  });

  it("the map's connections bridge links BOTH loop halves", () => {
    const page = read("app/[locale]/dashboard/market-map/page.tsx");
    // FIND half — a buyer discovers active offerings and requests one.
    expect(page).toMatch(/key: "marketplace",\s*\n\s*href: "\/dashboard\/service-requests"/);
    // OFFER half — a provider publishes an offering (M7: this link is the
    // fix; before it, /dashboard/services was reachable only from inside
    // /dashboard/service-requests itself).
    expect(page).toMatch(/key: "services",\s*\n\s*href: "\/dashboard\/services"/);
    // Both render through the bridge's real link template (testid-pinned so
    // e2e can walk the same path).
    expect(page).toMatch(/data-testid=\{`market-map-connection-\$\{l\.key\}`\}/);
    expect(page).toMatch(/data-testid="market-map-connections"/);
  });
});

describe("the destinations: both halves are real route files, one route truth", () => {
  it("both page files exist on disk", () => {
    expect(
      existsSync(join(ROOT, "app/[locale]/dashboard/services/page.tsx")),
      "/dashboard/services page file",
    ).toBe(true);
    expect(
      existsSync(join(ROOT, "app/[locale]/dashboard/service-requests/page.tsx")),
      "/dashboard/service-requests page file",
    ).toBe(true);
  });

  it("the registry resolves the SAME routes the bridge links (no drift)", () => {
    expect(getModuleRoute("services")).toBe("/dashboard/services");
    expect(getModuleRoute("service_requests")).toBe("/dashboard/service-requests");
  });
});

describe("the registry backs the RENDERED consumers (command palette, activity centre)", () => {
  const services = DASHBOARD_MODULES.find((m) => m.id === "services");
  const requests = DASHBOARD_MODULES.find((m) => m.id === "service_requests");

  it("every role reaches both halves (worker, company, agency, customer)", () => {
    for (const role of ALL_ROLES) {
      expect(services?.roles, `${role} must reach services`).toContain(role);
      expect(requests?.roles, `${role} must reach service_requests`).toContain(role);
    }
  });

  it("the command palette really consumes both modules (not a phantom surface)", () => {
    // The registry's `command` surface is only reachability if something
    // renders it — the universal command search does, via getModuleRoute.
    const palette = read("lib/navigation/command-registry.ts");
    expect(palette).toMatch(/getModuleRoute\("services"\)/);
    expect(palette).toMatch(/getModuleRoute\("service_requests"\)/);
  });

  it("access is calm — no fabricated urgency on the loop modules", () => {
    // `services` carries no signal at all (no fake count); the request half
    // may badge ONLY from real spine-catalogue signals.
    expect(services?.attentionSignalIds ?? []).toEqual([]);
    expect(moduleAttentionSignalsAreValid(requests!)).toBe(true);
  });

  it("labels come from i18n keys (no hardcoded UI copy)", () => {
    expect(services?.labelKey).toBe("marketplace.hubOffer");
    expect(services?.descriptionKey).toBe("marketplace.hubOfferNote");
    expect(requests?.labelKey).toBe("marketplace.hubFind");
    expect(requests?.descriptionKey).toBe("marketplace.hubFindNote");
  });

  it("never the doctrine-killed /discover", () => {
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

describe("chat-first parity: the chat's need-service intent lands on the SAME route", () => {
  it("needService routes to link:/dashboard/service-requests (one canonical state)", () => {
    // The nav addition and the conversational entry must agree — a chat
    // intent pointing anywhere else would be a second, drifting truth.
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/id: "link:\/dashboard\/service-requests",\s*\n\s*label: labels\.chipServiceRequests/);
  });
});

describe("reachability copy exists across ALL active locales", () => {
  // activeLocales (not a hand-kept list) so a newly activated locale joins
  // this guard automatically — and fails it until the keys really exist.
  for (const loc of activeLocales) {
    const json = JSON.parse(read(`messages/${loc}.json`)) as {
      marketplace?: Record<string, unknown>;
      serviceOfferings?: Record<string, unknown>;
    };
    it(`${loc}: marketplace hub + offer/find + cross-link keys present + non-empty`, () => {
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
