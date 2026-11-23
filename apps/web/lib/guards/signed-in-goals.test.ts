import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PUBLIC_INTENT_IDS } from "@/lib/navigation/public-intents";
import {
  SIGNED_IN_GOAL_FUNCTIONS,
  signedInGoals,
  type GoalAdmission,
} from "@/lib/navigation/signed-in-goals";

/**
 * THE SIX GOALS, SIGNED IN (owner P0 2026-11-23: all six goals reachable on
 * public and signed-in screens, functions adapted to the role;
 * CAROUSEL_NAVIGATION_SPEC OD-1 (a), step N4).
 */
const APP_ROOT = resolve(__dirname, "..", "..");
const LOCALE_ROOT = join(APP_ROOT, "app", "[locale]");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const en = JSON.parse(read("messages/en.json")) as Record<string, unknown>;

function pageExists(href: string): boolean {
  if (href.startsWith("/#")) return true; // a fragment of the landing
  const path = href.replace(/[?#].*$/, "").replace(/^\/+/, "");
  return [join(LOCALE_ROOT, path, "page.tsx"), join(LOCALE_ROOT, "(marketing)", path, "page.tsx")].some((c) =>
    existsSync(c),
  );
}
const messageAt = (key: string): unknown =>
  key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), en);

const WORKER: GoalAdmission = { heldRoles: ["worker"], opensCompanySpace: false, education: false };
const EMPLOYER: GoalAdmission = { heldRoles: ["company"], opensCompanySpace: true, education: false };
const INSTITUTION: GoalAdmission = { heldRoles: [], opensCompanySpace: true, education: true };
const CUSTOMER: GoalAdmission = { heldRoles: ["customer"], opensCompanySpace: false, education: false };
const NOBODY: GoalAdmission = { heldRoles: [], opensCompanySpace: false, education: false };
const ids = (a: GoalAdmission, goal: string) =>
  signedInGoals(a).find((g) => g.id === goal)!.functions.map((f) => f.id);

describe("all six goals for every role", () => {
  it.each([["worker", WORKER], ["employer", EMPLOYER], ["institution", INSTITUTION], ["customer", CUSTOMER], ["nobody", NOBODY]] as const)(
    "%s: the six public goals in the public order, none empty",
    (_name, admission) => {
      const goals = signedInGoals(admission);
      expect(goals.map((g) => g.id)).toEqual([...PUBLIC_INTENT_IDS]);
      for (const g of goals) expect(g.functions.length, g.id).toBeGreaterThan(0);
    },
  );
});

describe("functions adapted to the role, never a page that turns the person away", () => {
  it("a worker gets their own steps, never an organization's area", () => {
    expect(ids(WORKER, "work")).toEqual(expect.arrayContaining(["area-world", "area-journal", "area-cv"]));
    for (const goal of PUBLIC_INTENT_IDS) {
      expect(ids(WORKER, goal).filter((id) => id.startsWith("area-") && !["area-world", "area-journal", "area-cv", "area-profile", "area-numbers", "area-gallery"].includes(id))).toEqual([]);
    }
  });

  it("the opportunities station is the worker's (its route is worker-gated)", () => {
    expect(ids(EMPLOYER, "work")).not.toContain("area-world");
  });

  it("an employer's Find workers opens the need, candidates and people first", () => {
    expect(ids(EMPLOYER, "workers").slice(0, 3)).toEqual(["area-need", "area-candidates", "area-people"]);
  });

  it("the education area needs the capability; the customer door needs the role", () => {
    expect(ids(EMPLOYER, "partners")).not.toContain("area-education");
    expect(ids(INSTITUTION, "partners")).toContain("area-education");
    expect(ids(WORKER, "contractors")).not.toContain("area-buyer");
    expect(ids(CUSTOMER, "contractors")[0]).toBe("area-buyer");
  });

  it("no operator route, and each route once per goal", () => {
    for (const a of [WORKER, EMPLOYER, INSTITUTION, CUSTOMER]) {
      for (const g of signedInGoals(a)) {
        expect(g.functions.some((f) => f.href.startsWith("/dashboard/admin"))).toBe(false);
        const paths = g.functions.map((f) => (f.href.startsWith("/#") ? f.href : f.href.split(/[?#]/)[0]));
        expect(new Set(paths).size, g.id).toBe(paths.length);
      }
    }
  });
});

describe("every card is a real, existing step with a real label", () => {
  it("each href is an existing page (or a landing fragment) and each label exists in en", () => {
    for (const goal of PUBLIC_INTENT_IDS) {
      for (const fn of SIGNED_IN_GOAL_FUNCTIONS[goal]) {
        expect(pageExists(fn.href), `${goal}/${fn.id} → ${fn.href}`).toBe(true);
        expect(typeof messageAt(fn.labelKey), `${goal}/${fn.id} label ${fn.labelKey}`).toBe("string");
      }
    }
  });

  it("the homes mount the one navigator, never a second goal list", () => {
    const screen = read("components/app/today/today-screen.tsx");
    const company = read("components/app/organization/company-model-screen.tsx");
    expect(screen).toMatch(/<SignedInGoalNavigation \/>/);
    expect(company).toMatch(/<SignedInGoalNavigation \/>/);
    const wrapper = read("components/navigation/signed-in-goal-navigation.tsx");
    expect(wrapper).toMatch(/<GoalNavigation ownFunctions=\{own\} \/>/);
    expect(read("lib/navigation/signed-in-goals.ts")).not.toMatch(/PUBLIC_INTENT_IDS = |const .*GOAL_IDS/);
  });
});

describe("the main action stays on the first screen (owner P0 2026-11-07, Lane A/M review of N4)", () => {
  const before = (src: string, a: string, b: string) => {
    const i = src.indexOf(a);
    const j = src.indexOf(b);
    expect(i, a).toBeGreaterThan(-1);
    expect(j, b).toBeGreaterThan(-1);
    return i < j;
  };

  it("the worker home: regions (the one primary action) → goals → stations", () => {
    const src = read("components/app/today/today-screen.tsx");
    expect(before(src, 'data-testid="today-regions"', "<SignedInGoalNavigation")).toBe(true);
    expect(before(src, "<SignedInGoalNavigation", 'data-testid="today-stations"')).toBe(true);
  });

  it("the company home: title → approvals → primary action → goals → area switcher", () => {
    const src = read("components/app/organization/company-model-screen.tsx");
    expect(before(src, "<h2", "<OrganizationApprovalsCard")).toBe(true);
    expect(before(src, "<OrganizationApprovalsCard", 'testId="company-model-primary"')).toBe(true);
    expect(before(src, 'testId="company-model-primary"', "<SignedInGoalNavigation")).toBe(true);
    expect(before(src, "<SignedInGoalNavigation", "<AreaSwitcher")).toBe(true);
  });
});
