import { describe, expect, it } from "vitest";
import { localizePseudonymousName, pseudonymToken } from "./pseudonymous-name";

describe("localizePseudonymousName — the RPC pseudonym reads in the viewer's language", () => {
  const lt = (token: string) => `Kandidatas ${token}`;
  it("rewrites the fixed English pseudonym with the catalogue word", () => {
    expect(localizePseudonymousName("Candidate 9E0952", lt)).toBe("Kandidatas 9E0952");
  });
  it("leaves a real name untouched", () => {
    expect(localizePseudonymousName("Jonas Jonaitis", lt)).toBe("Jonas Jonaitis");
    expect(localizePseudonymousName("Candidate Smith", lt)).toBe("Candidate Smith");
  });
  it("reads only the exact pseudonym shape", () => {
    expect(pseudonymToken("Candidate AB12CD")).toBe("AB12CD");
    expect(pseudonymToken("Candidate ab12cd")).toBeNull();
    expect(pseudonymToken("Candidate AB12CDE")).toBeNull();
  });
});
