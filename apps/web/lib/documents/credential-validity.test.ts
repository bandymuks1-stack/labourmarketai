import { describe, expect, it } from "vitest";

import {
  deriveCredentialValidity,
  historyEverVerified,
} from "./credential-validity";

const NOW = new Date("2026-09-02T12:00:00Z");

describe("deriveCredentialValidity — current state, never history", () => {
  it("verified inside its window → active, since the reviewer's decision", () => {
    expect(
      deriveCredentialValidity(
        { verification: "verified", validUntil: "2027-01-31", verifiedAt: "2026-08-01T09:00:00Z", everVerified: true },
        NOW,
      ),
    ).toEqual({ state: "active", since: "2026-08-01T09:00:00Z", daysToExpiry: 151 });
  });

  it("valid_until passed → expired, whatever the review said (verified, pending, unverified)", () => {
    for (const verification of ["verified", "pending", "unverified", "rejected"] as const) {
      const v = deriveCredentialValidity(
        { verification, validUntil: "2026-08-31", verifiedAt: null, everVerified: false },
        NOW,
      );
      expect(v.state, verification).toBe("expired");
      expect(v.since).toBe("2026-08-31");
      expect(v.daysToExpiry).toBeLessThan(0);
    }
  });

  it("valid through the END of the valid_until day (UTC)", () => {
    const v = deriveCredentialValidity(
      { verification: "verified", validUntil: "2026-09-02", verifiedAt: null, everVerified: true },
      NOW,
    );
    expect(v.state).toBe("active");
    expect(v.daysToExpiry).toBe(0);
  });

  it("rejected after having been verified → revoked; rejected without a prior verification → rejected", () => {
    const base = { verification: "rejected" as const, validUntil: null, verifiedAt: "2026-09-01T08:00:00Z" };
    expect(deriveCredentialValidity({ ...base, everVerified: true }, NOW).state).toBe("revoked");
    expect(deriveCredentialValidity({ ...base, everVerified: false }, NOW).state).toBe("rejected");
  });

  it("pending / unverified / unreadable axis are their own honest states", () => {
    expect(
      deriveCredentialValidity({ verification: "pending", validUntil: null, verifiedAt: null, everVerified: false }, NOW).state,
    ).toBe("pending");
    expect(
      deriveCredentialValidity({ verification: "unverified", validUntil: null, verifiedAt: null, everVerified: false }, NOW).state,
    ).toBe("unverified");
    expect(
      deriveCredentialValidity({ verification: null, validUntil: null, verifiedAt: null, everVerified: false }, NOW).state,
    ).toBe("unknown");
  });

  it("a garbage valid_until never throws and never claims expiry", () => {
    const v = deriveCredentialValidity(
      { verification: "verified", validUntil: "not-a-date", verifiedAt: null, everVerified: true },
      NOW,
    );
    expect(v.state).toBe("active");
    expect(v.daysToExpiry).toBeNull();
  });
});

describe("historyEverVerified — reads the append-only trail, tolerates any shape", () => {
  it("true when any event's after_state carries verification=verified", () => {
    expect(
      historyEverVerified([
        { after_state: { verification: "pending" } },
        { after_state: { verification: "verified" } },
        { after_state: { verification: "rejected" } },
      ]),
    ).toBe(true);
  });

  it("false for no events, null after_state, or non-verified decisions only", () => {
    expect(historyEverVerified(null)).toBe(false);
    expect(historyEverVerified([])).toBe(false);
    expect(historyEverVerified([{ after_state: null }, { after_state: "x" }, { after_state: { status: "ready" } }])).toBe(false);
  });
});
