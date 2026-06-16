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
  it("person actions include profile, player card, find work, readiness, communication", () => {
    for (const route of [
      "/dashboard/profile",
      "/dashboard/player-card",
      "/dashboard/opportunities",
      "/dashboard/documents",
      "/dashboard/communication",
    ]) {
      expect(comp, route).toContain(route);
    }
  });
  it("company actions include a communication entry", () => {
    expect(comp).toMatch(/key:\s*"communication"[\s\S]*?\/dashboard\/communication/);
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
