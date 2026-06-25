import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Personal Command Center guard (full-completion train PR 6).
 *
 * The dashboard "Mano erdvė" entry (IdentityActions) must give a person a
 * complete set of real quick actions — including their Player Card and
 * Communication — all pointing at real in-app routes. Person and Company stay
 * the only base identities (no agency/buyer identity).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const comp = read("components/app/identity-actions.tsx");

describe("command center exposes the person's complete quick actions", () => {
  it("person actions are the true next-actions (profile, find work, readiness)", () => {
    // Player card is no longer a separate person action — it leads the Mano CV
    // surface. Map (Žemėlapis) + Messages (Žinutės) are top-nav tabs, so they
    // are NOT duplicated here as generic dashboard tiles (IA cleanup).
    for (const route of [
      "/dashboard/profile",
      "/dashboard/opportunities",
      "/dashboard/documents",
    ]) {
      expect(comp, route).toContain(route);
    }
    // No competing player-card destination, and no top-nav duplicates as tiles.
    expect(comp).not.toContain("/dashboard/player-card");
    expect(comp).not.toContain('href: "/dashboard/communication"');
    expect(comp).not.toContain('href: "/dashboard/market-map"');
  });
  it("the company / commercial channel groups the commercial actions", () => {
    // One compact channel (not a scatter of peer tiles); the shared layer
    // (map + messages) lives in the primary nav, not repeated as company tiles.
    expect(comp).toMatch(/COMMERCIAL_ACTIONS/);
    expect(comp).toMatch(/CompanyChannel/);
  });
  it("renders real Link cards (app-like), not a table", () => {
    expect(comp).toMatch(/<Link/);
    expect(comp).not.toMatch(/<table\b/);
  });
});

describe("command center copy exists in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: person playerCard + communication, company communication`, () => {
      const a = JSON.parse(read(`messages/${loc}.json`)).identityActions;
      expect(a.person.actions.playerCard?.title, `${loc} playerCard`).toBeTruthy();
      expect(a.person.actions.communication?.title, `${loc} person comm`).toBeTruthy();
      expect(a.company.actions.communication?.title, `${loc} company comm`).toBeTruthy();
    });
  }
});
