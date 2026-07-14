import { describe, expect, it } from "vitest";

import {
  resolveActiveOrganizationId,
  shouldOfferOrganizationSwitch,
  type SwitchableOrganization,
} from "./organization-switch";

const org = (id: string): SwitchableOrganization => ({ id, name: `Org ${id}` });

describe("shouldOfferOrganizationSwitch (company architecture v1)", () => {
  it("no organizations → no switcher (honest empty state)", () => {
    expect(shouldOfferOrganizationSwitch([])).toBe(false);
  });

  it("SINGLE organization → no switcher (no fake multi-tenancy chrome)", () => {
    expect(shouldOfferOrganizationSwitch([org("a")])).toBe(false);
  });

  it("two or more organizations → switcher offered", () => {
    expect(shouldOfferOrganizationSwitch([org("a"), org("b")])).toBe(true);
    expect(
      shouldOfferOrganizationSwitch([org("a"), org("b"), org("c")]),
    ).toBe(true);
  });
});

describe("resolveActiveOrganizationId (membership-validated)", () => {
  const orgs = [org("first"), org("second"), org("third")];

  it("stored pointer matching a membership wins", () => {
    expect(resolveActiveOrganizationId(orgs, "second")).toBe("second");
  });

  it("null pointer falls back to the FIRST membership (oldest org — matches the migration backfill default)", () => {
    expect(resolveActiveOrganizationId(orgs, null)).toBe("first");
  });

  it("STALE / FOREIGN pointer never wins — falls back to the first membership", () => {
    expect(resolveActiveOrganizationId(orgs, "not-a-membership")).toBe("first");
  });

  it("no memberships → null (never a fabricated organization)", () => {
    expect(resolveActiveOrganizationId([], null)).toBeNull();
    expect(resolveActiveOrganizationId([], "anything")).toBeNull();
  });
});
