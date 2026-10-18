import { describe, expect, it } from "vitest";

import {
  CONTACT_PERMISSION_STATES,
  agencyConnectionSide,
  evaluateAgencyConnectionContact,
  evaluateContactPermission,
  isContactPermitted,
} from "@/lib/communication/communication-eligibility";

/**
 * `allowed_agency_connection` (2026-09-24) — the agency ↔ client bridge's
 * one mutual consent as a contact permission. Pure and default-closed:
 * only an ACTIVE connection, and only for a caller whose own company is one
 * of its two parties.
 */
const AGENCY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("evaluateAgencyConnectionContact — positive", () => {
  it("the agency side of an active connection may open the conversation", () => {
    const facts = {
      connectionStatus: "active",
      callerCompanyId: AGENCY,
      agencyCompanyId: AGENCY,
      clientCompanyId: CLIENT,
    };
    expect(evaluateAgencyConnectionContact(facts)).toBe("allowed");
    expect(agencyConnectionSide(facts)).toBe("agency");
  });

  it("the client side of the same active connection may open it too", () => {
    const facts = {
      connectionStatus: "active",
      callerCompanyId: CLIENT,
      agencyCompanyId: AGENCY,
      clientCompanyId: CLIENT,
    };
    expect(evaluateAgencyConnectionContact(facts)).toBe("allowed");
    expect(agencyConnectionSide(facts)).toBe("client");
  });
});

describe("evaluateAgencyConnectionContact — negative controls", () => {
  it("an inactive connection grants nothing to either side", () => {
    for (const status of ["pending", "declined", "revoked", null, undefined, ""]) {
      expect(
        evaluateAgencyConnectionContact({
          connectionStatus: status,
          callerCompanyId: AGENCY,
          agencyCompanyId: AGENCY,
          clientCompanyId: CLIENT,
        }),
        String(status),
      ).toBe("connection_not_active");
      expect(
        evaluateAgencyConnectionContact({
          connectionStatus: status,
          callerCompanyId: CLIENT,
          agencyCompanyId: AGENCY,
          clientCompanyId: CLIENT,
        }),
        String(status),
      ).toBe("connection_not_active");
    }
  });

  it("another organization — even one the row can be read by — is not a party", () => {
    const facts = {
      connectionStatus: "active",
      callerCompanyId: OTHER,
      agencyCompanyId: AGENCY,
      clientCompanyId: CLIENT,
    };
    expect(evaluateAgencyConnectionContact(facts)).toBe("not_a_party");
    expect(agencyConnectionSide(facts)).toBeNull();
  });

  it("a caller with no company context is not a party (default-closed)", () => {
    for (const caller of [null, undefined, "", "   "]) {
      expect(
        evaluateAgencyConnectionContact({
          connectionStatus: "active",
          callerCompanyId: caller,
          agencyCompanyId: AGENCY,
          clientCompanyId: CLIENT,
        }),
        String(caller),
      ).toBe("not_a_party");
    }
  });

  it("a pending row with no client company yet is not active AND has no client side", () => {
    const facts = {
      connectionStatus: "pending",
      callerCompanyId: CLIENT,
      agencyCompanyId: AGENCY,
      clientCompanyId: null,
    };
    expect(evaluateAgencyConnectionContact(facts)).toBe("connection_not_active");
    expect(agencyConnectionSide(facts)).toBeNull();
  });

  it("status is checked before party: a non-party on an inactive row reads inactive", () => {
    expect(
      evaluateAgencyConnectionContact({
        connectionStatus: "revoked",
        callerCompanyId: OTHER,
        agencyCompanyId: AGENCY,
        clientCompanyId: CLIENT,
      }),
    ).toBe("connection_not_active");
  });
});

describe("allowed_agency_connection is a grant-only member of the enumeration", () => {
  it("is enumerated and permits contact", () => {
    expect(CONTACT_PERMISSION_STATES).toContain("allowed_agency_connection");
    expect(isContactPermitted("allowed_agency_connection")).toBe(true);
  });

  it("NEGATIVE: the generic resolver never mints it from generic facts", () => {
    for (const sharesConversation of [true, false]) {
      for (const hasEngagement of [true, false]) {
        for (const scoutingAllowed of [true, false]) {
          for (const isAdmin of [true, false]) {
            expect(
              evaluateContactPermission({
                sharesConversation,
                hasEngagement,
                scoutingAllowed,
                isAdmin,
              }),
            ).not.toBe("allowed_agency_connection");
          }
        }
      }
    }
  });
});
