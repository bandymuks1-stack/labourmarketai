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

  it("the shipped eurostat profile is now ACTIVATED (confirmed, on, policy recorded)", () => {
    expect(EUROSTAT.activation).toBe("on");
    expect(EUROSTAT.legalStatus).toBe("confirmed");
    expect(EUROSTAT.importPolicy).not.toBeNull();
  });

  it("the shipped eurostat profile greens all TEN activation gates with the recorded facts", () => {
    const readiness = evaluateActivationReadiness(EUROSTAT, EUROSTAT_ACTIVATION_FACTS);
    expect(readiness.vetoCodes).toEqual([]);
    for (const r of readiness.requirements) {
      expect(r.satisfied, r.id).toBe(true);
    }
    expect(readiness.ready).toBe(true);
  });

  it("all TEN gates green (explicit post-activation profile)", () => {
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

  it("Eurostat context cards are honest unavailable cards when NO observations exist yet", () => {
    const cards = buildEurostatContextCards(); // no rows
    expect(cards.length).toBe(4);
    for (const card of cards) {
      expect(card.status).toBe("unavailable");
      expect(card.report).toBeNull();
      expect(card.unavailable).not.toBeNull();
      expect(card.headlineCode).toBeNull();
      // honest four-answer state, never a placeholder number
      expect(card.unavailable!.reasonCode).toMatch(/^intelligence\.trustCard\.reason\./);
      expect(card.unavailable!.requirementCode).toMatch(
        /^intelligence\.trustCard\.requirement\./,
      );
      expect(
        EUROSTAT_KIND_DATASET[card.kind as keyof typeof EUROSTAT_KIND_DATASET],
      ).toBeTruthy();
    }
  });

  it("Eurostat context cards become READY with a real observation (attributed, traceable)", () => {
    const rows = [
      {
        metricKey: "labour.unemployment_rate",
        subjectId: "EU27_2020",
        valueNumeric: 5.9,
        unit: "pc_act",
        windowStart: "2026-05-01",
        windowEnd: "2026-05-31",
        capturedAt: "2026-07-02T21:00:00.000Z",
        contentHash: "hash_une_eu",
      },
    ];
    const cards = buildEurostatContextCards(rows, Date.parse("2026-07-10T00:00:00Z"));
    const une = cards.find((c) => c.kind === "eurostat_unemployment")!;
    expect(une.status).toBe("ready");
    expect(une.report).not.toBeNull();
    // the number is traceable to its real observation, sourced to eurostat
    expect(une.report!.observationRefs).toEqual(["hash_une_eu"]);
    expect(une.report!.sourceKeys).toEqual(["eurostat"]);
    expect(une.headlineCode).toBe(
      "intelligence.eurostat.headline.unemploymentRate",
    );
    expect(une.headlineParams.value).toBe(5.9);
    // the other three metrics have no row → still honest unavailable
    const emp = cards.find((c) => c.kind === "eurostat_employment")!;
    expect(emp.status).toBe("unavailable");
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
