import { describe, expect, it } from "vitest";
import {
  isAllowedAuthOrigin,
  parseGoogleSignInBody,
  sha256Hex,
  validateGoogleIdTokenClaims,
} from "./google-id-token";

const CLIENT_ID = "313295493545-test.apps.googleusercontent.com";
const NONCE = "a".repeat(32);
// NONCE CONTRACT: the token's nonce claim carries SHA-256(raw nonce) —
// Google received the hashed nonce, Supabase + our endpoint the raw one.
const HASHED_NONCE = "hash-of-nonce-hex"; // placeholder; claims use this value
const NOW = 1_800_000_000;

const validClaims = {
  aud: CLIENT_ID,
  iss: "https://accounts.google.com",
  exp: String(NOW + 300),
  nonce: HASHED_NONCE,
  sub: "google-user-1",
};

describe("sha256Hex", () => {
  it("produces the known SHA-256 hex vector", async () => {
    // Standard test vector: sha256("abc")
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("differs from its input (raw nonce never equals hashed nonce)", async () => {
    expect(await sha256Hex(NONCE)).not.toBe(NONCE);
  });
});

describe("validateGoogleIdTokenClaims", () => {
  it("accepts a valid claim set", () => {
    expect(
      validateGoogleIdTokenClaims(validClaims, { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE }, NOW),
    ).toEqual({ ok: true });
  });

  it("accepts the non-https issuer variant Google documents", () => {
    expect(
      validateGoogleIdTokenClaims(
        { ...validClaims, iss: "accounts.google.com" },
        { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE },
        NOW,
      ).ok,
    ).toBe(true);
  });

  it("rejects a wrong audience (token minted for another app)", () => {
    const r = validateGoogleIdTokenClaims(
      { ...validClaims, aud: "other-client.apps.googleusercontent.com" },
      { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE },
      NOW,
    );
    expect(r).toEqual({ ok: false, reason: "audience_mismatch" });
  });

  it("rejects a non-Google issuer", () => {
    const r = validateGoogleIdTokenClaims(
      { ...validClaims, iss: "https://evil.example.com" },
      { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE },
      NOW,
    );
    expect(r).toEqual({ ok: false, reason: "issuer_mismatch" });
  });

  it("rejects an expired token", () => {
    const r = validateGoogleIdTokenClaims(
      { ...validClaims, exp: String(NOW - 1) },
      { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE },
      NOW,
    );
    expect(r).toEqual({ ok: false, reason: "token_expired" });
  });

  it("rejects a missing or mismatched nonce (replay protection)", () => {
    expect(
      validateGoogleIdTokenClaims(
        { ...validClaims, nonce: "b".repeat(32) },
        { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "nonce_mismatch" });
    expect(
      validateGoogleIdTokenClaims(
        { ...validClaims, nonce: undefined },
        { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "nonce_mismatch" });
  });

  it("rejects when the feature is unconfigured (empty client id)", () => {
    expect(
      validateGoogleIdTokenClaims(validClaims, { clientId: "", hashedNonce: HASHED_NONCE }, NOW),
    ).toEqual({ ok: false, reason: "client_id_unconfigured" });
  });

  it("rejects a token without a subject", () => {
    expect(
      validateGoogleIdTokenClaims(
        { ...validClaims, sub: undefined },
        { clientId: CLIENT_ID, hashedNonce: HASHED_NONCE },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "missing_subject" });
  });
});

describe("parseGoogleSignInBody", () => {
  const jwt = `${"h".repeat(20)}.${"p".repeat(20)}.${"s".repeat(20)}`;

  it("accepts a structurally valid body", () => {
    expect(
      parseGoogleSignInBody({ credential: jwt, nonce: NONCE, next: "/lt/dashboard" }),
    ).toEqual({ credential: jwt, nonce: NONCE, next: "/lt/dashboard", trace: null });
  });

  it("normalises a missing next to null", () => {
    expect(parseGoogleSignInBody({ credential: jwt, nonce: NONCE })).toEqual({
      credential: jwt,
      nonce: NONCE,
      next: null,
      trace: null,
    });
  });

  it("accepts a bounded hex trace id and drops malformed ones", () => {
    expect(
      parseGoogleSignInBody({ credential: jwt, nonce: NONCE, trace: "abcdef1234567890" })?.trace,
    ).toBe("abcdef1234567890");
    expect(
      parseGoogleSignInBody({ credential: jwt, nonce: NONCE, trace: "<script>" })?.trace,
    ).toBeNull();
    expect(
      parseGoogleSignInBody({ credential: jwt, nonce: NONCE, trace: "x".repeat(400) })?.trace,
    ).toBeNull();
  });

  it("rejects non-JWT credentials and bad nonces", () => {
    expect(parseGoogleSignInBody({ credential: "not-a-jwt", nonce: NONCE })).toBeNull();
    expect(parseGoogleSignInBody({ credential: jwt, nonce: "short" })).toBeNull();
    expect(parseGoogleSignInBody({ credential: jwt, nonce: "!".repeat(32) })).toBeNull();
    expect(parseGoogleSignInBody(null)).toBeNull();
    expect(parseGoogleSignInBody("string")).toBeNull();
  });
});

describe("isAllowedAuthOrigin (CSRF gate)", () => {
  it("accepts only the exact same origin", () => {
    expect(
      isAllowedAuthOrigin("https://labourmarket.ai", "https://labourmarket.ai"),
    ).toBe(true);
  });

  it("rejects cross-site, subdomain, and missing origins", () => {
    expect(
      isAllowedAuthOrigin("https://evil.example.com", "https://labourmarket.ai"),
    ).toBe(false);
    expect(
      isAllowedAuthOrigin("https://app.labourmarket.ai", "https://labourmarket.ai"),
    ).toBe(false);
    expect(isAllowedAuthOrigin(null, "https://labourmarket.ai")).toBe(false);
    expect(isAllowedAuthOrigin("null", "https://labourmarket.ai")).toBe(false);
  });
});
