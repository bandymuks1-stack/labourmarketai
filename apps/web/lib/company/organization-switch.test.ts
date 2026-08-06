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

  it("null pointer with SEVERAL memberships FAILS CLOSED to null (M-P0-5 — no first/oldest inference)", () => {
    expect(resolveActiveOrganizationId(orgs, null)).toBeNull();
  });

  it("null pointer with EXACTLY ONE membership defaults to it (unambiguous)", () => {
    expect(
      resolveActiveOrganizationId([{ id: "only", name: "Only" }], null),
    ).toBe("only");
  });

  it("STALE / FOREIGN pointer never wins — several memberships fail closed to null", () => {
    expect(resolveActiveOrganizationId(orgs, "not-a-membership")).toBeNull();
    expect(
      resolveActiveOrganizationId([{ id: "only", name: "Only" }], "stale"),
    ).toBe("only");
  });

  it("no memberships → null (never a fabricated organization)", () => {
    expect(resolveActiveOrganizationId([], null)).toBeNull();
    expect(resolveActiveOrganizationId([], "anything")).toBeNull();
  });
});
