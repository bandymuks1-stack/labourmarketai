import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mano erdvė control-room guard (action-first-product-logic-v1, updated by
 * the control-room foundation PR B; trimmed by W3 Package 4).
 *
 * W3 Package 4 deleted the second dashboard: the /dashboard/advanced page,
 * the MyZone component and the DashboardModuleGrid renderer are gone (the
 * deletion itself is ratcheted by w3-return-to-workspace.test.ts +
 * route-truth-map.test.ts). What SURVIVES is the ONE dashboard module
 * registry (lib/dashboard/dashboard-module-registry.ts) — still the single
 * route/label source for every surface that lists modules (command finder,
 * command surfaces). This guard keeps the registry honest: real routes,
 * human i18n keys, and no duplicate / fake / preview destinations.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
// Strip comments: honest source comments (e.g. "no preparing/preview
// surface") document the ABSENCE of fakery and must not trip the wording
// scans below.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("the registry stays the single action source (real routes, human keys)", () => {
  it("the registry's worker fast actions keep the real routes + human keys", () => {
    const registry = read("lib/dashboard/dashboard-module-registry.ts");
    const expectations: Array<[string, string]> = [
      ["recordWork", "journal_text_first"],
      ["improveProfile", "profile_text_first"],
      ["findOpportunities", "/dashboard/opportunities"],
      // Production UX repair v2 (F14): the planning module is now sourced
      // from the `planning` catalogue feature (features.planning.label);
      // the bookings module keeps its own name + route.
      ["bookings", "/dashboard/bookings"],
      ["documents", "/dashboard/documents"],
      ["companyActions", "/dashboard/company"],
    ];
    for (const [key, target] of expectations) {
      expect(registry, `${key} action`).toContain(
        `auth.dashboard.myZone.actions.${key}.title`,
      );
      expect(registry, `${key} -> ${target}`).toContain(`"${target}"`);
    }
  });
});

describe("no duplicate / fake / preview / admin destinations in the registry", () => {
  const REGISTRY_CODE = stripComments(
    read("lib/dashboard/dashboard-module-registry.ts"),
  );
  it("only ONE profile door — no separate player-card / cv / evidence cards", () => {
    expect(REGISTRY_CODE).not.toContain("/dashboard/player-card");
    expect(REGISTRY_CODE).not.toContain("/dashboard/cv");
    expect(REGISTRY_CODE).not.toContain("/dashboard/reports/evidence");
  });
  it("no sample/preview destinations", () => {
    expect(REGISTRY_CODE).not.toMatch(/\/dashboard\/(talent|visual-os|design)/);
    expect(REGISTRY_CODE).not.toMatch(/sample|preview|concept/i);
  });
});
