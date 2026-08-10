import { describe, it, expect } from "vitest";

import {
  deriveSourceLifecycleState,
  SOURCE_LIFECYCLE_STATES,
  sourceLifecycleLabelCode,
} from "./source-lifecycle";
import { INTELLIGENCE_SOURCE_PROFILES } from "./source-governance";

const EXTERNAL_UNCONFIRMED = {
  sourceKind: "public_official" as const,
  legalStatus: "unconfirmed" as const,
  activation: "off" as const,
};

describe("deriveSourceLifecycleState — deterministic precedence", () => {
  it("today's registry: internal + eurostat + arbetsformedlingen active, the rest proposed", () => {
    // Arbetsförmedlingen moved `approved` → `active` with the owner's
    // 2026-08-09 activation decision
    // (docs/human-gates/arbetsformedlingen-activation-gate.md). Terms were
    // confirmed 2026-08-04 (CC0, keyless, no prior notification).
    for (const p of INTELLIGENCE_SOURCE_PROFILES) {
      const state = deriveSourceLifecycleState(p);
      if (
        p.sourceKind === "internal_aggregated" ||
        p.key === "eurostat" ||
        p.key === "arbetsformedlingen"
      ) {
        expect(state, p.key).toBe("active");
      } else {
        expect(state, p.key).toBe("proposed");
      }
    }
  });

  it("no source outside internal + the owner-activated externals reaches `active`", () => {
    const active = INTELLIGENCE_SOURCE_PROFILES.filter(
      (p) => deriveSourceLifecycleState(p) === "active",
    );
    for (const p of active) {
      expect(
        p.sourceKind === "internal_aggregated" ||
          p.key === "eurostat" ||
          p.key === "arbetsformedlingen",
        `${p.key} unexpectedly active`,
      ).toBe(true);
    }
  });

  it("refused legal status → blocked (regardless of activation)", () => {
    expect(
      deriveSourceLifecycleState({
        ...EXTERNAL_UNCONFIRMED,
        legalStatus: "refused",
      }),
    ).toBe("blocked");
    expect(
      deriveSourceLifecycleState({
        ...EXTERNAL_UNCONFIRMED,
        legalStatus: "refused",
        activation: "on",
      }),
    ).toBe("blocked");
  });

  it("confirmed but not on → approved; confirmed + on → active", () => {
    expect(
      deriveSourceLifecycleState({
        ...EXTERNAL_UNCONFIRMED,
        legalStatus: "confirmed",
      }),
    ).toBe("approved");
    expect(
      deriveSourceLifecycleState({
        ...EXTERNAL_UNCONFIRMED,
        legalStatus: "confirmed",
        activation: "owner_review",
      }),
    ).toBe("approved");
    expect(
      deriveSourceLifecycleState({
        ...EXTERNAL_UNCONFIRMED,
        legalStatus: "confirmed",
        activation: "on",
      }),
    ).toBe("active");
  });

  it("activation on WITHOUT legal confirmation never derives active", () => {
    expect(
      deriveSourceLifecycleState({
        ...EXTERNAL_UNCONFIRMED,
        activation: "on",
      }),
    ).toBe("proposed");
  });

  it("runtime facts: not_available > deprecated > blocked > paused", () => {
    const confirmedOn = {
      ...EXTERNAL_UNCONFIRMED,
      legalStatus: "confirmed" as const,
      activation: "on" as const,
    };
    expect(
      deriveSourceLifecycleState(confirmedOn, { available: false }),
    ).toBe("not_available");
    expect(
      deriveSourceLifecycleState(confirmedOn, {
        available: false,
        deprecated: true,
      }),
    ).toBe("not_available");
    expect(deriveSourceLifecycleState(confirmedOn, { deprecated: true })).toBe(
      "deprecated",
    );
    expect(deriveSourceLifecycleState(confirmedOn, { paused: true })).toBe(
      "paused",
    );
    expect(
      deriveSourceLifecycleState(
        { ...confirmedOn, legalStatus: "refused" },
        { paused: true },
      ),
    ).toBe("blocked");
  });

  it("absent runtime facts never manufacture a restriction", () => {
    expect(deriveSourceLifecycleState(EXTERNAL_UNCONFIRMED, {})).toBe(
      "proposed",
    );
  });
});

describe("lifecycle badge labels", () => {
  it("every state has a stable intelligence.lifecycle.* code", () => {
    expect(SOURCE_LIFECYCLE_STATES).toHaveLength(7);
    for (const state of SOURCE_LIFECYCLE_STATES) {
      expect(sourceLifecycleLabelCode(state)).toMatch(
        /^intelligence\.lifecycle\.[a-zA-Z]+$/,
      );
    }
    expect(sourceLifecycleLabelCode("not_available")).toBe(
      "intelligence.lifecycle.notAvailable",
    );
  });
});
