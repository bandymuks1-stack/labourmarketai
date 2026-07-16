import { describe, expect, it } from "vitest";

import { DISCLOSABLE_FIELDS } from "./consent-definitions";
import {
  CONTACT_DISCLOSURE_FIELD_WHITELIST,
  DEFAULT_CONTACT_REQUEST_FIELDS,
  isContactDisclosureStatus,
  validateRequestedFields,
} from "./contact-disclosure-shared";

describe("contact-disclosure field whitelist", () => {
  it("is EXACTLY the applied consent-ledger whitelist (no drift)", () => {
    expect([...CONTACT_DISCLOSURE_FIELD_WHITELIST]).toEqual([
      ...DISCLOSABLE_FIELDS,
    ]);
  });

  it("default ask is data-minimised to the contact channels only", () => {
    expect([...DEFAULT_CONTACT_REQUEST_FIELDS]).toEqual([
      "full_name",
      "phone",
      "email",
    ]);
    for (const f of DEFAULT_CONTACT_REQUEST_FIELDS) {
      expect(CONTACT_DISCLOSURE_FIELD_WHITELIST).toContain(f);
    }
  });
});

describe("validateRequestedFields — fail closed", () => {
  it("accepts a clean whitelisted list", () => {
    expect(validateRequestedFields(["phone", "email"])).toEqual([
      "phone",
      "email",
    ]);
  });

  it("rejects non-arrays, empty, oversized, duplicated and unknown fields", () => {
    expect(validateRequestedFields(null)).toBeNull();
    expect(validateRequestedFields("phone")).toBeNull();
    expect(validateRequestedFields([])).toBeNull();
    expect(validateRequestedFields(Array(8).fill("phone"))).toBeNull();
    expect(validateRequestedFields(["phone", "phone"])).toBeNull();
    expect(validateRequestedFields(["phone", "home_address"])).toBeNull();
    expect(validateRequestedFields([42])).toBeNull();
  });

  it("never returns a partially-cleaned list", () => {
    expect(validateRequestedFields(["phone", "not-a-field"])).toBeNull();
  });
});

describe("isContactDisclosureStatus", () => {
  it("accepts only the SHARED-CONTRACT status set (created→accepted|declined|withdrawn|expired)", () => {
    for (const s of ["created", "accepted", "declined", "withdrawn", "expired"]) {
      expect(isContactDisclosureStatus(s)).toBe(true);
    }
    // delivered/viewed are EVENT types, never statuses (shared contract).
    expect(isContactDisclosureStatus("delivered")).toBe(false);
    expect(isContactDisclosureStatus("viewed")).toBe(false);
    expect(isContactDisclosureStatus("pending")).toBe(false);
    expect(isContactDisclosureStatus("granted")).toBe(false);
    expect(isContactDisclosureStatus(null)).toBe(false);
  });
});
