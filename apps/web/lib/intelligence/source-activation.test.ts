import { describe, it, expect } from "vitest";

import {
  ACTIVATION_REQUIREMENT_IDS,
  buildOwnerActivationChecklist,
  EMPTY_ACTIVATION_FACTS,
  evaluateActivationReadiness,
  type SourceActivationFactsV1,
} from "./source-activation";
import {
  getSourceProfile,
  INTELLIGENCE_SOURCE_PROFILES,
} from "./source-governance";

const CVBANKAS = getSourceProfile("cvbankas_salary")!;

/** A fully collected fact set — what the owner process would produce. */
const COMPLETE_FACTS: SourceActivationFactsV1 = {
  ownerApprovedAtIso: "2026-08-01T10:00:00Z",
  ownerApprovalNote: "approved after terms call",
  technicalApprovedAtIso: "2026-08-01T09:00:00Z",
  termsReviewedAtIso: "2026-07-30T09:00:00Z",
  robotsStatus: "allows",
  rateLimit: {
    maxRequestsPerHour: 10,
    maxBytesPerFetch: 500_000,
    maxItemsPerSession: 200,
  },
  importPolicy: {
    metricKeys: ["salary.month.gross"],
    countries: ["LT"],
    languages: ["lt"],
    maxSessionsPerDay: 1,
  },
  retention: { observationTtlDays: 180, expiredHandling: "mark_expired" },
  rollbackPlanRef: "docs/intelligence/source-activation-playbook-v1.md#rollback",
  killSwitch: { implemented: true, testedAtIso: "2026-08-01T09:30:00Z" },
  killSwitchEngaged: false,
};

describe("evaluateActivationReadiness — ten requirements, all mandatory", () => {
  it("today's empty facts: NOTHING is ready, every requirement itemized", () => {
    for (const profile of INTELLIGENCE_SOURCE_PROFILES) {
      if (profile.sourceKind === "internal_aggregated") continue;
      const readiness = evaluateActivationReadiness(
        profile,
        EMPTY_ACTIVATION_FACTS,
      );
      // With NO recorded facts nothing is ready (even eurostat, whose
      // legal_approval is met by its confirmed profile, still lacks
      // owner/technical/rate/policy/… facts).
      expect(readiness.ready, profile.key).toBe(false);
      expect(readiness.requirements.map((r) => r.id)).toEqual([
        ...ACTIVATION_REQUIREMENT_IDS,
      ]);
      // Every FACT-based requirement is unsatisfied under empty facts. The
      // activated eurostat profile additionally greens legal_approval (a
      // profile fact, not an activation fact), so it alone has one satisfied.
      const satisfied = readiness.requirements.filter((r) => r.satisfied);
      if (profile.legalStatus === "confirmed") {
        // A provider that has confirmed its terms greens legal_approval (a
        // PROFILE fact) and nothing else. eurostat has done so since
        // 2026-07-15; arbetsformedlingen since 2026-08-04. Neither is ready:
        // owner/technical/rate/policy facts are all still missing.
        expect(satisfied.map((r) => r.id), profile.key).toEqual([
          "legal_approval",
        ]);
      } else {
        expect(satisfied.length, profile.key).toBe(0);
      }
    }
  });

  it("complete facts still NOT ready while legal status is unconfirmed", () => {
    // cvbankas profile has legalStatus "unconfirmed" (guard-pinned) — even
    // a full fact set cannot make it ready without the legal confirmation.
    const readiness = evaluateActivationReadiness(CVBANKAS, COMPLETE_FACTS);
    expect(readiness.ready).toBe(false);
    const legal = readiness.requirements.find(
      (r) => r.id === "legal_approval",
    )!;
    expect(legal.satisfied).toBe(false);
  });

  it("ready = all ten satisfied and no veto (simulated confirmed profile)", () => {
    const confirmed = { ...CVBANKAS, legalStatus: "confirmed" as const };
    const readiness = evaluateActivationReadiness(confirmed, COMPLETE_FACTS);
    expect(readiness.requirements.every((r) => r.satisfied)).toBe(true);
    expect(readiness.vetoCodes).toEqual([]);
    expect(readiness.ready).toBe(true);
  });

  it("each missing fact individually blocks readiness", () => {
    const confirmed = { ...CVBANKAS, legalStatus: "confirmed" as const };
    const withouts: Partial<SourceActivationFactsV1>[] = [
      { ownerApprovedAtIso: null },
      { technicalApprovedAtIso: null },
      { termsReviewedAtIso: null },
      { robotsStatus: "not_checked" },
      { rateLimit: null },
      { importPolicy: null },
      { retention: null },
      { rollbackPlanRef: null },
      { killSwitch: { implemented: true, testedAtIso: null } }, // untested
      { killSwitch: { implemented: false, testedAtIso: "2026-08-01T00:00:00Z" } },
    ];
    for (const without of withouts) {
      const readiness = evaluateActivationReadiness(confirmed, {
        ...COMPLETE_FACTS,
        ...without,
      });
      expect(readiness.ready, JSON.stringify(without)).toBe(false);
    }
  });

  it("an import policy naming metrics unknown to the platform never greens readiness", () => {
    const confirmed = { ...CVBANKAS, legalStatus: "confirmed" as const };
    const readiness = evaluateActivationReadiness(confirmed, {
      ...COMPLETE_FACTS,
      importPolicy: {
        ...COMPLETE_FACTS.importPolicy!,
        metricKeys: ["salary.month.gross", "made.up.metric"],
      },
    });
    expect(readiness.ready).toBe(false);
    expect(
      readiness.requirements.find((r) => r.id === "import_policy")!.satisfied,
    ).toBe(false);
  });

  it("robots 'not_applicable' greens ONLY official statistics APIs", () => {
    // A public-web source can never wave robots away as irrelevant…
    const confirmedWeb = { ...CVBANKAS, legalStatus: "confirmed" as const };
    const web = evaluateActivationReadiness(confirmedWeb, {
      ...COMPLETE_FACTS,
      robotsStatus: "not_applicable",
    });
    expect(web.ready).toBe(false);
    expect(
      web.requirements.find((r) => r.id === "robots_check")!.satisfied,
    ).toBe(false);
    // …while an official statistics API may record the documented exemption.
    const official = {
      ...getSourceProfile("stat_gov_lt")!,
      legalStatus: "confirmed" as const,
    };
    const officialReadiness = evaluateActivationReadiness(official, {
      ...COMPLETE_FACTS,
      robotsStatus: "not_applicable",
    });
    expect(
      officialReadiness.requirements.find((r) => r.id === "robots_check")!
        .satisfied,
    ).toBe(true);
  });

  it("vetoes outrank a complete fact set", () => {
    const confirmed = { ...CVBANKAS, legalStatus: "confirmed" as const };
    // Engaged kill switch.
    expect(
      evaluateActivationReadiness(confirmed, {
        ...COMPLETE_FACTS,
        killSwitchEngaged: true,
      }),
    ).toMatchObject({
      ready: false,
      vetoCodes: ["intelligence.activation.veto.killSwitchEngaged"],
    });
    // Robots disallow can never be approved around.
    const robots = evaluateActivationReadiness(confirmed, {
      ...COMPLETE_FACTS,
      robotsStatus: "disallows",
    });
    expect(robots.ready).toBe(false);
    expect(robots.vetoCodes).toContain(
      "intelligence.activation.veto.robotsDisallow",
    );
    // Legal refusal is a veto, not merely a red item.
    const refused = evaluateActivationReadiness(
      { ...CVBANKAS, legalStatus: "refused" as const },
      COMPLETE_FACTS,
    );
    expect(refused.ready).toBe(false);
    expect(refused.vetoCodes).toContain(
      "intelligence.activation.veto.legalRefused",
    );
  });

  it("internal sources never take the external activation path", () => {
    const internal = getSourceProfile("internal_platform_aggregates")!;
    const readiness = evaluateActivationReadiness(internal, COMPLETE_FACTS);
    expect(readiness.ready).toBe(false);
    expect(readiness.vetoCodes).toContain(
      "intelligence.activation.veto.internalSource",
    );
  });
});

describe("buildOwnerActivationChecklist — one reusable checklist", () => {
  it("defaults to the honest zero-state: every item red, nothing allowed", () => {
    const checklist = buildOwnerActivationChecklist(CVBANKAS);
    expect(checklist.items).toHaveLength(10);
    expect(checklist.items.every((i) => i.status === "red")).toBe(true);
    expect(checklist.activationAllowed).toBe(false);
    for (const item of checklist.items) {
      expect(item.labelCode).toBe(`intelligence.activation.item.${item.id}`);
      expect(item.detailCode).toMatch(/\.missing$/);
    }
  });

  it("activationAllowed only when every item is green", () => {
    const confirmed = { ...CVBANKAS, legalStatus: "confirmed" as const };
    const checklist = buildOwnerActivationChecklist(confirmed, COMPLETE_FACTS);
    expect(checklist.items.every((i) => i.status === "green")).toBe(true);
    expect(checklist.activationAllowed).toBe(true);
    // One red item → not allowed.
    const oneRed = buildOwnerActivationChecklist(confirmed, {
      ...COMPLETE_FACTS,
      rollbackPlanRef: null,
    });
    expect(oneRed.items.filter((i) => i.status === "red")).toHaveLength(1);
    expect(oneRed.activationAllowed).toBe(false);
  });
});
