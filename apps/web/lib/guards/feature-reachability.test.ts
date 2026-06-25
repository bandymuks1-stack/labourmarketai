import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Feature reachability guard (slice feature-reachability-v1).
 *
 * The routes shipped by F4/F5/F (worker player-card, manager projects, work
 * instructions) are not primary nav tabs (the primary nav is capped at 4 to
 * avoid mobile crowding). They MUST stay reachable via the secondary account
 * menu, role-gated, without disturbing the account link / logout.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const menu = read("components/app/account-menu.tsx");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

describe("the account menu makes the shipped routes reachable, role-gated", () => {
  it("no longer carries a competing player-card link (Mano CV is a primary nav tab)", () => {
    // Marketplace IA: the player-card identity leads the Mano CV surface, which
    // is a primary nav tab — so the account menu must NOT expose a separate
    // /dashboard/player-card destination.
    expect(menu).not.toMatch(/href:\s*"\/dashboard\/player-card"/);
    expect(menu).toMatch(/activeRole === "worker"/);
  });
  it("links to projects (manager only)", () => {
    expect(menu).toMatch(/href:\s*"\/dashboard\/projects"/);
    expect(menu).toMatch(/isManager/);
    expect(menu).toMatch(/testid:\s*"account-menu-projects-link"/);
  });
  it("renders each feature link with its data-testid", () => {
    expect(menu).toMatch(/data-testid=\{l\.testid\}/);
  });
  it("links to instructions (both roles)", () => {
    expect(menu).toMatch(/href:\s*"\/dashboard\/instructions"/);
  });
});

describe("reachability is additive — account link + logout untouched", () => {
  it("still links to /dashboard/account and posts logout", () => {
    expect(menu).toMatch(/href="\/dashboard\/account"/);
    expect(menu).toMatch(/action=\{`\/\$\{locale\}\/auth\/logout`\}/);
  });
});

describe("menu link labels present in LT + EN (no hardcoded strings)", () => {
  it("uses t('menuLinks.*')", () => {
    expect(menu).toMatch(/t\("menuLinks\.projects"\)/);
    expect(menu).toMatch(/t\("menuLinks\.instructions"\)/);
  });
  it("both locales define every menu link label", () => {
    for (const [name, j] of [["lt", lt], ["en", en]] as const) {
      const m = j.auth.dashboard.menuLinks;
      for (const k of ["playerCard", "projects", "instructions"]) {
        expect(m?.[k], `${name}.menuLinks.${k}`).toBeTruthy();
      }
    }
  });
});
