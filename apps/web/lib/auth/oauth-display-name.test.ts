import { describe, expect, it } from "vitest";

import {
  decideOauthDisplayNameRepair,
  pickProviderName,
} from "./oauth-display-name";

describe("pickProviderName", () => {
  it("prefers full_name, falls back to name, trims", () => {
    expect(pickProviderName({ full_name: "  Jonas Petraitis ", name: "J" })).toBe(
      "Jonas Petraitis",
    );
    expect(pickProviderName({ name: "Ona Kazlauskienė" })).toBe("Ona Kazlauskienė");
  });

  it("rejects e-mail-shaped, too short, too long, and non-string claims", () => {
    expect(pickProviderName({ full_name: "jonas@example.lt" })).toBeNull();
    expect(pickProviderName({ full_name: "J" })).toBeNull();
    expect(pickProviderName({ full_name: "x".repeat(121) })).toBeNull();
    expect(pickProviderName({ full_name: 42, name: null })).toBeNull();
    expect(pickProviderName(undefined)).toBeNull();
    expect(pickProviderName(null)).toBeNull();
  });

  it("skips a bad full_name and still takes a good name", () => {
    expect(pickProviderName({ full_name: "a@b.c", name: "Real Name" })).toBe("Real Name");
  });
});

describe("decideOauthDisplayNameRepair", () => {
  const meta = { full_name: "Jonas Petraitis" };

  it("repairs a stored name that equals the e-mail local part (synthetic)", () => {
    expect(
      decideOauthDisplayNameRepair({
        storedFullName: "jonas.p",
        profileEmail: "jonas.p@example.lt",
        userEmail: null,
        userMetadata: meta,
      }),
    ).toEqual({ repair: true, providerName: "Jonas Petraitis", syntheticName: "jonas.p" });
  });

  it("compares case-insensitively but returns the EXACT stored value as the CAS guard", () => {
    const r = decideOauthDisplayNameRepair({
      storedFullName: "Jonas.P ",
      profileEmail: "jonas.p@example.lt",
      userEmail: null,
      userMetadata: meta,
    });
    expect(r).toEqual({
      repair: true,
      providerName: "Jonas Petraitis",
      syntheticName: "Jonas.P ",
    });
  });

  it("falls back to the auth user's e-mail when the profile carries none", () => {
    expect(
      decideOauthDisplayNameRepair({
        storedFullName: "jonas.p",
        profileEmail: null,
        userEmail: "jonas.p@example.lt",
        userMetadata: meta,
      }).repair,
    ).toBe(true);
  });

  it("NEVER overwrites a human-entered name", () => {
    expect(
      decideOauthDisplayNameRepair({
        storedFullName: "Jonas P.",
        profileEmail: "jonas.p@example.lt",
        userEmail: null,
        userMetadata: meta,
      }),
    ).toEqual({ repair: false, reason: "stored_not_synthetic" });
  });

  it("does not write an empty name — that is onboarding's job", () => {
    for (const stored of [null, undefined, "", "   "]) {
      expect(
        decideOauthDisplayNameRepair({
          storedFullName: stored,
          profileEmail: "jonas.p@example.lt",
          userEmail: null,
          userMetadata: meta,
        }),
      ).toEqual({ repair: false, reason: "stored_not_synthetic" });
    }
  });

  it("no provider name (password sign-in, or an e-mail-shaped claim) → no repair", () => {
    expect(
      decideOauthDisplayNameRepair({
        storedFullName: "jonas.p",
        profileEmail: "jonas.p@example.lt",
        userEmail: null,
        userMetadata: {},
      }),
    ).toEqual({ repair: false, reason: "no_provider_name" });
    expect(
      decideOauthDisplayNameRepair({
        storedFullName: "jonas.p",
        profileEmail: "jonas.p@example.lt",
        userEmail: null,
        userMetadata: undefined,
      }),
    ).toEqual({ repair: false, reason: "no_provider_name" });
  });

  it("no e-mail anywhere → no repair (nothing to prove the name synthetic)", () => {
    expect(
      decideOauthDisplayNameRepair({
        storedFullName: "jonas.p",
        profileEmail: null,
        userEmail: null,
        userMetadata: meta,
      }),
    ).toEqual({ repair: false, reason: "no_email" });
  });

  it("stored already equals the provider name → nothing to write", () => {
    expect(
      decideOauthDisplayNameRepair({
        storedFullName: "jonas",
        profileEmail: "jonas@example.lt",
        userEmail: null,
        userMetadata: { full_name: "jonas" },
      }).repair,
    ).toBe(false);
  });
});
