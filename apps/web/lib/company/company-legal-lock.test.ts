import { describe, expect, it } from "vitest";
import { resolveCompanyLegalParams } from "./company-legal-lock";

/**
 * Pure tests for the verified-legal lock: a normal user can never silently
 * overwrite a VERIFIED company's legal-registry fields (legal name,
 * registration code, country, address). Contacts/type/website stay editable
 * (handled elsewhere in saveCompanySetup).
 */
describe("resolveCompanyLegalParams — verified legal lock", () => {
  const verified = {
    legalName: "Acme UAB",
    country: "LT",
    registrationCode: "123456789",
    address: "Gedimino pr. 1, Vilnius",
  };

  it("uses the user input when the company is NOT verified", () => {
    const r = resolveCompanyLegalParams({
      inputLegalName: "  New Co  ",
      inputCountry: " lt ",
      inputRegistrationCode: " 999 ",
      inputAddress: " Some st 2 ",
      verified: null,
    });
    expect(r.locked).toBe(false);
    expect(r.legalName).toBe("New Co");
    expect(r.country).toBe("LT"); // trimmed + upper-cased
    expect(r.registrationCode).toBe("999");
    expect(r.address).toBe("Some st 2");
  });

  it("normalizes empty optionals to null when not verified", () => {
    const r = resolveCompanyLegalParams({
      inputLegalName: "Co",
      inputCountry: "",
      inputRegistrationCode: "  ",
      inputAddress: undefined,
      verified: null,
    });
    expect(r.country).toBeNull();
    expect(r.registrationCode).toBeNull();
    expect(r.address).toBeNull();
  });

  it("LOCKS legal fields to stored values when verified — input is ignored", () => {
    const r = resolveCompanyLegalParams({
      inputLegalName: "Hacked Name",
      inputCountry: "PL",
      inputRegistrationCode: "000",
      inputAddress: "Different address",
      verified,
    });
    expect(r.locked).toBe(true);
    expect(r.legalName).toBe("Acme UAB");
    expect(r.country).toBe("LT");
    expect(r.registrationCode).toBe("123456789");
    expect(r.address).toBe("Gedimino pr. 1, Vilnius");
  });

  it("never overwrites verified legal data even with blank input", () => {
    const r = resolveCompanyLegalParams({
      inputLegalName: "",
      inputCountry: "",
      inputRegistrationCode: "",
      inputAddress: "",
      verified,
    });
    expect(r.legalName).toBe("Acme UAB");
    expect(r.country).toBe("LT");
    expect(r.registrationCode).toBe("123456789");
    expect(r.address).toBe("Gedimino pr. 1, Vilnius");
  });
});
