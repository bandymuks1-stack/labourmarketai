import { describe, it, expect } from "vitest";

import {
  EUROSTAT_ACTIVATION_FACTS,
  EUROSTAT_METRIC_IMPORT_POLICY,
} from "./eurostat-activation-facts";
import {
  evaluateActivationReadiness,
  buildOwnerActivationChecklist,
} from "./source-activation";
import {
  getSourceProfile,
  type IntelligenceSourceProfile,
} from "./source-governance";
import { EUROSTAT_METRIC_KEYS } from "./eurostat-source-v1";
import { isKnownMetricKey } from "./metric-keys";
import {
  buildEurostatContextCards,
  EUROSTAT_KIND_DATASET,
} from "./trust-card-model";

const EUROSTAT = getSourceProfile("eurostat")!;

/** The profile as it would look AFTER the owner activation step (confirmed +
 *  on + policy recorded) — used to prove the recorded facts green all ten
 *  gates. The shipped registry profile stays OFF (asserted separately). */
const ACTIVATED_PROFILE: IntelligenceSourceProfile = {
  ...EUROSTAT,
  legalStatus: "confirmed",
  activation: "on",
  importPolicy: EUROSTAT_METRIC_IMPORT_POLICY,
};

describe("Eurostat activation facts", () => {
  it("the recorded metric policy is exactly the four Eurostat labour metrics", () => {
    expect([...EUROSTAT_METRIC_IMPORT_POLICY.metricKeys].sort()).toEqual(
      [...EUROSTAT_METRIC_KEYS].sort(),
    );
    for (const k of EUROSTAT_METRIC_IMPORT_POLICY.metricKeys) {
      expect(isKnownMetricKey(k)).toBe(true);
    }
  });

  it("the shipped eurostat profile is still OFF (facts do not activate it)", () => {
    expect(EUROSTAT.activation).toBe("off");
    expect(EUROSTAT.legalStatus).toBe("unconfirmed");
    expect(EUROSTAT.importPolicy).toBeNull();
  });

  it("with the OFF profile, legal_approval is NOT satisfied (honest red gate)", () => {
    const readiness = evaluateActivationReadiness(EUROSTAT, EUROSTAT_ACTIVATION_FACTS);
    expect(readiness.ready).toBe(false);
    const legal = readiness.requirements.find((r) => r.id === "legal_approval");
    expect(legal?.satisfied).toBe(false);
  });

  it("all TEN gates green once the owner confirms legal status (post-activation profile)", () => {
    const readiness = evaluateActivationReadiness(ACTIVATED_PROFILE, EUROSTAT_ACTIVATION_FACTS);
    expect(readiness.vetoCodes).toEqual([]);
    for (const r of readiness.requirements) {
      expect(r.satisfied, r.id).toBe(true);
    }
    expect(readiness.ready).toBe(true);

    const checklist = buildOwnerActivationChecklist(ACTIVATED_PROFILE, EUROSTAT_ACTIVATION_FACTS);
    expect(checklist.activationAllowed).toBe(true);
    for (const item of checklist.items) {
      expect(item.status, item.id).toBe("green");
    }
  });

  it("Eurostat context cards are honest unavailable cards while the source is off", () => {
    const cards = buildEurostatContextCards();
    expect(cards.length).toBe(4);
    for (const card of cards) {
      expect(card.status).toBe("unavailable");
      expect(card.report).toBeNull();
      expect(card.unavailable).not.toBeNull();
      // names eurostat as the disabled source, never a placeholder number
      expect(card.unavailable!.disabledSourceKeys).toContain("eurostat");
      expect(card.headlineCode).toBeNull();
      // every context kind maps to a real Eurostat dataset code
      expect(
        EUROSTAT_KIND_DATASET[card.kind as keyof typeof EUROSTAT_KIND_DATASET],
      ).toBeTruthy();
    }
  });

  it("an engaged kill switch vetoes readiness even with every gate green", () => {
    const readiness = evaluateActivationReadiness(ACTIVATED_PROFILE, {
      ...EUROSTAT_ACTIVATION_FACTS,
      killSwitchEngaged: true,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.vetoCodes).toContain(
      "intelligence.activation.veto.killSwitchEngaged",
    );
  });
});
