import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mano erdvė control-room guard (action-first-product-logic-v1, updated by
 * the control-room foundation PR B).
 *
 * The worker home (`/dashboard`) must stay the simple action-first control
 * room: a readiness status, the few real fast actions ("Ką galite padaryti
 * dabar") and one "Kas ką gerina" explanation — NOT a wall of loosely
 * related cards and NOT a pile of duplicate profile/CV/player-card doors.
 *
 * PR B moved the fast-action grid from a hard-coded list inside MyZone to
 * the ONE registry-driven grid (lib/dashboard/dashboard-module-registry.ts →
 * DashboardModuleGrid), rendered with the SAME human labels
 * (auth.dashboard.myZone.actions.*). MyZone keeps the readiness status +
 * the what-improves-what explanation. This guard pins the new shape so the
 * home can neither regress into clutter nor grow a second hard-coded
 * action list.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const PAGE = read("app/[locale]/dashboard/page.tsx");
const COMP = read("components/app/my-zone.tsx");
// Strip comments: honest source comments (e.g. "no preview/sample actions")
// document the ABSENCE of fakery and must not trip the wording scans below.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const COMP_CODE = stripComments(COMP);
const SERVED = ["lt", "en", "ru"] as const;

describe("the worker home is the action-first control room (no card wall)", () => {
  it("mounts MyZone with the real readiness state + the registry-driven grid", () => {
    expect(PAGE).toMatch(/<MyZone\b/);
    expect(PAGE).toMatch(/incomplete=\{isFirstUse\}/);
    // The fast actions render from the ONE module registry, fed by the pure
    // view model (role + hasCompany + spine counts) — never a second list.
    expect(PAGE).toMatch(/<DashboardModuleGrid\b/);
    expect(PAGE).toMatch(/buildControlRoomViewModel\(\{/);
    expect(PAGE).toMatch(/hasCompany,?\s*\n/);
  });
  it("dropped the old loose stack (identity strip / today screen / first-use panel)", () => {
    // The company branch may still use IdentityActions; the WORKER home must not
    // re-stack the old clutter components.
    expect(PAGE).not.toMatch(/<TodayScreen\b/);
    expect(PAGE).not.toMatch(/<DashboardFirstUsePanel\b/);
  });
});

describe("MyZone carries status + what-improves-what; the grid carries the actions", () => {
  it("a single readiness status (information complete or not yet)", () => {
    expect(COMP).toMatch(/testid="my-zone-status"/); // StatusChip (audit PR8)
    expect(COMP).toMatch(/incompleteStatus/);
    expect(COMP).toMatch(/readyStatus/);
  });
  it("MyZone no longer hard-codes any action route (registry is the single source)", () => {
    expect(COMP_CODE).not.toMatch(/\/dashboard\//);
    expect(COMP_CODE).not.toMatch(/BASE_ACTIONS|COMPANY_ACTION/);
  });
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
  it("the company door stays conditional on a real company (view model)", () => {
    const vm = read("lib/dashboard/control-room-view-model.ts");
    expect(vm).toMatch(/role === "worker" && hasCompany/);
  });
  it("renders the 'what improves what' explanation", () => {
    expect(COMP).toMatch(/data-testid="my-zone-improves"/);
    expect(COMP).toMatch(/improvesHeading/);
  });
});

describe("no duplicate / fake / preview / admin surfaces in the control room", () => {
  const REGISTRY_CODE = stripComments(
    read("lib/dashboard/dashboard-module-registry.ts"),
  );
  it("only ONE profile door — no separate player-card / cv / evidence cards", () => {
    for (const src of [COMP, REGISTRY_CODE]) {
      expect(src).not.toContain("/dashboard/player-card");
      expect(src).not.toContain("/dashboard/cv");
      expect(src).not.toContain("/dashboard/reports/evidence");
    }
  });
  it("no sample/preview destinations", () => {
    for (const src of [COMP_CODE, REGISTRY_CODE]) {
      expect(src).not.toMatch(/\/dashboard\/(talent|visual-os|design)/);
      expect(src).not.toMatch(/sample|preview|concept/i);
    }
  });
  it("no admin/internal wording in the MyZone component", () => {
    expect(COMP_CODE).not.toMatch(/\badmin\b|cockpit|module|\bmodul/i);
  });
});

describe("MyZone copy is human and present in every served locale (no raw keys)", () => {
  const ACTION_KEYS = [
    "recordWork",
    "improveProfile",
    "mapVisibility",
    "checkMessages",
    "companyActions",
  ] as const;
  const IMPROVE_KEYS = ["journal", "profile", "map", "messages"] as const;
  const BAD = /admin|preview|sample|cockpit|module|modul/i;
  for (const loc of SERVED) {
    it(`${loc}: heading, status, all actions + improves are non-empty and human`, () => {
      const z = (JSON.parse(read(`messages/${loc}.json`)) as {
        auth: { dashboard: { myZone?: Record<string, unknown> } };
      }).auth.dashboard.myZone as
        | {
            actionsHeading: string;
            incompleteStatus: string;
            readyStatus: string;
            improvesHeading: string;
            actions: Record<string, { title: string; desc: string }>;
            improves: Record<string, string>;
          }
        | undefined;
      expect(z, `${loc} auth.dashboard.myZone`).toBeTruthy();
      const z2 = z!;
      for (const v of [
        z2.actionsHeading,
        z2.incompleteStatus,
        z2.readyStatus,
        z2.improvesHeading,
      ]) {
        expect(v?.trim().length, `${loc} headline`).toBeGreaterThan(0);
        expect(BAD.test(v), `${loc} headline "${v}"`).toBe(false);
      }
      for (const k of ACTION_KEYS) {
        expect(z2.actions[k]?.title?.trim().length, `${loc} actions.${k}.title`).toBeGreaterThan(0);
      }
      for (const k of IMPROVE_KEYS) {
        expect(z2.improves[k]?.trim().length, `${loc} improves.${k}`).toBeGreaterThan(0);
      }
    });
  }
});
