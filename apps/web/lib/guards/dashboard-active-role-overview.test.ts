import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Active-role overview clarity guard (slice dashboard-active-role-overview-v1).
 *
 * The /dashboard first screen shows ONLY the active role's primary path. The
 * other identity stays reachable via the role switcher / Manage spaces — it is
 * not duplicated on the overview, and the heavy explanation surfaces (journey
 * stage-rail, "starting point" banner, calm explanation note) are gone, so the
 * overview leads with one clear next action.
 *
 * Pure source + i18n assertions (no login session in CI). Invents nothing.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const page = read("app/[locale]/dashboard/advanced/page.tsx");
const identity = read("components/app/identity-actions.tsx");

describe("overview is focused to the active role", () => {
  it("the company overview mounts IdentityActions (focusRole); the worker overview is the MyZone control room", () => {
    // Action-first IA v1: the worker home is the MyZone control room (status +
    // fast actions + what-improves-what), not the loose IdentityActions strip.
    // The company/agency/customer branch keeps the focused IdentityActions.
    const hits = page.match(/<IdentityActions[^>]*focusRole=\{role\}/g) ?? [];
    expect(hits.length, "company branch IdentityActions").toBeGreaterThanOrEqual(1);
    expect(page, "worker branch mounts the MyZone control room").toMatch(/<MyZone\b/);
  });
  it("IdentityActions supports an active-role focus mode", () => {
    expect(identity).toMatch(/focusRole/);
    // Focus subsets: person actions + the commercial-channel subset per org role.
    expect(identity).toMatch(/FOCUS_PERSON/);
    expect(identity).toMatch(/FOCUS_COMMERCIAL/);
  });
  it("the non-active identity is reachable via Manage spaces, not duplicated", () => {
    expect(identity).toMatch(/data-testid="identity-manage-spaces"/);
    expect(identity).toMatch(/\/dashboard\/account/);
  });
});

describe("heavy explanation surfaces are gone from the overview", () => {
  it("no journey stage-rail component on the overview", () => {
    expect(page).not.toMatch(/JourneyRail/);
  });
  it("no 'starting point' explanation banner", () => {
    expect(page).not.toMatch(/startingPoint/);
  });
  it("no calm explanation note", () => {
    expect(page).not.toMatch(/company-calm-note/);
    expect(page).not.toMatch(/company\.calmNote/);
  });
});

describe("role-specific first screen", () => {
  it("worker focus excludes company machinery keys", () => {
    // Worker focus is the person-action subset (FOCUS_PERSON); commercial keys
    // live only in the company channel (FOCUS_COMMERCIAL).
    const m = identity.match(/FOCUS_PERSON[\s\S]*?\[([^\]]*)\]/);
    expect(m, "FOCUS_PERSON").toBeTruthy();
    const set = m?.[1] ?? "";
    for (const k of ["need", "hire", "buy", "offer", "projects"]) {
      expect(set, `worker focus must not include "${k}"`).not.toContain(`"${k}"`);
    }
  });
  it("buyer/customer focus excludes hire/offer/projects company machinery", () => {
    const m = identity.match(/customer:\s*\[([^\]]*)\]/);
    expect(m, "customer FOCUS_KEYS").toBeTruthy();
    const set = m?.[1] ?? "";
    for (const k of ["need", "hire", "offer", "projects"]) {
      expect(set, `customer focus must not include "${k}"`).not.toContain(`"${k}"`);
    }
  });
  it("buyer/customer does not get the hiring intake on the overview", () => {
    expect(page).toMatch(/role !== "customer"/);
    expect(page).toMatch(/data-testid="demand-intake-section"/);
  });
  it("company/agency keep one clear next action", () => {
    expect(page).toMatch(/<DashboardNextAction\b/);
  });
});

describe("no fake / dead affordances or banned wording on the overview surface", () => {
  it("no fake hrefs in page or identity component", () => {
    for (const src of [page, identity]) {
      expect(src).not.toMatch(/href="#"/);
      expect(src).not.toMatch(/href=""/);
      expect(src).not.toMatch(/javascript:/i);
    }
  });
  it("at most one inline primary CTA gradient on the overview page", () => {
    const hits = page.match(/from-brand-blue to-brand-cyan/g) ?? [];
    expect(hits.length).toBeLessThanOrEqual(1);
  });
  it("identityActions copy carries no fake/abroad/LABMA wording (lt/en/ru)", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const ia = JSON.stringify(JSON.parse(read(`messages/${loc}.json`)).identityActions);
      expect(ia).not.toMatch(/Ieškau darbo užsienyje/i);
      expect(ia).not.toMatch(/\bLABMA\b/);
      expect(ia).not.toMatch(/\d+\s*min ago|verified worker|guaranteed match/i);
    }
  });
  it("manageSpaces copy present in every active locale", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const ms = JSON.parse(read(`messages/${loc}.json`)).identityActions.manageSpaces;
      expect(typeof ms === "string" && ms.length > 0, `${loc} manageSpaces`).toBe(true);
    }
  });
});