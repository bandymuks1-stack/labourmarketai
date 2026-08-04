import { describe, it, expect } from "vitest";

import {
  allExternalSourcesOff,
  EXTERNAL_ACTIVATION_ALL_OFF,
  getSourceProfile,
  INTELLIGENCE_SOURCE_PROFILES,
  isExternalSourceActive,
} from "./source-governance";

describe("intelligence source governance", () => {
  it("eurostat is the only activated external source; the aggregate flags reflect it", () => {
    // eurostat activated 2026-07-15 (owner) → not all-off anymore.
    expect(allExternalSourcesOff()).toBe(false);
    expect(EXTERNAL_ACTIVATION_ALL_OFF).toBe(false);
    expect(isExternalSourceActive("eurostat")).toBe(true);
  });

  it("every external profile EXCEPT eurostat is INACTIVE", () => {
    // The invariant is inactivity. Legal status is a separate fact about the
    // provider, and it changes when a provider actually answers us —
    // arbetsformedlingen confirmed its terms on 2026-08-04 and is therefore
    // `confirmed` + `owner_review`, still importing nothing.
    const external = INTELLIGENCE_SOURCE_PROFILES.filter(
      (p) => p.sourceKind !== "internal_aggregated" && p.key !== "eurostat",
    );
    expect(external.length).toBeGreaterThan(0);
    for (const p of external) {
      expect(isExternalSourceActive(p.key), p.key).toBe(false);
      expect(p.activation, p.key).not.toBe("on");
    }
  });

  it("a source that has NOT answered us stays unconfirmed, off and proposed-only", () => {
    const unanswered = INTELLIGENCE_SOURCE_PROFILES.filter(
      (p) => p.sourceKind !== "internal_aggregated" && p.proposedOnly,
    );
    expect(unanswered.length).toBeGreaterThan(0);
    for (const p of unanswered) {
      expect(p.legalStatus, p.key).toBe("unconfirmed");
      expect(p.activation, p.key).toBe("off");
      expect(p.importPolicy, p.key).toBeNull();
    }
  });

  it("arbetsformedlingen: provider-confirmed, awaiting OUR activation", () => {
    const p = getSourceProfile("arbetsformedlingen");
    expect(p).not.toBeNull();
    expect(p!.legalStatus).toBe("confirmed");
    expect(p!.proposedOnly).toBe(false);
    expect(p!.activation).toBe("owner_review");
    expect(p!.attributionRequired).toBe(true);
    expect(isExternalSourceActive("arbetsformedlingen")).toBe(false);
  });

  it("eurostat profile is confirmed, on, not proposed-only, with a recorded policy", () => {
    const p = getSourceProfile("eurostat");
    expect(p).not.toBeNull();
    expect(p!.activation).toBe("on");
    expect(p!.legalStatus).toBe("confirmed");
    expect(p!.proposedOnly).toBe(false);
    expect(p!.importPolicy).not.toBeNull();
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
