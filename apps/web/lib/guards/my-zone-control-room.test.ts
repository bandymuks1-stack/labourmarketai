import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mano erdvė control-room guard (action-first-product-logic-v1).
 *
 * The worker home (`/dashboard`) must be the simple action-first control room:
 * a readiness status, the few real fast actions ("Ką galite padaryti dabar"),
 * and one "Kas ką gerina" explanation — NOT a wall of loosely related cards and
 * NOT a pile of duplicate profile/CV/player-card/evidence doors. This guard
 * freezes that so the home cannot regress into clutter or fakery.
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

describe("the worker home is the MyZone control room (no card wall)", () => {
  it("mounts MyZone with the real readiness + company state", () => {
    expect(PAGE).toMatch(/<MyZone\b/);
    expect(PAGE).toMatch(/incomplete=\{isFirstUse\}/);
    expect(PAGE).toMatch(/hasCompany=\{hasCompany\}/);
  });
  it("dropped the old loose stack (identity strip / today screen / first-use panel)", () => {
    // The company branch may still use IdentityActions; the WORKER home must not
    // re-stack the old clutter components.
    expect(PAGE).not.toMatch(/<TodayScreen\b/);
    expect(PAGE).not.toMatch(/<DashboardFirstUsePanel\b/);
  });
});

describe("MyZone carries status + fast actions + what-improves-what", () => {
  it("a single readiness status (information complete or not yet)", () => {
    expect(COMP).toMatch(/testid="my-zone-status"/); // StatusChip (audit PR8)
    expect(COMP).toMatch(/incompleteStatus/);
    expect(COMP).toMatch(/readyStatus/);
  });
  it("the human fast actions point at the real routes", () => {
    const expectations: Array<[string, string]> = [
      ["recordWork", "/dashboard/journal"],
      ["improveProfile", "/dashboard/profile"],
      ["mapVisibility", "/dashboard/market-map"],
      ["checkMessages", "/dashboard/communication"],
      ["companyActions", "/dashboard/company"],
    ];
    for (const [key, href] of expectations) {
      expect(COMP, `${key} action`).toContain(`"${key}"`);
      expect(COMP, `${key} -> ${href}`).toContain(`"${href}"`);
    }
  });
  it("company actions are conditional on a real company", () => {
    expect(COMP).toMatch(/hasCompany\s*\?\s*\[\.\.\.BASE_ACTIONS,\s*COMPANY_ACTION\]/);
  });
  it("renders the 'what improves what' explanation", () => {
    expect(COMP).toMatch(/data-testid="my-zone-improves"/);
    expect(COMP).toMatch(/improvesHeading/);
  });
});

describe("no duplicate / fake / preview / admin surfaces in the control room", () => {
  it("only ONE profile door — no separate player-card / cv / evidence cards", () => {
    expect(COMP).not.toContain("/dashboard/player-card");
    expect(COMP).not.toContain("/dashboard/cv");
    expect(COMP).not.toContain("/dashboard/reports/evidence");
  });
  it("no sample/preview destinations", () => {
    expect(COMP).not.toMatch(/\/dashboard\/(talent|visual-os|design)/);
    expect(COMP_CODE).not.toMatch(/sample|preview|concept/i);
  });
  it("no admin/internal/module wording in the component", () => {
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
