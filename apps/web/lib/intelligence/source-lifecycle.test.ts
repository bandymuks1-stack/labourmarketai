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
  it("today's registry: internal sources are active, every external is proposed", () => {
    for (const p of INTELLIGENCE_SOURCE_PROFILES) {
      const state = deriveSourceLifecycleState(p);
      if (p.sourceKind === "internal_aggregated") {
        expect(state, p.key).toBe("active");
      } else {
        expect(state, p.key).toBe("proposed");
      }
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
