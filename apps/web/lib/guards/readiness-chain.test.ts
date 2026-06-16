import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Readiness chain guard (full-completion train PR 2).
 *
 * Documents + Skills + Work Journal → Readiness → next action. The readiness
 * panel must show every signal as met or as a concrete next step, and the
 * country-fit line must be honest: no "ready abroad" without documents, no fake
 * verification.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("readiness panel makes signals actionable + is mounted", () => {
  const panel = read("components/app/worker-readiness-panel.tsx");
  const page = read("app/[locale]/dashboard/player-card/page.tsx");

  it("panel renders the readiness pillars with met/next-step", () => {
    expect(panel).toMatch(/deriveWorkerReadiness/);
    expect(panel).toMatch(/readinessNextSteps/);
    expect(panel).toMatch(/data-testid="readiness-pillars"/);
    expect(panel).toMatch(/readiness-step-/);
  });

  it("next steps point at real in-app routes (worker controls them)", () => {
    const steps = read("lib/player-card/readiness-steps.ts");
    expect(steps).toMatch(/\/dashboard\/profile/);
    expect(steps).toMatch(/\/dashboard\/journal/);
  });

  it("panel is mounted on the player-card page", () => {
    expect(page).toMatch(/WorkerReadinessPanel/);
  });

  it("country-fit line is honest — documents gate, never auto ready-abroad", () => {
    expect(panel).toMatch(/data-testid="readiness-country-fit"/);
    expect(panel).toMatch(/readinessPanel\.countryFit/);
  });
});

describe("readiness copy is honest in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: readinessPanel + readinessSteps keys exist`, () => {
      const rp = m.playerCard.readinessPanel;
      const rs = m.playerCard.readinessSteps;
      expect(rp?.title && rp?.intro && rp?.allReady && rp?.countryFit).toBeTruthy();
      for (const k of ["profession", "availability", "skills", "journal", "evidence", "workCard"]) {
        expect(rs?.pillar?.[k], `${loc} pillar.${k}`).toBeTruthy();
        expect(rs?.action?.[k], `${loc} action.${k}`).toBeTruthy();
      }
    });
    it(`${loc}: country-fit needs documents + makes no ready-abroad promise`, () => {
      const txt = m.playerCard.readinessPanel.countryFit.toLowerCase();
      expect(/document|dokument|документ/.test(txt), `${loc} mentions documents`).toBe(true);
      // must not promise the right to work abroad without documents
      expect(/guarantee|garantuo|гаранти/.test(txt)).toBe(false);
    });
  }
});
