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
  // Mano CV surface (the player-card identity + work records live here now;
  // /dashboard/player-card redirects to it).
  const page = read("app/[locale]/dashboard/journal/page.tsx");

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

  it("panel is mounted on the Mano CV surface", () => {
    expect(page).toMatch(/WorkerReadinessPanel/);
  });

  it("country-fit line is honest — documents gate, never auto ready-abroad", () => {
    expect(panel).toMatch(/data-testid="readiness-country-fit"/);
    expect(panel).toMatch(/readinessPanel\.countryFit/);
  });

  it("the documents caveat is rendered in BOTH branches, not only the incomplete one", () => {
    // OWNER-REPORTED CONTRADICTION, 2026-09-07. The panel told a worker their
    // profile was complete while another surface reported missing documents.
    // Neither surface was lying: `deriveWorkerReadiness` measures six
    // PROFILE-CARD pillars and documents are not one of them. What made two
    // honest statements read as a contradiction is that this panel takes an
    // EARLY RETURN when all six pillars are met, and the country-fit line -
    // the single sentence that explains documents are a separate axis - lived
    // only in the branch below it. The caveat vanished at exactly the moment
    // the claim was largest.
    //
    // The guard above could not catch that: it asks whether the file mentions
    // the line ANYWHERE, and one occurrence satisfied it. This one splits the
    // component at the complete-branch return and requires the line on BOTH
    // sides, so re-introducing the defect fails here rather than in production.
    // Normalised first: the working tree is CRLF on Windows and LF in CI, and
    // a guard that only holds on one of them is worse than no guard.
    const src = panel.replace(/\r\n/g, "\n");
    const marker = "  }\n\n  return (";
    const cut = src.indexOf(marker);
    expect(cut, "the complete-branch early return should still be there").toBeGreaterThan(0);
    const completeBranch = src.slice(0, cut);
    const incompleteBranch = src.slice(cut);
    for (const [name, half] of [
      ["complete branch", completeBranch],
      ["incomplete branch", incompleteBranch],
    ] as const) {
      expect(half, `${name} renders the country-fit line`).toContain(
        'data-testid="readiness-country-fit"',
      );
      expect(half, `${name} uses the countryFit copy`).toContain("readinessPanel.countryFit");
    }
  });

  it("the all-ready claim names its scope instead of claiming the whole profile", () => {
    // The copy may say the CARD is complete; it may not say the person is.
    // Every active locale must also point at documents as a separate matter,
    // so the sentence cannot drift back into a universal claim in one language
    // while staying scoped in another.
    for (const loc of ["lt", "en", "ru", "de", "nl"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const allReady: string = m.playerCard.readinessPanel.allReady;
      expect(
        /document|dokument|документ/i.test(allReady),
        `${loc}: the all-ready line must name documents as separate`,
      ).toBe(true);
    }
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
