import { describe, it, expect } from "vitest";

import {
  deriveSourceHealth,
  SOURCE_HEALTH_ERROR_THRESHOLD,
  SOURCE_HEALTH_STATES,
  sourceHealthLabelCode,
  type SourceHealthSignalsV1,
} from "./source-health";
import { INTELLIGENCE_SOURCE_PROFILES } from "./source-governance";
import { deriveSourceLifecycleState } from "./source-lifecycle";

const ACTIVE_BASE: SourceHealthSignalsV1 = {
  lifecycle: "active",
  lastSessionOutcome: null,
  consecutiveFailures: null,
};

describe("deriveSourceHealth — deterministic precedence", () => {
  it("lifecycle facts dominate: blocked > maintenance > paused > waiting", () => {
    expect(
      deriveSourceHealth({ ...ACTIVE_BASE, lifecycle: "blocked", maintenance: true }),
    ).toBe("blocked");
    expect(
      deriveSourceHealth({ ...ACTIVE_BASE, maintenance: true }),
    ).toBe("maintenance");
    expect(deriveSourceHealth({ ...ACTIVE_BASE, lifecycle: "paused" })).toBe(
      "paused",
    );
    expect(deriveSourceHealth({ ...ACTIVE_BASE, lifecycle: "proposed" })).toBe(
      "waiting_approval",
    );
    expect(deriveSourceHealth({ ...ACTIVE_BASE, lifecycle: "approved" })).toBe(
      "waiting_approval",
    );
    expect(
      deriveSourceHealth({ ...ACTIVE_BASE, lifecycle: "deprecated" }),
    ).toBe("offline");
    expect(
      deriveSourceHealth({ ...ACTIVE_BASE, lifecycle: "not_available" }),
    ).toBe("offline");
  });

  it("active source: recorded unreachability → offline", () => {
    expect(deriveSourceHealth({ ...ACTIVE_BASE, reachable: false })).toBe(
      "offline",
    );
  });

  it("active source: failure signals → error", () => {
    expect(
      deriveSourceHealth({ ...ACTIVE_BASE, lastSessionOutcome: "failed" }),
    ).toBe("error");
    expect(
      deriveSourceHealth({
        ...ACTIVE_BASE,
        lastSessionOutcome: "success",
        consecutiveFailures: SOURCE_HEALTH_ERROR_THRESHOLD,
      }),
    ).toBe("error");
    expect(
      deriveSourceHealth({
        ...ACTIVE_BASE,
        lastSessionOutcome: "success",
        consecutiveFailures: SOURCE_HEALTH_ERROR_THRESHOLD - 1,
      }),
    ).toBe("healthy");
  });

  it("active source with a good last session → healthy (partial counts)", () => {
    expect(
      deriveSourceHealth({ ...ACTIVE_BASE, lastSessionOutcome: "success" }),
    ).toBe("healthy");
    expect(
      deriveSourceHealth({ ...ACTIVE_BASE, lastSessionOutcome: "partial" }),
    ).toBe("healthy");
  });

  it("active source with NO recorded signals → honest unknown, never healthy", () => {
    expect(deriveSourceHealth(ACTIVE_BASE)).toBe("unknown");
  });

  it("today's registry: every external source waits, internal are unknown", () => {
    for (const profile of INTELLIGENCE_SOURCE_PROFILES) {
      const health = deriveSourceHealth({
        lifecycle: deriveSourceLifecycleState(profile),
        lastSessionOutcome: null,
        consecutiveFailures: null,
      });
      if (profile.sourceKind === "internal_aggregated" || profile.key === "eurostat") {
        // Active lifecycle (internal, or the activated eurostat) but no
        // recorded import session yet → "unknown" is the honest answer.
        expect(health, profile.key).toBe("unknown");
      } else {
        expect(health, profile.key).toBe("waiting_approval");
      }
    }
  });
});

describe("health labels", () => {
  it("all eight states carry stable intelligence.health.* codes", () => {
    expect(SOURCE_HEALTH_STATES).toHaveLength(8);
    for (const state of SOURCE_HEALTH_STATES) {
      expect(sourceHealthLabelCode(state)).toMatch(
        /^intelligence\.health\.[a-zA-Z]+$/,
      );
    }
    expect(sourceHealthLabelCode("waiting_approval")).toBe(
      "intelligence.health.waitingApproval",
    );
  });
});
