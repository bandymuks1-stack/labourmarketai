import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isContactAuthority, issueContactAuthority } from "./contact-authority";
import type { ContactPermissionState } from "./communication-eligibility";

describe("contact authority — proof that the §8.1 gate held", () => {
  it("is minted from a permitting gate result and recognised", () => {
    const a = issueContactAuthority("allowed_engagement");
    expect(a).not.toBeNull();
    expect(isContactAuthority(a)).toBe(true);
    expect(a?.permission).toBe("allowed_engagement");
  });

  it("mints nothing for no_permission, null or undefined (default-closed)", () => {
    expect(issueContactAuthority("no_permission")).toBeNull();
    expect(issueContactAuthority(null)).toBeNull();
    expect(issueContactAuthority(undefined)).toBeNull();
  });

  it("ADVERSARIAL: a look-alike object is not an authority (identity, not shape)", () => {
    const forged = { permission: "allowed_engagement" };
    expect(isContactAuthority(forged)).toBe(false);
    // the deserialised shape a browser could send through a server action
    expect(isContactAuthority(JSON.parse(JSON.stringify(issueContactAuthority("allowed_engagement"))))).toBe(false);
    // a spread copy of a REAL authority is a different object, not an authority
    const real = issueContactAuthority("allowed_scouting_shortlist");
    expect(isContactAuthority({ ...real })).toBe(false);
  });

  it("ADVERSARIAL: junk values are not authorities", () => {
    for (const v of [null, undefined, true, 1, "allowed_engagement", [], () => 0, Symbol("x")]) {
      expect(isContactAuthority(v as unknown)).toBe(false);
    }
  });

  it("an authority cannot be edited into a different permission", () => {
    const a = issueContactAuthority("allowed_engagement" as ContactPermissionState)!;
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => {
      (a as { permission: string }).permission = "allowed_admin";
    }).toThrow();
  });
});
