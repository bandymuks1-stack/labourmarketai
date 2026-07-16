import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Marketplace intent separation guard (v1).
 *
 * Buyer/client marketplace requests, company/employer hiring, and agency
 * candidate supply are DISTINCT intents. The dashboard must not blur them into
 * one vague "poreikis / need", and company hiring must never be presented as a
 * generic buyer flow by default. Also bans an English fallback on LT surfaces.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

// The vague phrases the spec bans from dashboard CTA / buyer surfaces.
const BANNED_LT = [
  "Pateikti poreikį",
  "Tvarkyti poreikius",
  "Jūsų poreikių erdvė",
  "Poreikių erdvė",
];

describe("vague 'poreikis' CTA wording is gone from the dashboard namespace", () => {
  const dash = JSON.stringify(lt.auth.dashboard);
  for (const phrase of BANNED_LT) {
    it(`auth.dashboard contains no "${phrase}"`, () => {
      expect(dash).not.toContain(phrase);
    });
  }
});

describe("buyer chain-action wording uses 'užklausa', not 'poreikis'", () => {
  it("LT buyerTitle/buyerRequests are request-based", () => {
    const ca = lt.auth.dashboard.chainActions;
    expect(ca.buyerTitle).toBe("Pirkėjo užklausos");
    expect(ca.buyerRequests).toBe("Mano užklausos");
    expect(`${ca.buyerTitle} ${ca.buyerSubtitle} ${ca.buyerRequests} ${ca.buyerRequestsDesc}`).not.toMatch(/poreik/i);
  });
  it("EN buyer wording is request-based", () => {
    const ca = en.auth.dashboard.chainActions;
    expect(ca.buyerTitle).toBe("Buyer requests");
    expect(ca.buyerRequests).toBe("My requests");
  });
});

describe("company hiring is NOT presented as a generic buyer 'poreikis' by default", () => {
  it("pilot copy is intent-specific (hire vs partner), not a single generic 'need' CTA", () => {
    for (const locale of [lt, en]) {
      const pilot = locale.auth.dashboard.wow.demand;
      expect(pilot.hire?.cta, "hire cta").toBeTruthy();
      expect(pilot.partner?.cta, "partner cta").toBeTruthy();
      // No single top-level generic cta/title remains.
      expect(pilot.cta, "no generic pilot.cta").toBeUndefined();
      expect(pilot.title, "no generic pilot.title").toBeUndefined();
    }
  });
  it("LT hire CTA uses hiring language and contains no 'poreik'", () => {
    const hire = lt.auth.dashboard.wow.demand.hire;
    expect(`${hire.title} ${hire.body} ${hire.cta} ${hire.done}`).not.toMatch(/poreik/i);
    expect(hire.cta).toBe("Sukurti darbo pasiūlymą");
  });
  it("company flow terminal step is a hiring action, not 'Pateikti poreikį'", () => {
    expect(lt.auth.dashboard.wow.flow.company.c4).toBe("Sukurti darbo pasiūlymą");
    expect(lt.auth.dashboard.wow.flow.company.c4).not.toMatch(/poreik/i);
  });
  it("the pilot button selects copy by intent", () => {
    const btn = read("components/app/demand-request-button.tsx");
    expect(btn).toMatch(/intent === "hire_workers" \? "hire" : "partner"/);
    expect(btn).toMatch(/\$\{key\}\.cta/);
  });
});

describe("no English fallback string on LT submissions", () => {
  it("demand-request.ts writes the user's real description, no fabricated fallback", () => {
    const src = read("lib/demand/demand-request.ts");
    // No hardcoded English dashboard summary.
    expect(src).not.toContain("Demand submitted from the dashboard.");
    // The need summary is now the user's REAL, validated description — not a
    // fabricated LT or English placeholder string.
    expect(src).toMatch(/p_need_summary:\s*description/);
    // Empty needs are blocked, never written as a placeholder request.
    expect(src).toMatch(/empty_description/);
  });
});

describe("stepper + future modules clarity", () => {
  it("a static progress helper exists (LT + EN) and is rendered", () => {
    expect(lt.auth.dashboard.wow.demand.progressHelper).toMatch(/rodo eigą/);
    expect(en.auth.dashboard.wow.demand.progressHelper).toMatch(/show progress/);
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/journey-progress-helper/);
    expect(page).toMatch(/demand\.progressHelper/);
  });
  it("future-modules copy marks them as non-active modules", () => {
    expect(lt.dashboard.comingLater.title).toBe("Vėliau įjungiami moduliai");
    expect(lt.dashboard.comingLater.body).toMatch(/nėra aktyvūs veiksmai/);
    expect(en.dashboard.comingLater.title).toBe("Modules coming later");
  });
});
