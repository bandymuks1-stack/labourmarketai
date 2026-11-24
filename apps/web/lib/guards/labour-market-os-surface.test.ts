import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { PRIMARY_ROUTES } from "./primary-route-smoke";

/**
 * Labour Market OS surface guard (P10 — constitution §8 surface doctrine).
 *
 * Pins the workforce-planning zone's UI contract with source assertions:
 *
 *  a. the page COMPOSES lib/workforce — it never re-implements the model;
 *  b. no privileged client: the page/view read only through the caller's
 *     RLS-scoped service;
 *  c. no technical AI copy: no model-name literal in the page/view sources
 *     or the workforcePlanning EN/LT message values — and (owner directive
 *     2026-07-13) no COERCIVE phrasing: the recommendation is a suggestion,
 *     never a mandatory step;
 *  d. exactly ONE primary CTA (`planning-zone-primary-cta`) in the zone;
 *  e. the route is registered everywhere a real surface must be (module
 *     registry + primary-route smoke inventory);
 *  f. no dead controls: every <button in the new sources is a real submit
 *     control and links go through <Link href=…> — nothing button-shaped
 *     without an action.
 */

const APP_ROOT = join(__dirname, "..", "..");
const PAGE_REL = "app/[locale]/dashboard/company/planning/page.tsx";
const VIEW_REL = "lib/workforce/planning-zone-view.ts";
const ROUTE = "/dashboard/company/planning";

const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const page = () => read(PAGE_REL);
const view = () => read(VIEW_REL);

/** Model-name literals that would leak technical AI copy into the product. */
const MODEL_NAME_RE = /claude-|\bopus\b|\bsonnet\b|\bhaiku\b/i;
/** Coercive phrasing the zone must never use (suggestions, not commands). */
const COERCION_RE =
  /must start|privalote pradėti|required first|būtina pirmiausia/i;

describe("a. the page composes lib/workforce (no duplicate model)", () => {
  it("page + view exist", () => {
    expect(existsSync(join(APP_ROOT, PAGE_REL))).toBe(true);
    expect(existsSync(join(APP_ROOT, VIEW_REL))).toBe(true);
  });

  it("the page imports the workforce read service and the view model", () => {
    const src = page();
    expect(src).toMatch(/from "@\/lib\/workforce\/workforce"/);
    expect(src).toMatch(/from "@\/lib\/workforce\/planning-zone-view"/);
    // Never a second composition: the page must not query tables itself.
    expect(src).not.toMatch(/\.from\(\s*["']/);
    expect(src).not.toMatch(/createClient/);
  });

  it("the view composes the P1–P4 modules instead of re-deriving", () => {
    const src = view();
    expect(src).toMatch(/deriveWorkforceRequirements/);
    expect(src).toMatch(/assessCapacity/);
    expect(src).toMatch(/buildGapTimeline/);
    expect(src).toMatch(/recommendActions/);
  });
});

describe("b. no privileged client anywhere in the zone", () => {
  for (const rel of [PAGE_REL, VIEW_REL]) {
    it(`${rel} touches no admin/service-role client`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/supabase\/admin|createAdminClient/i);
      expect(src).not.toMatch(/service[-_]?role/i);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    });
  }
});

describe("c. no technical AI copy, no coercive phrasing", () => {
  it("no model-name literal in the page/view sources", () => {
    expect(MODEL_NAME_RE.test(page())).toBe(false);
    expect(MODEL_NAME_RE.test(view())).toBe(false);
  });

  const flatten = (node: unknown, acc: string[] = []): string[] => {
    if (typeof node === "string") acc.push(node);
    else if (node && typeof node === "object") {
      for (const v of Object.values(node)) flatten(v, acc);
    }
    return acc;
  };

  for (const locale of ["en", "lt"] as const) {
    it(`${locale}: workforcePlanning copy carries no model names and no coercion`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const ns = messages["workforcePlanning"];
      expect(ns, "workforcePlanning namespace must exist").toBeTruthy();
      for (const value of flatten(ns)) {
        expect(MODEL_NAME_RE.test(value), value).toBe(false);
        expect(COERCION_RE.test(value), value).toBe(false);
      }
    });
  }

  it("the negative controls bite", () => {
    expect(MODEL_NAME_RE.test("routed to claude-x")).toBe(true);
    expect(COERCION_RE.test("You must start from future work")).toBe(true);
    expect(COERCION_RE.test("Privalote pradėti nuo darbo poreikio")).toBe(true);
  });
});

describe("d. exactly ONE primary CTA in the zone", () => {
  it("the planning-zone-primary-cta testid literal appears exactly once in the sources", () => {
    // The page binds the literal once (its PrimaryCta component) and every
    // branch renders through that one component — a second literal means a
    // second competing primary CTA.
    const occurrences =
      (page().match(/"planning-zone-primary-cta"/g) ?? []).length +
      (view().match(/"planning-zone-primary-cta"/g) ?? []).length;
    expect(occurrences).toBe(1);
    // ...and the one literal is wired as a data-testid.
    expect(page()).toMatch(
      /const testid = "planning-zone-primary-cta";[\s\S]*data-testid=\{testid\}/,
    );
  });
});

describe("e. the route is registered as a real surface", () => {
  it("primary-route smoke inventory carries /dashboard/company/planning", () => {
    expect(PRIMARY_ROUTES.some((r) => r.urlPattern === ROUTE)).toBe(true);
  });

  it("the module registry resolves workforce_planning to the same route for org roles", () => {
    const m = DASHBOARD_MODULES.find((x) => x.id === "workforce_planning");
    expect(m).toBeTruthy();
    expect(getModuleRoute("workforce_planning")).toBe(ROUTE);
    expect([...(m?.roles ?? [])].sort()).toEqual(["agency", "company"]);
    expect(m?.surfaces).toContain("grid");
  });
});

describe("f. no dead controls in the new sources", () => {
  it("every <button is a real submit control (server-action forms)", () => {
    const src = page();
    for (const m of src.matchAll(/<button\b[^>]*>/g)) {
      const tag = m[0];
      expect(
        /type="submit"/.test(tag) || /onClick=/.test(tag),
        `button without an action: ${tag}`,
      ).toBe(true);
    }
  });

  it("no shared <Button component without a wired action, and no bare dead hrefs", () => {
    const src = page();
    // The zone uses Link + native submit buttons only — a <Button import
    // would need its own action audit; keep the surface simple.
    expect(src).not.toMatch(/<Button\b/);
    expect(src).not.toMatch(/href=\{?["']#?["']\}?/);
  });

  it("every Link href is a concrete route value (no empty targets)", () => {
    const src = page();
    for (const m of src.matchAll(/href=\{?"([^"]*)"/g)) {
      expect(m[1].length, `empty href in: ${m[0]}`).toBeGreaterThan(0);
    }
  });
});
