import { describe, expect, it } from "vitest";

import {
  AGENCY_CLIENT_PROPOSED_ROLE,
  acceptedDestination,
  isAgencyClientInvitation,
  maskEmail,
} from "@/lib/invitations/model";

/**
 * The agency → client invitation rides on the ONE invitation primitive
 * (2026-09-24): `invite_company` marked by `proposed_role`. These pins keep
 * the marker closed, the landing honest and the masked addressee safe.
 */
describe("isAgencyClientInvitation — a closed marker, never a loose match", () => {
  it("true only for invite_company carrying the agency-client role", () => {
    expect(
      isAgencyClientInvitation({
        invitationType: "invite_company",
        proposedRole: AGENCY_CLIENT_PROPOSED_ROLE,
      }),
    ).toBe(true);
    // Surrounding whitespace on the stored value is tolerated, nothing else.
    expect(
      isAgencyClientInvitation({
        invitationType: "invite_company",
        proposedRole: ` ${AGENCY_CLIENT_PROPOSED_ROLE} `,
      }),
    ).toBe(true);
  });

  it("NEGATIVE: a plain company invitation, another type, or no role is not one", () => {
    expect(
      isAgencyClientInvitation({ invitationType: "invite_company", proposedRole: null }),
    ).toBe(false);
    expect(
      isAgencyClientInvitation({ invitationType: "invite_company", proposedRole: "client" }),
    ).toBe(false);
    expect(
      isAgencyClientInvitation({
        invitationType: "collaborate_partner",
        proposedRole: AGENCY_CLIENT_PROPOSED_ROLE,
      }),
    ).toBe(false);
    expect(isAgencyClientInvitation({ invitationType: undefined, proposedRole: undefined })).toBe(
      false,
    );
  });
});

describe("acceptedDestination — the agency-client invitation lands on the partners door", () => {
  it("routes the marked invitation to /dashboard/company/partners", () => {
    expect(
      acceptedDestination({
        invitationType: "invite_company",
        proposedRole: AGENCY_CLIENT_PROPOSED_ROLE,
      }),
    ).toBe("/dashboard/company/partners");
  });

  it("NEGATIVE: an unmarked invite_company keeps the historical destination", () => {
    expect(acceptedDestination({ invitationType: "invite_company" })).toBe("/dashboard");
    expect(
      acceptedDestination({ invitationType: "invite_company", proposedRole: "manager" }),
    ).toBe("/dashboard");
  });

  it("NEGATIVE: the marker cannot hijack another type's destination", () => {
    expect(
      acceptedDestination({
        invitationType: "join_project",
        projectId: "p1",
        proposedRole: AGENCY_CLIENT_PROPOSED_ROLE,
      }),
    ).toBe("/dashboard/projects/p1");
    expect(
      acceptedDestination({
        invitationType: "invite_to_demand",
        proposedRole: AGENCY_CLIENT_PROPOSED_ROLE,
      }),
    ).toBe("/dashboard/opportunities");
  });
});

describe("maskEmail — first character, the domain, nothing else", () => {
  it("masks the local part", () => {
    expect(maskEmail("client@example.com")).toBe("c***@example.com");
    expect(maskEmail("  Anna.B@Example.ORG ")).toBe("a***@example.org");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });

  it("NEGATIVE: never renders a non-address as one", () => {
    expect(maskEmail("")).toBeNull();
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
    expect(maskEmail("@example.com")).toBeNull();
    expect(maskEmail("nobody@")).toBeNull();
    expect(maskEmail("no-at-sign")).toBeNull();
  });

  it("never leaks more than one character of the local part", () => {
    const masked = maskEmail("verylonglocalpart@example.com") as string;
    expect(masked).toBe("v***@example.com");
    expect(masked).not.toContain("verylong");
  });
});
