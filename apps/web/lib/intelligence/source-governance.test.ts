import { describe, it, expect } from "vitest";

import {
  allExternalSourcesOff,
  EXTERNAL_ACTIVATION_ALL_OFF,
  getSourceProfile,
  INTELLIGENCE_SOURCE_PROFILES,
  isExternalSourceActive,
} from "./source-governance";

describe("intelligence source governance", () => {
  it("allExternalSourcesOff() is true today", () => {
    expect(allExternalSourcesOff()).toBe(true);
    expect(EXTERNAL_ACTIVATION_ALL_OFF).toBe(true);
  });

  it("every external profile is inactive, proposed-only and off", () => {
    const external = INTELLIGENCE_SOURCE_PROFILES.filter(
      (p) => p.sourceKind !== "internal_aggregated",
    );
    expect(external.length).toBeGreaterThan(0);
    for (const p of external) {
      expect(isExternalSourceActive(p.key), p.key).toBe(false);
      expect(p.activation, p.key).toBe("off");
      expect(p.legalStatus, p.key).toBe("unconfirmed");
      expect(p.proposedOnly, p.key).toBe(true);
    }
  });

  it("cvbankas is proposedOnly, off, and never confirmable from code", () => {
    const p = getSourceProfile("cvbankas_salary");
    expect(p).not.toBeNull();
    expect(p!.proposedOnly).toBe(true);
    expect(p!.activation).toBe("off");
    expect(p!.legalStatus).toBe("unconfirmed");
    expect(isExternalSourceActive("cvbankas_salary")).toBe(false);
  });

  it("internal sources are confirmed and on, but never 'externally active'", () => {
    for (const key of [
      "internal_platform_aggregates",
      "admin_market_rate_averages",
    ]) {
      const p = getSourceProfile(key);
      expect(p).not.toBeNull();
      expect(p!.sourceKind).toBe("internal_aggregated");
      expect(p!.legalStatus).toBe("confirmed");
      expect(p!.activation).toBe("on");
      // isExternalSourceActive is about EXTERNAL sources only.
      expect(isExternalSourceActive(key)).toBe(false);
    }
  });

  it("homepages are bare hostnames — this layer never builds fetchable URLs", () => {
    for (const p of INTELLIGENCE_SOURCE_PROFILES) {
      if (p.homepage !== null) {
        expect(p.homepage).not.toMatch(/^https?:\/\//);
      }
    }
  });

  it("getSourceProfile returns null for an unknown key", () => {
    expect(getSourceProfile("linkedin_salaries")).toBeNull();
  });
});
